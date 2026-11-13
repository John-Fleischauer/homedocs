/*
 * Parts — reusable specs — and where they are used.
 *
 * The point of the model: "A19 LED 2700K E26" is defined once and linked to the
 * living-room light, the hall light and the porch light. Change the bulb you buy
 * and every fixture that uses it says so. A part can also be used by a *place*
 * (paint on the bedroom walls, mulch in the front bed), with a quantity and the
 * quantity it really needed.
 */

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { diff, recordAudit } from "../core/audit";
import { assertFresh, inTransaction, liveIn } from "../core/internal";
import {
  cleanText,
  cleanUrl,
  parseQuantity,
  requireText,
  softDelete,
} from "../core/records";
import {
  assertCanEdit,
  NotFoundError,
  ValidationError,
  type ActorContext,
  type Executor,
  type PropertyScope,
} from "../core/types";
import { fixtures, spaces, supplies, supplyUses } from "../db/schema";
import {
  cascadeSupply,
  cascadeUse,
  rebuildSupply,
  spacePath,
} from "../search/rebuild";
import { cleanFields, isCategory, TEMPLATES, type Category } from "./templates";

export type Supply = typeof supplies.$inferSelect;
export type SupplyUse = typeof supplyUses.$inferSelect;

export type PartInput = {
  category: string;
  name: string;
  fields?: Record<string, unknown>;
  unit?: string;
  /** Other units it is sold by, besides `unit`. */
  extraUnits?: string[];
  buyUrl?: string;
  notes?: string;
};

/** Every unit a part is sold by, the default first: ["roll", "bale"]. */
export function partUnits(part: Pick<Supply, "unit" | "extraUnits">): string[] {
  return [part.unit, ...part.extraUnits].filter(Boolean);
}

/* The extra units, tidied: no blanks, no repeats, nothing that repeats the default unit. */
function extraUnits(raw: string[] | undefined, unit: string): string[] {
  const seen = new Set([unit.toLowerCase()]);
  const out: string[] = [];
  for (const u of raw ?? []) {
    const text = cleanText(u, 30);
    if (text === "" || seen.has(text.toLowerCase())) continue;
    seen.add(text.toLowerCase());
    out.push(text);
  }
  if (out.length > 8)
    throw new ValidationError("That’s a lot of units — keep it to eight.");
  return out;
}

function category(raw: string): Category {
  if (!isCategory(raw))
    throw new ValidationError("Pick what kind of part this is.");
  return raw;
}

/** A part named after its most useful fields when the contact left the name blank. */
export function suggestName(
  cat: Category,
  fields: Record<string, string>,
): string {
  switch (cat) {
    case "paint":
      // "Custom match" isn't a code; the name says more.
      return [
        fields.brand,
        /custom/i.test(fields.color_code ?? "") ? "" : fields.color_code,
        fields.color_name,
      ]
        .filter(Boolean)
        .join(" ");
    case "bulb":
      return [fields.shape, fields.base, fields.color_temp, "bulb"]
        .filter(Boolean)
        .join(" ");
    case "filter":
      return [fields.size, fields.rating, "filter"].filter(Boolean).join(" ");
    case "battery":
      return [fields.size, "battery"].filter(Boolean).join(" ");
    case "landscaping":
      return [fields.product, fields.bag_size].filter(Boolean).join(", ");
    default:
      return [fields.brand, fields.model].filter(Boolean).join(" ");
  }
}

export async function listParts(
  exec: Executor,
  scope: PropertyScope,
  filter: { category?: Category } = {},
) {
  return exec
    .select({
      part: supplies,
      uses: sql<number>`(select count(*)::int from ${supplyUses} u where u.supply_id = supplies.id and u.deleted_at is null)`,
    })
    .from(supplies)
    .where(
      and(
        eq(supplies.propertyId, scope.propertyId),
        isNull(supplies.deletedAt),
        filter.category ? eq(supplies.category, filter.category) : undefined,
      ),
    )
    .orderBy(asc(supplies.category), asc(supplies.name));
}

