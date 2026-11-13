/*
 * Projects: known maintenance and improvement jobs, tracked to done.
 *
 * Deliberately light. A project has a status, the places it touches, a
 * checklist ("add 2 outlets in the garage while the electrician is here"), and
 * the quotes received for it. Accepting a quote moves the project to
 * `scheduled` and declines the others — the one piece of workflow worth
 * automating.
 *
 * A project can be one round of a series (lib/projects/series.ts), which it
 * starts from and can send changes back to.
 */

import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { diff, recordAudit } from "../core/audit";
import { assertFresh, inTransaction, liveIn } from "../core/internal";
import {
  cleanText,
  parseDate,
  parseMoney,
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
  projectItems,
  projects,
  projectSeries,
  projectSpaces,
  quotes,
  spaces,
} from "../db/schema";
import { cascadeProject, rebuildProject } from "../search/rebuild";
import { listMaterials, seriesDiff } from "./materials";
import { lastTimeLessons, startFromSeries } from "./series";

export type Project = typeof projects.$inferSelect;
export type ProjectStatus = Project["status"];
export type Quote = typeof quotes.$inferSelect;

export const STATUSES: ProjectStatus[] = [
  "idea",
  "planning",
  "quoted",
  "scheduled",
  "in_progress",
  "done",
  "dropped",
];
export const OPEN_STATUSES: ProjectStatus[] = [
  "idea",
  "planning",
  "quoted",
  "scheduled",
  "in_progress",
];

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  idea: "Idea",
  planning: "Planning",
  quoted: "Getting Quotes",
  scheduled: "Scheduled",
  in_progress: "In Progress",
  done: "Done",
  dropped: "Dropped",
};

export const PRIORITY_LABEL = {
  low: "Someday",
  normal: "Normal",
  high: "Soon",
} as const;

function status(raw: string | undefined): ProjectStatus | undefined {
  if (raw === undefined) return undefined;
  if (!(STATUSES as string[]).includes(raw))
    throw new ValidationError("Pick a status.");
  return raw as ProjectStatus;
}

function priority(raw: string | undefined): Project["priority"] | undefined {
  if (raw === undefined) return undefined;
  if (!(raw in PRIORITY_LABEL)) throw new ValidationError("Pick how soon.");
  return raw as Project["priority"];
}

export type ProjectInput = {
  title: string;
  status?: string;
  priority?: string;
  targetDate?: string;
  summary?: string;
  spaceIds?: string[];
  /** Start from this series: its checklist, materials, and (unless given) places and contact. */
  seriesId?: string | null;
  contactId?: string | null;
};

async function assertContact(
  exec: Executor,
  scope: PropertyScope,
  contactId: string | null | undefined,
) {
  if (!contactId) return;
  const [c] = await exec
    .select({ id: contacts.id })
    .from(contacts)
    .where(liveIn(contacts, scope.propertyId, contactId));
  if (!c) throw new ValidationError("That contact no longer exists.");
}

async function setSpaces(
  tx: Executor,
  scope: PropertyScope,
  projectId: string,
  spaceIds: string[],
) {
  const ids = [...new Set(spaceIds.filter(Boolean))];
  if (ids.length) {
    const found = await tx
      .select({ id: spaces.id })
      .from(spaces)
      .where(
        and(
          inArray(spaces.id, ids),
          eq(spaces.propertyId, scope.propertyId),
          isNull(spaces.deletedAt),
        ),
      );
    if (found.length !== ids.length)
      throw new ValidationError("One of those places no longer exists.");
  }
  await tx.delete(projectSpaces).where(eq(projectSpaces.projectId, projectId));
  if (ids.length)
    await tx
      .insert(projectSpaces)
      .values(ids.map((spaceId) => ({ projectId, spaceId })));
}

