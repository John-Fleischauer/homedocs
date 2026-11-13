/*
 * Series: a job done again and again — pine straw in the back yard every
 * spring.
 *
 * A series holds what each new round starts from: the places, the checklist,
 * the materials, and who usually does it. Starting a project from it copies
 * those (see `startFromSeries`), each copy linked back to its source so the
 * project can show what it changed (lib/projects/materials.ts). The "how we do
 * it" text is never copied: every project in the series shows the series' one
 * copy, so it cannot drift.
 */

import { and, asc, desc, eq, inArray, isNull, lt, ne, sql } from "drizzle-orm";
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
import {
  contacts,
  logs,
  materials,
  projectItems,
  projects,
  projectSeries,
  projectSeriesItems,
  projectSeriesSpaces,
  projectSpaces,
  spaces,
} from "../db/schema";
import { listNotes } from "../notes/notes";
import { rebuildSeries } from "../search/rebuild";
import { localDay } from "../web/format";
import {
  copyItems,
  copyMaterials,
  listMaterials,
  quantitiesByLine,
  seriesLines,
  touchOwner,
} from "./materials";

export type Series = typeof projectSeries.$inferSelect;

export type SeriesInput = {
  title: string;
  howTo?: string;
  contactId?: string | null;
  spaceIds?: string[];
};

async function assertContact(
  exec: Executor,
  scope: PropertyScope,
  contactId: string | null | undefined,
) {
  if (!contactId) return;
  const found = await exec
    .select({ id: contacts.id })
    .from(contacts)
    .where(liveIn(contacts, scope.propertyId, contactId));
  if (found.length === 0)
    throw new ValidationError("That contact no longer exists.");
}

async function setSpaces(
  tx: Executor,
  scope: PropertyScope,
  seriesId: string,
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
  await tx
    .delete(projectSeriesSpaces)
    .where(eq(projectSeriesSpaces.seriesId, seriesId));
  if (ids.length)
    await tx
      .insert(projectSeriesSpaces)
      .values(ids.map((spaceId) => ({ seriesId, spaceId })));
}

export async function listSeries(exec: Executor, scope: PropertyScope) {
  return exec
    .select({
      id: projectSeries.id,
      title: projectSeries.title,
      projectCount: sql<number>`(select count(*)::int from ${projects} p where p.series_id = project_series.id and p.deleted_at is null)`,
      lastStarted: sql<
        string | null
      >`(select max(p.created_at)::text from ${projects} p where p.series_id = project_series.id and p.deleted_at is null)`,
    })
    .from(projectSeries)
    .where(
      and(
        eq(projectSeries.propertyId, scope.propertyId),
        isNull(projectSeries.deletedAt),
      ),
    )
    .orderBy(asc(projectSeries.title));
}

export async function getSeries(
  exec: Executor,
  scope: PropertyScope,
  id: string,
) {
  const [row] = await exec
    .select()
    .from(projectSeries)
    .where(liveIn(projectSeries, scope.propertyId, id));
  if (!row) throw new NotFoundError("series");
  const [places, items, lines, contact, rounds] = await Promise.all([
    exec
      .select({ id: spaces.id, name: spaces.name })
      .from(projectSeriesSpaces)
      .innerJoin(spaces, eq(spaces.id, projectSeriesSpaces.spaceId))
      .where(
        and(eq(projectSeriesSpaces.seriesId, id), isNull(spaces.deletedAt)),
      )
      .orderBy(asc(spaces.name)),
    exec
      .select({ item: projectSeriesItems, spaceName: spaces.name })
      .from(projectSeriesItems)
      .leftJoin(spaces, eq(spaces.id, projectSeriesItems.spaceId))
      .where(
        and(
          eq(projectSeriesItems.seriesId, id),
          isNull(projectSeriesItems.deletedAt),
        ),
      )
      .orderBy(asc(projectSeriesItems.sort), asc(projectSeriesItems.createdAt)),
    listMaterials(exec, { seriesId: id }),
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
    exec
      .select({
        id: projects.id,
        title: projects.title,
        status: projects.status,
        targetDate: projects.targetDate,
        createdAt: projects.createdAt,
      })
      .from(projects)
      .where(
        and(
          eq(projects.seriesId, id),
          eq(projects.propertyId, scope.propertyId),
          isNull(projects.deletedAt),
        ),
      )
      .orderBy(desc(projects.createdAt)),
  ]);
  const used = await quantitiesByLine(
    exec,
    rounds.map((p) => p.id),
  );
  return {
    ...row,
    places,
    items,
    materials: lines,
    contact: contact[0] ?? null,
    projects: rounds.map((p) => ({
      ...p,
      materials: used.filter((u) => u.projectId === p.id),
    })),
  };
}