export async function getPart(
  exec: Executor,
  scope: PropertyScope,
  id: string,
) {
  const [row] = await exec
    .select()
    .from(supplies)
    .where(liveIn(supplies, scope.propertyId, id));
  if (!row) throw new NotFoundError("part");
  return row;
}

export async function createPart(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  input: PartInput,
) {
  assertCanEdit(actor);
  const cat = category(input.category);
  const fields = cleanFields(cat, input.fields ?? {});
  const name = (input.name ?? "").trim() || suggestName(cat, fields);
  const unit = cleanText(input.unit, 30) || TEMPLATES[cat].unit;
  return inTransaction(exec, async (tx) => {
    const [row] = await tx
      .insert(supplies)
      .values({
        propertyId: scope.propertyId,
        category: cat,
        name: requireText(
          name,
          "Give the part a name, or fill in a few details.",
        ),
        fields,
        unit,
        extraUnits: extraUnits(input.extraUnits, unit),
        buyUrl: cleanUrl(input.buyUrl),
        notes: cleanText(input.notes),
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await rebuildSupply(tx, row!.id);
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "supply",
      entityId: row!.id,
      after: { name: row!.name },
    });
    return row!;
  });
}

export async function updatePart(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
  input: Partial<PartInput>,
  expectedUpdatedAt?: Date,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(supplies)
      .where(liveIn(supplies, scope.propertyId, id))
      .for("update");
    assertFresh("part", current, expectedUpdatedAt);
    const cat =
      input.category !== undefined
        ? category(input.category)
        : current!.category;
    const patch: Partial<Supply> = {};
    if (input.category !== undefined) patch.category = cat;
    if (input.fields !== undefined)
      patch.fields = cleanFields(cat, input.fields);
    if (input.name !== undefined) {
      patch.name = requireText(
        input.name.trim() || suggestName(cat, patch.fields ?? current!.fields),
        "Give the part a name.",
      );
    }
    if (input.unit !== undefined) patch.unit = cleanText(input.unit, 30);
    if (input.extraUnits !== undefined || input.unit !== undefined) {
      patch.extraUnits = extraUnits(
        input.extraUnits ?? current!.extraUnits,
        patch.unit ?? current!.unit,
      );
    }
    if (input.buyUrl !== undefined) patch.buyUrl = cleanUrl(input.buyUrl);
    if (input.notes !== undefined) patch.notes = cleanText(input.notes);
    const changes = diff(current!, patch);
    if (Object.keys(changes.after).length === 0) return current!;
    const [row] = await tx
      .update(supplies)
      .set({ ...patch, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(supplies.id, id))
      .returning();
    await cascadeSupply(tx, id);
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "supply",
      entityId: id,
      ...changes,
    });
    return row!;
  });
}

export async function deletePart(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  return inTransaction(exec, async (tx) => {
    await softDelete(tx, supplies, "supply", scope, id, actor);
    await cascadeSupply(tx, id);
  });
}

// ─── uses ────────────────────────────────────────────────────────────────────

export type UseInput = {
  supplyId: string;
  fixtureId?: string | null;
  spaceId?: string | null;
  surface?: string;
  finish?: string;
  quantity?: string;
  unit?: string;
  quantityNeeded?: string;
  notes?: string;
};

export type UseView = SupplyUse & {
  part: Pick<Supply, "id" | "name" | "category" | "fields" | "unit">;
  owner: { kind: "fixture" | "place"; id: string; name: string; path: string };
};

async function ownerLabel(exec: Executor, use: SupplyUse) {
  if (use.fixtureId) {
    const [f] = await exec
      .select({
        id: fixtures.id,
        name: fixtures.name,
        spaceId: fixtures.spaceId,
      })
      .from(fixtures)
      .where(eq(fixtures.id, use.fixtureId));
    const path = await spacePath(exec, f?.spaceId ?? null);
    return {
      kind: "fixture" as const,
      id: use.fixtureId,
      name: f?.name ?? "?",
      path: path.map((p) => p.name).join(" › "),
    };
  }
  const path = await spacePath(exec, use.spaceId);
  return {
    kind: "place" as const,
    id: use.spaceId!,
    name: path.at(-1)?.name ?? "?",
    path: path
      .slice(0, -1)
      .map((p) => p.name)
      .join(" › "),
  };
}

