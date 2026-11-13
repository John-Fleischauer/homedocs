/*
 * Places: a tree of rooms, floors and outdoor areas.
 *
 * Shaped like Home Assistant's floor › area hierarchy on purpose, so the two can
 * be matched later. Depth is not limited by the schema; the UI encourages two or
 * three levels (House › Main floor › Living room; Yard › Front flowerbed).
 */

import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { diff, recordAudit } from "../core/audit";
import { assertFresh, inTransaction, liveIn } from "../core/internal";
import { cleanText, requireText, softDelete } from "../core/records";
import {
  assertCanEdit,
  NotFoundError,
  ValidationError,
  type ActorContext,
  type Executor,
  type PropertyScope,
} from "../core/types";
import { fixtures, spaces } from "../db/schema";
import {
  cascadeSpace,
  rebuildSpace,
  spacePath,
  subtreeIds,
} from "../search/rebuild";

export type Space = typeof spaces.$inferSelect;
export type SpaceKind = Space["kind"];

export const SPACE_KINDS: { value: SpaceKind; label: string }[] = [
  { value: "room", label: "Room" },
  { value: "floor", label: "Floor or Building" },
  { value: "outdoor", label: "Outdoors" },
  { value: "area", label: "Area (closet, nook, crawlspace)" },
  { value: "other", label: "Other" },
];

function kindOf(raw: string | undefined): SpaceKind | undefined {
  if (raw === undefined) return undefined;
  const hit = SPACE_KINDS.find((k) => k.value === raw);
  if (!hit) throw new ValidationError("Pick what kind of place this is.");
  return hit.value;
}

export async function listSpaces(exec: Executor, scope: PropertyScope) {
  return exec
    .select()
    .from(spaces)
    .where(
      and(eq(spaces.propertyId, scope.propertyId), isNull(spaces.deletedAt)),
    )
    .orderBy(asc(spaces.sort), asc(spaces.name));
}

export type SpaceNode = Space & { children: SpaceNode[]; depth: number };

/** The live places as a tree, roots first. Orphans (parent deleted) surface at the top. */
export function buildTree(rows: Space[]): SpaceNode[] {
  const byId = new Map(
    rows.map((r) => [r.id, { ...r, children: [] as SpaceNode[], depth: 0 }]),
  );
  const roots: SpaceNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const setDepth = (nodes: SpaceNode[], depth: number) => {
    for (const n of nodes) {
      n.depth = depth;
      setDepth(n.children, depth + 1);
    }
  };
  setDepth(roots, 0);
  return roots;
}

/** Flattened in tree order, for a <select>: "Main floor › Living room". */
export function flattenTree(
  roots: SpaceNode[],
): { id: string; label: string; depth: number }[] {
  const out: { id: string; label: string; depth: number }[] = [];
  const walk = (nodes: SpaceNode[], trail: string[]) => {
    for (const n of nodes) {
      const path = [...trail, n.name];
      out.push({ id: n.id, label: path.join(" › "), depth: n.depth });
      walk(n.children, path);
    }
  };
  walk(roots, []);
  return out;
}

export async function getSpace(
  exec: Executor,
  scope: PropertyScope,
  id: string,
) {
  const [row] = await exec
    .select()
    .from(spaces)
    .where(liveIn(spaces, scope.propertyId, id));
  if (!row) throw new NotFoundError("place");
  const path = await spacePath(exec, row.parentId);
  const children = await exec
    .select()
    .from(spaces)
    .where(and(eq(spaces.parentId, id), isNull(spaces.deletedAt)))
    .orderBy(asc(spaces.sort), asc(spaces.name));
  return { ...row, path, children };
}

async function assertParent(
  exec: Executor,
  scope: PropertyScope,
  parentId: string | null,
) {
  if (!parentId) return;
  const [parent] = await exec
    .select({ id: spaces.id })
    .from(spaces)
    .where(liveIn(spaces, scope.propertyId, parentId));
  if (!parent) throw new ValidationError("That place no longer exists.");
}

