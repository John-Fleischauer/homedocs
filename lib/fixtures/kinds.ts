/*
 * The family's list of what a fixture can be: the Kind dropdown on the fixture
 * form. Stored on the property; null means DEFAULT_FIXTURE_KINDS.
 *
 * Renaming a kind renames it on the fixtures that have it. Removing one from
 * the list leaves those fixtures alone: they keep the kind, and their form
 * offers it as an extra option.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import { recordAudit } from "../core/audit";
import { inTransaction } from "../core/internal";
import {
  assertCanEdit,
  ValidationError,
  type ActorContext,
  type Executor,
  type PropertyScope,
} from "../core/types";
import { fixtures, properties } from "../db/schema";
import { rebuildFixture } from "../search/rebuild";
import {
  DEFAULT_FIXTURE_KINDS,
  cleanKindNames,
  kindKey,
  listedKind,
} from "./kind-labels";

/** One row of the editor: the kind's name now, and what it was called when the page loaded (absent for a new one). */
export type KindEdit = { name: string; was?: string };

export async function getFixtureKinds(
  exec: Executor,
  scope: PropertyScope,
): Promise<string[]> {
  const [row] = await exec
    .select({ fixtureKinds: properties.fixtureKinds })
    .from(properties)
    .where(eq(properties.id, scope.propertyId));
  // An emptied list goes back to the defaults: a form with nothing to pick is no use.
  return row?.fixtureKinds?.length ? row.fixtureKinds : DEFAULT_FIXTURE_KINDS;
}

/** A kind as a fixture stores it: the list's spelling when the list has it, as typed otherwise. */
export async function fixtureKind(
  exec: Executor,
  scope: PropertyScope,
  value: string,
): Promise<string> {
  if (!value) return value;
  return listedKind(await getFixtureKinds(exec, scope), value) ?? value;
}

function edits(raw: unknown): KindEdit[] {
  if (!Array.isArray(raw))
    throw new ValidationError("List didn’t come through. Try again.");
  return raw
    .filter((e): e is KindEdit => !!e && typeof e === "object")
    .map((e) => ({
      name: String(e.name ?? ""),
      was: typeof e.was === "string" ? e.was : undefined,
    }));
}

/** The list a set of edits leaves: trimmed, de-duplicated (first wins), blanks dropped. */
export function cleanFixtureKinds(raw: unknown): string[] {
  return cleanKindNames(edits(raw).map((e) => e.name));
}

export async function saveFixtureKinds(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  raw: unknown,
) {
  assertCanEdit(actor);
  const rows = edits(raw);
  const kinds = cleanKindNames(rows.map((e) => e.name));
  return inTransaction(exec, async (tx) => {
    const before = await getFixtureKinds(tx, scope);
    /* Only a kind that was on the list can be renamed, to a name that is not
       blank. Renamed onto another kind's name, the two merge. */
    const renames = rows.flatMap((e) => {
      const from = e.was === undefined ? undefined : listedKind(before, e.was);
      const to = cleanKindNames([e.name])[0];
      // A row the list's cap dropped renames nothing: its fixtures keep their kind.
      const kept = to ? listedKind(kinds, to) : undefined;
      if (!from || !kept || from === kept) return [];
      return [{ from, to: kept }];
    });
    /* Found before any is changed, so two kinds can swap names. */
    const moved: { id: string; to: string }[] = [];
    for (const { from, to } of renames) {
      const hits = await tx
        .select({ id: fixtures.id })
        .from(fixtures)
        .where(
          and(
            eq(fixtures.propertyId, scope.propertyId),
            isNull(fixtures.deletedAt),
            sql`lower(${fixtures.category}) = ${kindKey(from)}`,
          ),
        );
      moved.push(...hits.map((h) => ({ id: h.id, to })));
    }
    for (const { id, to } of moved) {
      await tx
        .update(fixtures)
        .set({ category: to, updatedAt: new Date(), updatedBy: actor.userId })
        .where(
          and(
            eq(fixtures.id, id),
            eq(fixtures.propertyId, scope.propertyId),
            isNull(fixtures.deletedAt),
          ),
        );
      await rebuildFixture(tx, id);
    }
    await tx
      .update(properties)
      .set({
        fixtureKinds: kinds.length ? kinds : null,
        updatedAt: new Date(),
        updatedBy: actor.userId,
      })
      .where(eq(properties.id, scope.propertyId));
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "property",
      entityId: scope.propertyId,
      after: { fixtureKinds: kinds, renamed: renames },
    });
    return kinds;
  });
}