export async function listProjects(
  exec: Executor,
  scope: PropertyScope,
  filter: { statuses?: ProjectStatus[] } = {},
) {
  return exec
    .select({
      id: projects.id,
      title: projects.title,
      status: projects.status,
      priority: projects.priority,
      targetDate: projects.targetDate,
      updatedAt: projects.updatedAt,
      openItems: sql<number>`(select count(*)::int from ${projectItems} i where i.project_id = projects.id and i.deleted_at is null and not i.done)`,
      quoteCount: sql<number>`(select count(*)::int from ${quotes} q where q.project_id = projects.id and q.deleted_at is null)`,
    })
    .from(projects)
    .where(
      and(
        eq(projects.propertyId, scope.propertyId),
        isNull(projects.deletedAt),
        filter.statuses ? inArray(projects.status, filter.statuses) : undefined,
      ),
    )
    .orderBy(
      sql`case ${projects.priority} when 'high' then 0 when 'normal' then 1 else 2 end`,
      desc(projects.updatedAt),
    );
}

export async function getProject(
  exec: Executor,
  scope: PropertyScope,
  id: string,
) {
  const [row] = await exec
    .select()
    .from(projects)
    .where(liveIn(projects, scope.propertyId, id));
  if (!row) throw new NotFoundError("project");
  const [places, items, quoteRows, lines, series, contact, diff, lessons] =
    await Promise.all([
      exec
        .select({ id: spaces.id, name: spaces.name })
        .from(projectSpaces)
        .innerJoin(spaces, eq(spaces.id, projectSpaces.spaceId))
        .where(and(eq(projectSpaces.projectId, id), isNull(spaces.deletedAt)))
        .orderBy(asc(spaces.name)),
      exec
        .select({ item: projectItems, spaceName: spaces.name })
        .from(projectItems)
        .leftJoin(spaces, eq(spaces.id, projectItems.spaceId))
        .where(
          and(eq(projectItems.projectId, id), isNull(projectItems.deletedAt)),
        )
        .orderBy(
          asc(projectItems.done),
          asc(projectItems.sort),
          asc(projectItems.createdAt),
        ),
      exec
        .select({
          quote: quotes,
          contactName: contacts.name,
          contactCompany: contacts.company,
        })
        .from(quotes)
        .leftJoin(contacts, eq(contacts.id, quotes.contactId))
        .where(and(eq(quotes.projectId, id), isNull(quotes.deletedAt)))
        .orderBy(asc(quotes.createdAt)),
      listMaterials(exec, { projectId: id }),
      row.seriesId
        ? exec
            .select({
              id: projectSeries.id,
              title: projectSeries.title,
              howTo: projectSeries.howTo,
              updatedAt: projectSeries.updatedAt,
            })
            .from(projectSeries)
            .where(liveIn(projectSeries, scope.propertyId, row.seriesId))
        : Promise.resolve([]),
      row.contactId
        ? exec
            .select({
              id: contacts.id,
              name: contacts.name,
              company: contacts.company,
            })
            .from(contacts)
            .where(liveIn(contacts, scope.propertyId, row.contactId))
        : Promise.resolve([]),
      seriesDiff(exec, scope, id),
      lastTimeLessons(exec, scope, row),
    ]);
  return {
    ...row,
    places,
    items,
    quotes: quoteRows,
    materials: lines,
    series: series[0] ?? null,
    contact: contact[0] ?? null,
    diff,
    lessons,
  };
}

export async function createProject(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  input: ProjectInput,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    await assertContact(tx, scope, input.contactId);
    const [row] = await tx
      .insert(projects)
      .values({
        propertyId: scope.propertyId,
        title: requireText(input.title, "Give the project a name."),
        status: status(input.status) ?? "idea",
        priority: priority(input.priority) ?? "normal",
        targetDate: parseDate(input.targetDate, "Target date"),
        summary: cleanText(input.summary),
        contactId: input.contactId || null,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    if (input.spaceIds !== undefined || !input.seriesId)
      await setSpaces(tx, scope, row!.id, input.spaceIds ?? []);
    if (input.seriesId) {
      await startFromSeries(tx, scope, actor, input.seriesId, row!.id, {
        spaceIds: input.spaceIds,
        contactId: input.contactId,
      });
    }
    await rebuildProject(tx, row!.id);
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "project",
      entityId: row!.id,
      after: {
        title: row!.title,
        ...(input.seriesId ? { seriesId: input.seriesId } : {}),
      },
    });
    const [created] = await tx
      .select()
      .from(projects)
      .where(eq(projects.id, row!.id));
    return created!;
  });
}

