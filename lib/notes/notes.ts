/*
 * Notes: dated records of what happened — "Spring mulch: 12 bags in the front
 * bed", "Replaced the furnace filter" — with a "next time" lesson and an
 * optional date to be reminded of it.
 *
 * The "next time" note is what Homebox and paperless have nowhere to put. It is
 * shown on the place, fixture and part it is about, and on Home when its
 * reminder date comes round.
 */

import { and, asc, desc, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { diff, recordAudit } from "../core/audit";
import { assertFresh, inTransaction, liveIn } from "../core/internal";
import {
  cleanText,
  parseDate,
  parseMoney,
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
import {
  contacts,
  fixtures,
  logs,
  projects,
  spaces,
  supplies,
} from "../db/schema";
import { rebuildLog } from "../search/rebuild";
import { localDay } from "../web/format";

export type Note = typeof logs.$inferSelect;

export type NoteInput = {
  title: string;
  happenedOn?: string;
  body?: string;
  spaceId?: string | null;
  fixtureId?: string | null;
  supplyId?: string | null;
  contactId?: string | null;
  projectId?: string | null;
  quantity?: string;
  unit?: string;
  cost?: string;
  nextTime?: string;
  remindAfter?: string;
};

async function assertLinks(
  exec: Executor,
  scope: PropertyScope,
  input: Partial<NoteInput>,
) {
  const checks: [
    string | null | undefined,
    Parameters<typeof liveIn>[0],
    string,
  ][] = [
    [input.spaceId, spaces, "place"],
    [input.fixtureId, fixtures, "fixture"],
    [input.supplyId, supplies, "part"],
    [input.contactId, contacts, "contact"],
    [input.projectId, projects, "project"],
  ];
  for (const [id, table, label] of checks) {
    if (!id) continue;
    const rows = await exec
      .select({ id: table.id })
      .from(table as never)
      .where(liveIn(table, scope.propertyId, id));
    if (rows.length === 0)
      throw new ValidationError(`That ${label} no longer exists.`);
  }
}

function today(): string {
  return localDay();
}

export async function createNote(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  input: NoteInput,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    await assertLinks(tx, scope, input);
    const [row] = await tx
      .insert(logs)
      .values({
        propertyId: scope.propertyId,
        title: requireText(input.title, "Say what happened in a few words."),
        happenedOn: parseDate(input.happenedOn, "When") ?? today(),
        body: cleanText(input.body),
        spaceId: input.spaceId || null,
        fixtureId: input.fixtureId || null,
        supplyId: input.supplyId || null,
        contactId: input.contactId || null,
        projectId: input.projectId || null,
        quantity: parseQuantity(input.quantity),
        unit: cleanText(input.unit, 30),
        cost: parseMoney(input.cost),
        nextTime: cleanText(input.nextTime, 2000),
        remindAfter: parseDate(input.remindAfter, "Remind me"),
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await rebuildLog(tx, row!.id);
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "log",
      entityId: row!.id,
      after: { title: row!.title },
    });
    return row!;
  });
}

export async function updateNote(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
  input: Partial<NoteInput>,
  expectedUpdatedAt?: Date,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(logs)
      .where(liveIn(logs, scope.propertyId, id))
      .for("update");
    assertFresh("note", current, expectedUpdatedAt);
    await assertLinks(tx, scope, input);
    const patch: Partial<Note> = {};
    if (input.title !== undefined)
      patch.title = requireText(
        input.title,
        "Say what happened in a few words.",
      );
    if (input.happenedOn !== undefined)
      patch.happenedOn =
        parseDate(input.happenedOn, "When") ?? current!.happenedOn;
    if (input.body !== undefined) patch.body = cleanText(input.body);
    for (const key of [
      "spaceId",
      "fixtureId",
      "supplyId",
      "contactId",
      "projectId",
    ] as const) {
      if (input[key] !== undefined) patch[key] = input[key] || null;
    }
    if (input.quantity !== undefined)
      patch.quantity = parseQuantity(input.quantity);
    if (input.unit !== undefined) patch.unit = cleanText(input.unit, 30);
    if (input.cost !== undefined) patch.cost = parseMoney(input.cost);
    if (input.nextTime !== undefined)
      patch.nextTime = cleanText(input.nextTime, 2000);
    if (input.remindAfter !== undefined)
      patch.remindAfter = parseDate(input.remindAfter, "Remind me");
    const changes = diff(current!, patch);
    if (Object.keys(changes.after).length === 0) return current!;
    const [row] = await tx
      .update(logs)
      .set({ ...patch, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(logs.id, id))
      .returning();
    await rebuildLog(tx, id);
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "log",
      entityId: id,
      ...changes,
    });
    return row!;
  });
}