/** Notes from every project in the series, newest first: what past rounds learned. */
export async function seriesNotes(
  exec: Executor,
  scope: PropertyScope,
  seriesId: string,
) {
  const ids = await exec
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.seriesId, seriesId),
        eq(projects.propertyId, scope.propertyId),
        isNull(projects.deletedAt),
      ),
    );
  const rows = await Promise.all(
    ids.map((p) => listNotes(exec, scope, { projectId: p.id, limit: 50 })),
  );
  return rows
    .flat()
    .sort((a, b) =>
      a.note.happenedOn < b.note.happenedOn
        ? 1
        : a.note.happenedOn > b.note.happenedOn
          ? -1
          : 0,
    );
}

export async function createSeries(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  input: SeriesInput,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    await assertContact(tx, scope, input.contactId);
    const [row] = await tx
      .insert(projectSeries)
      .values({
        propertyId: scope.propertyId,
        title: requireText(input.title, "Give the series a name."),
        howTo: cleanText(input.howTo),
        contactId: input.contactId || null,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await setSpaces(tx, scope, row!.id, input.spaceIds ?? []);
    await rebuildSeries(tx, row!.id);
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "project_series",
      entityId: row!.id,
      after: { title: row!.title },
    });
    return row!;
  });
}

export async function updateSeries(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
  input: Partial<SeriesInput>,
  expectedUpdatedAt?: Date,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(projectSeries)
      .where(liveIn(projectSeries, scope.propertyId, id))
      .for("update");
    assertFresh("series", current, expectedUpdatedAt);
    await assertContact(tx, scope, input.contactId);
    const patch: Partial<Series> = {};
    if (input.title !== undefined)
      patch.title = requireText(input.title, "Give the series a name.");
    if (input.howTo !== undefined) patch.howTo = cleanText(input.howTo);
    if (input.contactId !== undefined)
      patch.contactId = input.contactId || null;
    const changes = diff(current!, patch);
    if (input.spaceIds !== undefined) {
      await setSpaces(tx, scope, id, input.spaceIds);
      changes.after.spaceIds = input.spaceIds;
    }
    if (Object.keys(changes.after).length === 0) return current!;
    const [row] = await tx
      .update(projectSeries)
      .set({ ...patch, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(projectSeries.id, id))
      .returning();
    await rebuildSeries(tx, id);
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "project_series",
      entityId: id,
      ...changes,
    });
    return row!;
  });
}

/** Its projects keep their materials and checklists; they just stop being compared with anything. */
export async function deleteSeries(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  return inTransaction(exec, (tx) =>
    softDelete(tx, projectSeries, "project_series", scope, id, actor),
  );
}

// ─── the default checklist ───────────────────────────────────────────────────

export async function addSeriesItem(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  seriesId: string,
  input: { text: string; spaceId?: string | null },
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [series] = await tx
      .select({ id: projectSeries.id })
      .from(projectSeries)
      .where(liveIn(projectSeries, scope.propertyId, seriesId));
    if (!series) throw new NotFoundError("series");
    if (input.spaceId) {
      const [s] = await tx
        .select({ id: spaces.id })
        .from(spaces)
        .where(liveIn(spaces, scope.propertyId, input.spaceId));
      if (!s) throw new ValidationError("That place no longer exists.");
    }
    const [row] = await tx
      .insert(projectSeriesItems)
      .values({
        propertyId: scope.propertyId,
        seriesId,
        text: requireText(input.text, "Say what needs doing.", 500),
        spaceId: input.spaceId || null,
        sort: Date.now() % 2_000_000_000,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await touchOwner(tx, { seriesId }, actor);
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "series_item",
      entityId: row!.id,
      after: { text: row!.text },
    });
    return row!;
  });
}

