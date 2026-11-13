/*
 * Fixtures: what's installed — the overhead light, the water heater, the main
 * shutoff. Each can belong to one system (lib/systems). Not inventory: serial numbers, warranties and
 * manuals belong to Homebox, and a fixture links to its Homebox item instead.
 */

import { and, asc, eq, isNull } from "drizzle-orm";
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
import { fixtures, spaces, systems } from "../db/schema";
import { cascadeFixture, rebuildFixture, spacePath } from "../search/rebuild";
import { assertSystem, guessSystemId } from "../systems/systems";

export type Fixture = typeof fixtures.$inferSelect;

/** Suggestions for the category box; free text is fine too. */
export const FIXTURE_CATEGORIES = [
  "Light fixture",
  "Ceiling fan",
  "Shutoff valve",
  "Electrical panel",
  "Water heater",
  "HVAC",
  "Appliance",
  "Plumbing fixture",
  "Smoke / CO detector",
  "Door / lock",
  "Window",
  "Irrigation",
  "Other",
];

export type FixtureInput = {
  name: string;
  spaceId?: string | null;
  /** Undefined on create means "guess from the kind and name" (guessSystemKey); null means none. */
  systemId?: string | null;
  category?: string;
  notes?: string;
  inGuide?: boolean;
  guideNote?: string;
};

async function assertSpace(
  exec: Executor,
  scope: PropertyScope,
  spaceId: string | null,
) {
  if (!spaceId) return;
  const [row] = await exec
    .select({ id: spaces.id })
    .from(spaces)
    .where(liveIn(spaces, scope.propertyId, spaceId));
  if (!row) throw new ValidationError("That place no longer exists.");
}

export async function listFixtures(
  exec: Executor,
  scope: PropertyScope,
  filter: { spaceId?: string; systemId?: string } = {},
) {
  return exec
    .select()
    .from(fixtures)
    .where(
      and(
        eq(fixtures.propertyId, scope.propertyId),
        isNull(fixtures.deletedAt),
        filter.spaceId ? eq(fixtures.spaceId, filter.spaceId) : undefined,
        filter.systemId ? eq(fixtures.systemId, filter.systemId) : undefined,
      ),
    )
    .orderBy(asc(fixtures.name));
}

export async function getFixture(
  exec: Executor,
  scope: PropertyScope,
  id: string,
) {
  const [row] = await exec
    .select()
    .from(fixtures)
    .where(liveIn(fixtures, scope.propertyId, id));
  if (!row) throw new NotFoundError("fixture");
  const [system] = row.systemId
    ? await exec
        .select({ id: systems.id, name: systems.name, icon: systems.icon })
        .from(systems)
        .where(liveIn(systems, scope.propertyId, row.systemId))
    : [];
  return {
    ...row,
    path: await spacePath(exec, row.spaceId),
    system: system ?? null,
  };
}

export async function createFixture(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  input: FixtureInput,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const spaceId = input.spaceId || null;
    await assertSpace(tx, scope, spaceId);
    const systemId =
      input.systemId === undefined
        ? await guessSystemId(tx, scope, input.category, input.name)
        : input.systemId || null;
    await assertSystem(tx, scope, systemId);
    const [row] = await tx
      .insert(fixtures)
      .values({
        propertyId: scope.propertyId,
        spaceId,
        systemId,
        name: requireText(input.name, "Give the fixture a name."),
        category: cleanText(input.category, 100),
        notes: cleanText(input.notes),
        inGuide: input.inGuide ?? false,
        guideNote: cleanText(input.guideNote, 2000),
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await rebuildFixture(tx, row!.id);
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "fixture",
      entityId: row!.id,
      after: { name: row!.name },
    });
    return row!;
  });
}

export async function updateFixture(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
  input: Partial<FixtureInput>,
  expectedUpdatedAt?: Date,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(fixtures)
      .where(liveIn(fixtures, scope.propertyId, id))
      .for("update");
    assertFresh("fixture", current, expectedUpdatedAt);
    const patch: Partial<Fixture> = {};
    if (input.name !== undefined)
      patch.name = requireText(input.name, "Give the fixture a name.");
    if (input.category !== undefined)
      patch.category = cleanText(input.category, 100);
    if (input.notes !== undefined) patch.notes = cleanText(input.notes);
    if (input.inGuide !== undefined) patch.inGuide = input.inGuide;
    if (input.guideNote !== undefined)
      patch.guideNote = cleanText(input.guideNote, 2000);
    if (input.spaceId !== undefined) {
      patch.spaceId = input.spaceId || null;
      await assertSpace(tx, scope, patch.spaceId);
    }
    if (input.systemId !== undefined) {
      patch.systemId = input.systemId || null;
      await assertSystem(tx, scope, patch.systemId);
    }
    const changes = diff(current!, patch);
    if (Object.keys(changes.after).length === 0) return current!;
    const [row] = await tx
      .update(fixtures)
      .set({ ...patch, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(fixtures.id, id))
      .returning();
    if ("name" in changes.after || "spaceId" in changes.after)
      await cascadeFixture(tx, id);
    else await rebuildFixture(tx, id);
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "fixture",
      entityId: id,
      ...changes,
    });
    return row!;
  });
}

export async function deleteFixture(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  return inTransaction(exec, (tx) =>
    softDelete(tx, fixtures, "fixture", scope, id, actor),
  );
}