export async function updateProject(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
  input: Partial<ProjectInput>,
  expectedUpdatedAt?: Date,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(projects)
      .where(liveIn(projects, scope.propertyId, id))
      .for("update");
    assertFresh("project", current, expectedUpdatedAt);
    await assertContact(tx, scope, input.contactId);
    const patch: Partial<Project> = {};
    if (input.title !== undefined)
      patch.title = requireText(input.title, "Give the project a name.");
    if (input.status !== undefined) patch.status = status(input.status)!;
    if (input.priority !== undefined)
      patch.priority = priority(input.priority)!;
    if (input.targetDate !== undefined)
      patch.targetDate = parseDate(input.targetDate, "Target date");
    if (input.summary !== undefined) patch.summary = cleanText(input.summary);
    if (input.contactId !== undefined)
      patch.contactId = input.contactId || null;
    const changes = diff(current!, patch);
    if (input.spaceIds !== undefined) {
      await setSpaces(tx, scope, id, input.spaceIds);
      changes.after.spaceIds = input.spaceIds;
    }
    if (Object.keys(changes.after).length === 0) return current!;
    const [row] = await tx
      .update(projects)
      .set({ ...patch, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(projects.id, id))
      .returning();
    await cascadeProject(tx, id);
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "project",
      entityId: id,
      ...changes,
    });
    return row!;
  });
}

export async function setProjectStatus(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
  next: string,
) {
  return updateProject(exec, scope, actor, id, { status: next });
}

export async function deleteProject(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  return inTransaction(exec, (tx) =>
    softDelete(tx, projects, "project", scope, id, actor),
  );
}

// ─── checklist ───────────────────────────────────────────────────────────────

export async function addItem(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  projectId: string,
  input: {
    text: string;
    spaceId?: string | null;
    quoteId?: string | null;
    oneOff?: boolean;
  },
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    await getProject(tx, scope, projectId);
    const [row] = await tx
      .insert(projectItems)
      .values({
        propertyId: scope.propertyId,
        projectId,
        text: requireText(input.text, "Say what needs doing.", 500),
        spaceId: input.spaceId || null,
        quoteId: input.quoteId || null,
        oneOff: input.oneOff ?? false,
        sort: Date.now() % 2_000_000_000,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await touch(tx, projectId, actor);
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "project_item",
      entityId: row!.id,
      after: { text: row!.text },
    });
    return row!;
  });
}

export async function updateItem(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
  input: {
    text?: string;
    done?: boolean;
    spaceId?: string | null;
    quoteId?: string | null;
    oneOff?: boolean;
  },
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(projectItems)
      .where(liveIn(projectItems, scope.propertyId, id));
    if (!current) throw new NotFoundError("to-do");
    const patch: Partial<typeof projectItems.$inferSelect> = {};
    if (input.text !== undefined)
      patch.text = requireText(input.text, "Say what needs doing.", 500);
    if (input.done !== undefined) patch.done = input.done;
    if (input.spaceId !== undefined) patch.spaceId = input.spaceId || null;
    if (input.quoteId !== undefined) patch.quoteId = input.quoteId || null;
    if (input.oneOff !== undefined) patch.oneOff = input.oneOff;
    const changes = diff(current, patch);
    if (Object.keys(changes.after).length === 0) return current;
    const [row] = await tx
      .update(projectItems)
      .set({ ...patch, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(projectItems.id, id))
      .returning();
    await touch(tx, current.projectId, actor);
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "project_item",
      entityId: id,
      ...changes,
    });
    return row!;
  });
}