export async function updateSeriesItem(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
  input: { text?: string; spaceId?: string | null },
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(projectSeriesItems)
      .where(liveIn(projectSeriesItems, scope.propertyId, id));
    if (!current) throw new NotFoundError("to-do");
    const patch: Partial<typeof projectSeriesItems.$inferSelect> = {};
    if (input.text !== undefined)
      patch.text = requireText(input.text, "Say what needs doing.", 500);
    if (input.spaceId !== undefined) patch.spaceId = input.spaceId || null;
    const changes = diff(current, patch);
    if (Object.keys(changes.after).length === 0) return current;
    const [row] = await tx
      .update(projectSeriesItems)
      .set({ ...patch, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(projectSeriesItems.id, id))
      .returning();
    await touchOwner(tx, { seriesId: current.seriesId }, actor);
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "series_item",
      entityId: id,
      ...changes,
    });
    return row!;
  });
}

export async function removeSeriesItem(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(projectSeriesItems)
      .where(liveIn(projectSeriesItems, scope.propertyId, id));
    if (!current) throw new NotFoundError("to-do");
    await softDelete(tx, projectSeriesItems, "series_item", scope, id, actor);
    await touchOwner(tx, { seriesId: current.seriesId }, actor);
  });
}

// ─── rounds ──────────────────────────────────────────────────────────────────

/** "Back yard pine straw 2027": this year, unless a round already has that name. */
export async function nextTitle(
  exec: Executor,
  scope: PropertyScope,
  series: Pick<Series, "id" | "title">,
) {
  let year = Number(localDay().slice(0, 4));
  const taken = await exec
    .select({ title: projects.title })
    .from(projects)
    .where(
      and(
        eq(projects.seriesId, series.id),
        eq(projects.propertyId, scope.propertyId),
        isNull(projects.deletedAt),
      ),
    );
  const titles = new Set(taken.map((t) => t.title.toLowerCase()));
  while (titles.has(`${series.title} ${year}`.toLowerCase())) year++;
  return `${series.title} ${year}`;
}

/**
 * Inside createProject's transaction: copy the series' checklist and materials
 * into the new project, and its places and contact when the caller gave none.
 */
export async function startFromSeries(
  tx: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  seriesId: string,
  projectId: string,
  given: { spaceIds?: string[]; contactId?: string | null },
) {
  const [series] = await tx
    .select()
    .from(projectSeries)
    .where(liveIn(projectSeries, scope.propertyId, seriesId));
  if (!series) throw new ValidationError("That series no longer exists.");
  const lines = await seriesLines(tx, seriesId);
  await copyItems(tx, scope, actor, lines.items, projectId);
  await copyMaterials(tx, scope, actor, lines.materials, projectId);
  const patch: Partial<typeof projects.$inferSelect> = { seriesId };
  if (given.contactId === undefined && series.contactId)
    patch.contactId = series.contactId;
  await tx.update(projects).set(patch).where(eq(projects.id, projectId));
  if (given.spaceIds === undefined) {
    const places = await tx
      .select({ spaceId: projectSeriesSpaces.spaceId })
      .from(projectSeriesSpaces)
      .where(eq(projectSeriesSpaces.seriesId, seriesId));
    if (places.length)
      await tx
        .insert(projectSpaces)
        .values(places.map((p) => ({ projectId, spaceId: p.spaceId })));
  }
}

/**
 * "Make this a series": a series from an existing project, which becomes its
 * first round. Its details become the how-to; "only this project" lines stay
 * behind.
 */