/** Uses of parts, filtered by part, fixture or place. */
export async function listUses(
  exec: Executor,
  scope: PropertyScope,
  filter: { supplyId?: string; fixtureId?: string; spaceId?: string },
): Promise<UseView[]> {
  const rows = await exec
    .select({
      use: supplyUses,
      part: {
        id: supplies.id,
        name: supplies.name,
        category: supplies.category,
        fields: supplies.fields,
        unit: supplies.unit,
      },
    })
    .from(supplyUses)
    .innerJoin(supplies, eq(supplies.id, supplyUses.supplyId))
    .leftJoin(fixtures, eq(fixtures.id, supplyUses.fixtureId))
    .leftJoin(spaces, eq(spaces.id, supplyUses.spaceId))
    .where(
      and(
        eq(supplyUses.propertyId, scope.propertyId),
        isNull(supplyUses.deletedAt),
        isNull(supplies.deletedAt),
        // A use whose fixture or place was deleted is hidden along with it.
        sql`(${supplyUses.fixtureId} is null or ${fixtures.deletedAt} is null)`,
        sql`(${supplyUses.spaceId} is null or ${spaces.deletedAt} is null)`,
        filter.supplyId ? eq(supplyUses.supplyId, filter.supplyId) : undefined,
        filter.fixtureId
          ? eq(supplyUses.fixtureId, filter.fixtureId)
          : undefined,
        filter.spaceId ? eq(supplyUses.spaceId, filter.spaceId) : undefined,
      ),
    )
    .orderBy(asc(supplies.name), asc(supplyUses.surface));
  const out: UseView[] = [];
  for (const r of rows)
    out.push({ ...r.use, part: r.part, owner: await ownerLabel(exec, r.use) });
  return out;
}

export async function addUse(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  input: UseInput,
) {
  assertCanEdit(actor);
  const fixtureId = input.fixtureId || null;
  const spaceId = input.spaceId || null;
  if ((fixtureId ? 1 : 0) + (spaceId ? 1 : 0) !== 1)
    throw new ValidationError("Say which fixture or place uses this part.");
  return inTransaction(exec, async (tx) => {
    const part = await getPart(tx, scope, input.supplyId);
    if (fixtureId) {
      const [f] = await tx
        .select({ id: fixtures.id })
        .from(fixtures)
        .where(liveIn(fixtures, scope.propertyId, fixtureId));
      if (!f) throw new ValidationError("That fixture no longer exists.");
    } else {
      const [s] = await tx
        .select({ id: spaces.id })
        .from(spaces)
        .where(liveIn(spaces, scope.propertyId, spaceId!));
      if (!s) throw new ValidationError("That place no longer exists.");
    }
    const surface = cleanText(input.surface, 100);
    const [existing] = await tx
      .select({ id: supplyUses.id })
      .from(supplyUses)
      .where(
        and(
          eq(supplyUses.supplyId, part.id),
          fixtureId
            ? eq(supplyUses.fixtureId, fixtureId)
            : eq(supplyUses.spaceId, spaceId!),
          eq(supplyUses.surface, surface),
          isNull(supplyUses.deletedAt),
        ),
      );
    if (existing) {
      throw new ValidationError(
        surface
          ? `This part is already listed for “${surface}” here.`
          : "This part is already listed here.",
      );
    }
    const [row] = await tx
      .insert(supplyUses)
      .values({
        propertyId: scope.propertyId,
        supplyId: part.id,
        fixtureId,
        spaceId,
        surface,
        finish: cleanText(input.finish, 60),
        quantity: parseQuantity(input.quantity, "How many"),
        unit: cleanText(input.unit, 30) || part.unit,
        quantityNeeded: parseQuantity(
          input.quantityNeeded,
          "How many it really needs",
        ),
        notes: cleanText(input.notes, 2000),
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await cascadeUse(tx, row!);
    await recordAudit(tx, actor, {
      action: "link",
      entityType: "supply_use",
      entityId: row!.id,
      after: { supplyId: part.id, fixtureId, spaceId, surface },
    });
    return row!;
  });
}

export async function updateUse(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
  input: Partial<Omit<UseInput, "supplyId" | "fixtureId" | "spaceId">>,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(supplyUses)
      .where(liveIn(supplyUses, scope.propertyId, id))
      .for("update");
    if (!current) throw new NotFoundError("part use");
    const patch: Partial<SupplyUse> = {};
    if (input.surface !== undefined)
      patch.surface = cleanText(input.surface, 100);
    if (input.finish !== undefined) patch.finish = cleanText(input.finish, 60);
    if (input.quantity !== undefined)
      patch.quantity = parseQuantity(input.quantity, "How many");
    if (input.unit !== undefined) patch.unit = cleanText(input.unit, 30);
    if (input.quantityNeeded !== undefined)
      patch.quantityNeeded = parseQuantity(
        input.quantityNeeded,
        "How many it really needs",
      );
    if (input.notes !== undefined) patch.notes = cleanText(input.notes, 2000);
    const changes = diff(current, patch);
    if (Object.keys(changes.after).length === 0) return current;
    const [row] = await tx
      .update(supplyUses)
      .set({ ...patch, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(supplyUses.id, id))
      .returning();
    await cascadeUse(tx, row!);
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "supply_use",
      entityId: id,
      ...changes,
    });
    return row!;
  });
}