export type SpaceInput = {
  name: string;
  parentId?: string | null;
  kind?: string;
  notes?: string;
};

export async function createSpace(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  input: SpaceInput,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const parentId = input.parentId || null;
    await assertParent(tx, scope, parentId);
    const [row] = await tx
      .insert(spaces)
      .values({
        propertyId: scope.propertyId,
        name: requireText(input.name, "Give the place a name."),
        parentId,
        kind: kindOf(input.kind) ?? "room",
        notes: cleanText(input.notes),
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await rebuildSpace(tx, row!.id);
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "space",
      entityId: row!.id,
      after: { name: row!.name },
    });
    return row!;
  });
}

export async function updateSpace(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
  input: Partial<SpaceInput>,
  expectedUpdatedAt?: Date,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(spaces)
      .where(liveIn(spaces, scope.propertyId, id))
      .for("update");
    assertFresh("place", current, expectedUpdatedAt);

    const patch: Partial<Space> = {};
    if (input.name !== undefined)
      patch.name = requireText(input.name, "Give the place a name.");
    if (input.kind !== undefined) patch.kind = kindOf(input.kind)!;
    if (input.notes !== undefined) patch.notes = cleanText(input.notes);
    if (input.parentId !== undefined) {
      const parentId = input.parentId || null;
      if (parentId) {
        await assertParent(tx, scope, parentId);
        // A place cannot go inside itself or anything under it.
        if ((await subtreeIds(tx, id)).includes(parentId)) {
          throw new ValidationError("A place can’t go inside itself.");
        }
      }
      patch.parentId = parentId;
    }

    const changes = diff(current!, patch);
    if (Object.keys(changes.after).length === 0) return current!;
    const [row] = await tx
      .update(spaces)
      .set({ ...patch, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(spaces.id, id))
      .returning();
    if (
      "name" in changes.after ||
      "parentId" in changes.after ||
      "kind" in changes.after
    )
      await cascadeSpace(tx, id);
    else await rebuildSpace(tx, id);
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "space",
      entityId: id,
      ...changes,
    });
    return row!;
  });
}

/** Refused while fixtures or places are still inside — move or delete those first. */
export async function deleteSpace(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  return inTransaction(exec, async (tx) => {
    const [kids] = await tx
      .select({ n: count() })
      .from(spaces)
      .where(and(eq(spaces.parentId, id), isNull(spaces.deletedAt)));
    if (Number(kids?.n) > 0)
      throw new ValidationError("Move or delete the places inside it first.");
    const [inside] = await tx
      .select({ n: count() })
      .from(fixtures)
      .where(and(eq(fixtures.spaceId, id), isNull(fixtures.deletedAt)));
    if (Number(inside?.n) > 0) {
      throw new ValidationError(
        `Move or delete the ${inside!.n} fixture${Number(inside!.n) === 1 ? "" : "s"} in it first.`,
      );
    }
    await softDelete(tx, spaces, "space", scope, id, actor);
  });
}

/**
 * For each place, how many fixtures and part uses it holds directly — the
 * line under a place's tile on Home ("3 fixtures · 2 parts").
 */
export async function placeCounts(
  exec: Executor,
  scope: PropertyScope,
): Promise<Map<string, { fixtures: number; parts: number }>> {
  const rows = await exec.execute<{
    space_id: string;
    fixtures: number;
    parts: number;
  }>(sql`
    select s.id as space_id,
      (select count(*)::int from fixtures f where f.space_id = s.id and f.deleted_at is null) as fixtures,
      (select count(*)::int from supply_uses u
         left join fixtures f on f.id = u.fixture_id
         join supplies p on p.id = u.supply_id and p.deleted_at is null
         where u.deleted_at is null
           and (u.space_id = s.id or (f.space_id = s.id and f.deleted_at is null))) as parts
    from spaces s
    where s.property_id = ${scope.propertyId} and s.deleted_at is null
  `);
  return new Map(
    [...rows].map((r) => [
      r.space_id,
      { fixtures: r.fixtures, parts: r.parts },
    ]),
  );
}