export async function createSeriesFromProject(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  projectId: string,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(liveIn(projects, scope.propertyId, projectId))
      .for("update");
    if (!project) throw new NotFoundError("project");
    if (project.seriesId)
      throw new ValidationError("This project is already part of a series.");
    const places = await tx
      .select({ spaceId: projectSpaces.spaceId })
      .from(projectSpaces)
      .where(eq(projectSpaces.projectId, projectId));
    const series = await createSeries(tx, scope, actor, {
      title: project.title.replace(/\s+(19|20)\d\d$/, "") || project.title,
      howTo: project.summary,
      contactId: project.contactId,
      spaceIds: places.map((p) => p.spaceId),
    });

    const items = await tx
      .select()
      .from(projectItems)
      .where(
        and(
          eq(projectItems.projectId, projectId),
          isNull(projectItems.deletedAt),
          eq(projectItems.oneOff, false),
        ),
      );
    for (const item of items) {
      const [copy] = await tx
        .insert(projectSeriesItems)
        .values({
          propertyId: scope.propertyId,
          seriesId: series.id,
          text: item.text,
          spaceId: item.spaceId,
          sort: item.sort,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        })
        .returning();
      await tx
        .update(projectItems)
        .set({ seriesItemId: copy!.id })
        .where(eq(projectItems.id, item.id));
    }
    const lines = await tx
      .select()
      .from(materials)
      .where(
        and(
          eq(materials.projectId, projectId),
          isNull(materials.deletedAt),
          eq(materials.oneOff, false),
        ),
      );
    for (const m of lines) {
      const [copy] = await tx
        .insert(materials)
        .values({
          propertyId: scope.propertyId,
          seriesId: series.id,
          name: m.name,
          supplyId: m.supplyId,
          quantity: m.quantity,
          unit: m.unit,
          spaceId: m.spaceId,
          notes: m.notes,
          sort: m.sort,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        })
        .returning();
      await tx
        .update(materials)
        .set({ seriesMaterialId: copy!.id })
        .where(eq(materials.id, m.id));
    }
    await tx
      .update(projects)
      .set({
        seriesId: series.id,
        updatedAt: new Date(),
        updatedBy: actor.userId,
      })
      .where(eq(projects.id, projectId));
    await touchOwner(tx, { seriesId: series.id }, actor);
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "project",
      entityId: projectId,
      after: { seriesId: series.id },
    });
    return series;
  });
}

// ─── lessons ─────────────────────────────────────────────────────────────────

/** "Next time" lessons from the round before this one. */
export async function lastTimeLessons(
  exec: Executor,
  scope: PropertyScope,
  project: { id: string; seriesId: string | null; createdAt: Date },
) {
  if (!project.seriesId) return [];
  const [previous] = await exec
    .select({ id: projects.id })
    .from(projects)
    .where(
      and(
        eq(projects.seriesId, project.seriesId),
        eq(projects.propertyId, scope.propertyId),
        isNull(projects.deletedAt),
        ne(projects.id, project.id),
        lt(projects.createdAt, project.createdAt),
      ),
    )
    .orderBy(desc(projects.createdAt))
    .limit(1);
  if (!previous) return [];
  const rows = await listNotes(exec, scope, {
    projectId: previous.id,
    limit: 50,
  });
  return rows.filter((r) => r.note.nextTime !== "");
}

/** "Add to Instructions": a note's lesson becomes part of the series' standing instructions. */
export async function appendLessonToHowTo(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  noteId: string,
  expectedSeriesUpdatedAt?: Date,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [note] = await tx
      .select()
      .from(logs)
      .where(liveIn(logs, scope.propertyId, noteId));
    if (!note) throw new NotFoundError("note");
    if (!note.nextTime)
      throw new ValidationError("That note has no “next time” lesson to add.");
    const [project] = note.projectId
      ? await tx
          .select({ seriesId: projects.seriesId })
          .from(projects)
          .where(liveIn(projects, scope.propertyId, note.projectId))
      : [];
    if (!project?.seriesId)
      throw new ValidationError("That note isn’t from a project in a series.");
    const [series] = await tx
      .select()
      .from(projectSeries)
      .where(liveIn(projectSeries, scope.propertyId, project.seriesId))
      .for("update");
    assertFresh("series", series, expectedSeriesUpdatedAt);
    if (series!.howTo.includes(note.nextTime))
      throw new ValidationError("That’s already in the instructions.");
    const howTo = series!.howTo
      ? `${series!.howTo}\n\n${note.nextTime}`
      : note.nextTime;
    const [row] = await tx
      .update(projectSeries)
      .set({ howTo, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(projectSeries.id, series!.id))
      .returning();
    await rebuildSeries(tx, series!.id);
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "project_series",
      entityId: series!.id,
      before: { howTo: series!.howTo },
      after: { howTo, fromNote: noteId },
    });
    return row!;
  });
}