export async function removeItem(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  return inTransaction(exec, (tx) =>
    softDelete(tx, projectItems, "project_item", scope, id, actor),
  );
}

// ─── quotes ──────────────────────────────────────────────────────────────────

export type QuoteInput = {
  contactId?: string | null;
  amount?: string;
  receivedOn?: string;
  notes?: string;
};

export async function addQuote(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  projectId: string,
  input: QuoteInput,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const project = await getProject(tx, scope, projectId);
    if (input.contactId) {
      const [c] = await tx
        .select({ id: contacts.id })
        .from(contacts)
        .where(liveIn(contacts, scope.propertyId, input.contactId));
      if (!c) throw new ValidationError("That contact no longer exists.");
    }
    const [row] = await tx
      .insert(quotes)
      .values({
        propertyId: scope.propertyId,
        projectId,
        contactId: input.contactId || null,
        amount: parseMoney(input.amount),
        receivedOn: parseDate(input.receivedOn, "Date"),
        notes: cleanText(input.notes),
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    // A first quote on an idea means it is now being priced.
    if (["idea", "planning"].includes(project.status)) {
      await tx
        .update(projects)
        .set({
          status: "quoted",
          updatedAt: new Date(),
          updatedBy: actor.userId,
        })
        .where(eq(projects.id, projectId));
    } else {
      await touch(tx, projectId, actor);
    }
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "quote",
      entityId: row!.id,
      after: { projectId, amount: row!.amount },
    });
    return row!;
  });
}

export async function updateQuote(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
  input: QuoteInput & { status?: Quote["status"] },
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(quotes)
      .where(liveIn(quotes, scope.propertyId, id))
      .for("update");
    if (!current) throw new NotFoundError("quote");
    const patch: Partial<Quote> = {};
    if (input.contactId !== undefined)
      patch.contactId = input.contactId || null;
    if (input.amount !== undefined) patch.amount = parseMoney(input.amount);
    if (input.receivedOn !== undefined)
      patch.receivedOn = parseDate(input.receivedOn, "Date");
    if (input.notes !== undefined) patch.notes = cleanText(input.notes);
    if (input.status !== undefined) {
      if (!["pending", "accepted", "declined"].includes(input.status))
        throw new ValidationError("Pick a status.");
      patch.status = input.status;
    }
    const changes = diff(current, patch);
    if (Object.keys(changes.after).length === 0) return current;
    const [row] = await tx
      .update(quotes)
      .set({ ...patch, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(quotes.id, id))
      .returning();

    if (patch.status === "accepted") {
      // One accepted quote: the rest are declined, and the job is on the calendar.
      await tx
        .update(quotes)
        .set({
          status: "declined",
          updatedAt: new Date(),
          updatedBy: actor.userId,
        })
        .where(
          and(
            eq(quotes.projectId, current.projectId),
            sql`${quotes.id} <> ${id}`,
            eq(quotes.status, "pending"),
          ),
        );
      await tx
        .update(projects)
        .set({
          status: "scheduled",
          updatedAt: new Date(),
          updatedBy: actor.userId,
        })
        .where(
          and(
            eq(projects.id, current.projectId),
            inArray(projects.status, ["idea", "planning", "quoted"]),
          ),
        );
    } else {
      await touch(tx, current.projectId, actor);
    }
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "quote",
      entityId: id,
      ...changes,
    });
    return row!;
  });
}

export async function removeQuote(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  return inTransaction(exec, async (tx) => {
    await softDelete(tx, quotes, "quote", scope, id, actor);
    await tx
      .update(projectItems)
      .set({ quoteId: null })
      .where(eq(projectItems.quoteId, id));
  });
}

async function touch(tx: Executor, projectId: string, actor: ActorContext) {
  await tx
    .update(projects)
    .set({ updatedAt: new Date(), updatedBy: actor.userId })
    .where(eq(projects.id, projectId));
}