export async function removeUse(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(supplyUses)
      .where(liveIn(supplyUses, scope.propertyId, id));
    if (!current) throw new NotFoundError("part use");
    await softDelete(tx, supplyUses, "supply_use", scope, id, actor);
    await cascadeUse(tx, current);
  });
}

/** The kinds of part a family re-buys, shown on Home: "what size filter do we need?" */
export const REBUY: Category[] = ["filter", "bulb", "battery"];

/**
 * The re-bought parts that something actually uses, each with the names of
 * what uses it ("Furnace", "Living room overhead light"), filters first.
 */
export async function partsToRebuy(exec: Executor, scope: PropertyScope) {
  const rows = await exec
    .select({
      id: supplies.id,
      name: supplies.name,
      category: supplies.category,
      fields: supplies.fields,
      usedBy: sql<string>`coalesce(${fixtures.name}, ${spaces.name})`,
    })
    .from(supplyUses)
    .innerJoin(supplies, eq(supplies.id, supplyUses.supplyId))
    .leftJoin(fixtures, eq(fixtures.id, supplyUses.fixtureId))
    .leftJoin(spaces, eq(spaces.id, supplyUses.spaceId))
    .where(
      and(
        eq(supplyUses.propertyId, scope.propertyId),
        isNull(supplyUses.deletedAt),
        isNull(supplies.deletedAt),
        inArray(supplies.category, REBUY),
        sql`(${supplyUses.fixtureId} is null or ${fixtures.deletedAt} is null)`,
        sql`(${supplyUses.spaceId} is null or ${spaces.deletedAt} is null)`,
      ),
    )
    .orderBy(asc(supplies.name));
  const byPart = new Map<
    string,
    {
      id: string;
      name: string;
      category: Category;
      fields: Record<string, string>;
      usedBy: string[];
    }
  >();
  for (const r of rows) {
    const part = byPart.get(r.id) ?? {
      id: r.id,
      name: r.name,
      category: r.category as Category,
      fields: r.fields as Record<string, string>,
      usedBy: [],
    };
    if (r.usedBy && !part.usedBy.includes(r.usedBy)) part.usedBy.push(r.usedBy);
    byPart.set(r.id, part);
  }
  return [...byPart.values()].sort(
    (a, b) => REBUY.indexOf(a.category) - REBUY.indexOf(b.category),
  );
}