export async function deleteNote(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  return inTransaction(exec, (tx) =>
    softDelete(tx, logs, "log", scope, id, actor),
  );
}

export async function getNote(
  exec: Executor,
  scope: PropertyScope,
  id: string,
) {
  const [row] = await exec
    .select()
    .from(logs)
    .where(liveIn(logs, scope.propertyId, id));
  if (!row) throw new NotFoundError("note");
  return row;
}

export type NoteFilter = {
  id?: string;
  spaceId?: string;
  fixtureId?: string;
  /** Notes about any fixture in this system. */
  systemId?: string;
  supplyId?: string;
  contactId?: string;
  projectId?: string;
  limit?: number;
};

/** Newest first. A place's notes include the notes about fixtures in it. */
export async function listNotes(
  exec: Executor,
  scope: PropertyScope,
  filter: NoteFilter = {},
) {
  return exec
    .select({
      note: logs,
      spaceName: spaces.name,
      fixtureName: fixtures.name,
      supplyName: supplies.name,
      contactName: contacts.name,
      projectTitle: projects.title,
    })
    .from(logs)
    .leftJoin(spaces, eq(spaces.id, logs.spaceId))
    .leftJoin(fixtures, eq(fixtures.id, logs.fixtureId))
    .leftJoin(supplies, eq(supplies.id, logs.supplyId))
    .leftJoin(contacts, eq(contacts.id, logs.contactId))
    .leftJoin(projects, eq(projects.id, logs.projectId))
    .where(
      and(
        eq(logs.propertyId, scope.propertyId),
        isNull(logs.deletedAt),
        filter.id ? eq(logs.id, filter.id) : undefined,
        filter.spaceId
          ? sql`(${logs.spaceId} = ${filter.spaceId} or ${fixtures.spaceId} = ${filter.spaceId})`
          : undefined,
        filter.fixtureId ? eq(logs.fixtureId, filter.fixtureId) : undefined,
        filter.systemId ? eq(fixtures.systemId, filter.systemId) : undefined,
        filter.supplyId ? eq(logs.supplyId, filter.supplyId) : undefined,
        filter.contactId ? eq(logs.contactId, filter.contactId) : undefined,
        filter.projectId ? eq(logs.projectId, filter.projectId) : undefined,
      ),
    )
    .orderBy(desc(logs.happenedOn), desc(logs.createdAt))
    .limit(filter.limit ?? 200);
}

export type NoteRow = Awaited<ReturnType<typeof listNotes>>[number];

/**
 * "Coming up": notes with a next-time lesson whose reminder date is within 30
 * days either side of today — so the mulch note from last April surfaces again
 * in March.
 */
export async function comingUp(
  exec: Executor,
  scope: PropertyScope,
  now = new Date(),
) {
  const day = 24 * 60 * 60 * 1000;
  const from = localDay(new Date(now.getTime() - 30 * day));
  const to = localDay(new Date(now.getTime() + 30 * day));
  return exec
    .select({
      note: logs,
      spaceName: spaces.name,
      fixtureName: fixtures.name,
      supplyName: supplies.name,
    })
    .from(logs)
    .leftJoin(spaces, eq(spaces.id, logs.spaceId))
    .leftJoin(fixtures, eq(fixtures.id, logs.fixtureId))
    .leftJoin(supplies, eq(supplies.id, logs.supplyId))
    .where(
      and(
        eq(logs.propertyId, scope.propertyId),
        isNull(logs.deletedAt),
        gte(logs.remindAfter, from),
        lte(logs.remindAfter, to),
      ),
    )
    .orderBy(asc(logs.remindAfter));
}

/** The latest "next time" lessons about a record, for its page. */
export async function lessons(
  exec: Executor,
  scope: PropertyScope,
  filter: NoteFilter,
) {
  const rows = await listNotes(exec, scope, { ...filter, limit: 50 });
  return rows.filter((r) => r.note.nextTime !== "").slice(0, 3);
}

/** Pull the first number out of a next-time note: "needed 3 more bags" → 3. */
export function numberIn(text: string): number | null {
  const match = /(\d+(?:\.\d+)?)/.exec(text);
  return match ? Number(match[1]) : null;
}

/**
 * What a next-time note says the real amount is, given what was used:
 * "needed 3 more" with 12 used → 15; "get 15 next year" → 15; no number → null.
 */
export function suggestedNeed(
  note: Pick<Note, "nextTime" | "quantity">,
): number | null {
  const n = numberIn(note.nextTime);
  if (n === null) return null;
  const used = note.quantity === null ? null : Number(note.quantity);
  if (/\b(more|extra|additional)\b/i.test(note.nextTime) && used !== null)
    return used + n;
  if (/\b(fewer|less)\b/i.test(note.nextTime) && used !== null)
    return Math.max(0, used - n);
  return n;
}
