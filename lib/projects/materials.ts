/*
 * Materials, and how a project's lists compare with its series.
 *
 * A material is one line of what a job takes: 8 rolls of pine straw, around the
 * stairs. A series holds the default lines; a new project gets copies, each
 * remembering the series line it came from (`series_material_id`). That link is
 * what lets an open project say "this differs from the series" and, when a
 * person confirms, send the change back. Checklist items work the same way
 * (`project_items.series_item_id`), so the comparison here is written once for
 * both lists.
 *
 * Done and dropped projects are a record of what happened that year, not a
 * proposal, so they are never compared.
 */

import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { diff, recordAudit } from "../core/audit";
import { assertFresh, inTransaction, liveIn } from "../core/internal";
import {
  cleanText,
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
  materials,
  projectItems,
  projects,
  projectSeries,
  projectSeriesItems,
  spaces,
  supplies,
} from "../db/schema";
import { partUnits } from "../parts/parts";
import { rebuildProject, rebuildSeries } from "../search/rebuild";

export type Material = typeof materials.$inferSelect;

const OPEN = ["idea", "planning", "quoted", "scheduled", "in_progress"];

export type MaterialOwner = { projectId: string } | { seriesId: string };

export type MaterialInput = {
  name?: string;
  supplyId?: string | null;
  quantity?: string;
  unit?: string;
  spaceId?: string | null;
  notes?: string;
  /** Project lines only: "only this project". */
  oneOff?: boolean;
};

// ─── owners ──────────────────────────────────────────────────────────────────

async function assertOwner(
  exec: Executor,
  scope: PropertyScope,
  owner: MaterialOwner,
) {
  const found =
    "projectId" in owner
      ? await exec
          .select({ id: projects.id })
          .from(projects)
          .where(liveIn(projects, scope.propertyId, owner.projectId))
      : await exec
          .select({ id: projectSeries.id })
          .from(projectSeries)
          .where(liveIn(projectSeries, scope.propertyId, owner.seriesId));
  if (found.length === 0)
    throw new NotFoundError("projectId" in owner ? "project" : "series");
}

/** Bump the owner's updatedAt (so a series edit makes an open "update series" dialog stale) and its search document. */
export async function touchOwner(
  tx: Executor,
  owner: MaterialOwner,
  actor: ActorContext,
) {
  if ("projectId" in owner) {
    await tx
      .update(projects)
      .set({ updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(projects.id, owner.projectId));
    await rebuildProject(tx, owner.projectId);
  } else {
    await tx
      .update(projectSeries)
      .set({ updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(projectSeries.id, owner.seriesId));
    await rebuildSeries(tx, owner.seriesId);
  }
}

function ownerOf(row: Pick<Material, "projectId" | "seriesId">): MaterialOwner {
  return row.projectId
    ? { projectId: row.projectId }
    : { seriesId: row.seriesId! };
}

// ─── lines ───────────────────────────────────────────────────────────────────

function sayList(units: string[]): string {
  return units.length <= 1
    ? (units[0] ?? "")
    : `${units.slice(0, -1).join(", ")} or ${units.at(-1)}`;
}

/** Name, part and unit together: a linked part fills in the name and unit, and limits the unit to its own. */
async function resolveLine(
  exec: Executor,
  scope: PropertyScope,
  input: MaterialInput,
  current?: Pick<Material, "name" | "supplyId" | "unit">,
) {
  const supplyId =
    input.supplyId !== undefined
      ? input.supplyId || null
      : (current?.supplyId ?? null);
  const part = supplyId
    ? (
        await exec
          .select()
          .from(supplies)
          .where(liveIn(supplies, scope.propertyId, supplyId))
      )[0]
    : undefined;
  if (supplyId && !part)
    throw new ValidationError("That part no longer exists.");

  const typedName = input.name !== undefined ? input.name.trim() : undefined;
  const name = requireText(
    typedName ||
      (input.supplyId ? part?.name : undefined) ||
      current?.name ||
      part?.name,
    "Say what the material is.",
  );

  const typedUnit =
    input.unit !== undefined ? cleanText(input.unit, 30) : undefined;
  let unit =
    typedUnit ??
    (input.supplyId !== undefined && part
      ? part.unit
      : (current?.unit ?? part?.unit ?? ""));
  if (part) {
    const units = partUnits(part);
    if (unit === "") unit = units[0] ?? "";
    const match = units.find((u) => u.toLowerCase() === unit.toLowerCase());
    if (units.length && !match)
      throw new ValidationError(`${part.name} comes by ${sayList(units)}.`);
    unit = match ?? unit;
  }
  return { name, supplyId, unit };
}

async function assertSpace(
  exec: Executor,
  scope: PropertyScope,
  spaceId: string | null | undefined,
) {
  if (!spaceId) return;
  const found = await exec
    .select({ id: spaces.id })
    .from(spaces)
    .where(liveIn(spaces, scope.propertyId, spaceId));
  if (found.length === 0)
    throw new ValidationError("That place no longer exists.");
}

export async function addMaterial(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  owner: MaterialOwner,
  input: MaterialInput,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    await assertOwner(tx, scope, owner);
    if (input.oneOff && !("projectId" in owner))
      throw new ValidationError(
        "Only a project’s materials can be “only this project”.",
      );
    await assertSpace(tx, scope, input.spaceId);
    const line = await resolveLine(tx, scope, input);
    const [row] = await tx
      .insert(materials)
      .values({
        propertyId: scope.propertyId,
        seriesId: "seriesId" in owner ? owner.seriesId : null,
        projectId: "projectId" in owner ? owner.projectId : null,
        ...line,
        quantity: parseQuantity(input.quantity, "Quantity"),
        spaceId: input.spaceId || null,
        notes: cleanText(input.notes, 2000),
        oneOff: input.oneOff ?? false,
        sort: Date.now() % 2_000_000_000,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await touchOwner(tx, owner, actor);
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "material",
      entityId: row!.id,
      after: {
        name: row!.name,
        quantity: row!.quantity,
        unit: row!.unit,
        ...owner,
      },
    });
    return row!;
  });
}

export async function updateMaterial(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
  input: MaterialInput,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(materials)
      .where(liveIn(materials, scope.propertyId, id))
      .for("update");
    if (!current) throw new NotFoundError("material");
    if (input.oneOff && current.seriesId)
      throw new ValidationError(
        "Only a project’s materials can be “only this project”.",
      );
    await assertSpace(tx, scope, input.spaceId);
    const patch: Partial<Material> = {};
    if (
      input.name !== undefined ||
      input.supplyId !== undefined ||
      input.unit !== undefined
    ) {
      Object.assign(patch, await resolveLine(tx, scope, input, current));
    }
    if (input.quantity !== undefined)
      patch.quantity = parseQuantity(input.quantity, "Quantity");
    if (input.spaceId !== undefined) patch.spaceId = input.spaceId || null;
    if (input.notes !== undefined) patch.notes = cleanText(input.notes, 2000);
    if (input.oneOff !== undefined) patch.oneOff = input.oneOff;
    const changes = diff(current, patch);
    if (Object.keys(changes.after).length === 0) return current;
    const [row] = await tx
      .update(materials)
      .set({ ...patch, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(materials.id, id))
      .returning();
    await touchOwner(tx, ownerOf(current), actor);
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "material",
      entityId: id,
      ...changes,
    });
    return row!;
  });
}

export async function removeMaterial(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(materials)
      .where(liveIn(materials, scope.propertyId, id));
    if (!current) throw new NotFoundError("material");
    await softDelete(tx, materials, "material", scope, id, actor);
    await touchOwner(tx, ownerOf(current), actor);
  });
}

/** A project's or a series' lines, in order, with the part's units and the place's name. */
export async function listMaterials(exec: Executor, owner: MaterialOwner) {
  const rows = await exec
    .select({
      material: materials,
      part: {
        name: supplies.name,
        unit: supplies.unit,
        extraUnits: supplies.extraUnits,
      },
      spaceName: spaces.name,
    })
    .from(materials)
    .leftJoin(supplies, eq(supplies.id, materials.supplyId))
    .leftJoin(spaces, eq(spaces.id, materials.spaceId))
    .where(
      and(
        "projectId" in owner
          ? eq(materials.projectId, owner.projectId)
          : eq(materials.seriesId, owner.seriesId),
        isNull(materials.deletedAt),
      ),
    )
    .orderBy(asc(materials.sort), asc(materials.createdAt));
  return rows.map((r) => ({
    ...r.material,
    spaceName: r.spaceName,
    partName: r.part?.name ?? null,
    units: r.part ? partUnits(r.part) : [],
  }));
}

export type MaterialRow = Awaited<ReturnType<typeof listMaterials>>[number];

// ─── comparing a project with its series ─────────────────────────────────────

export type LineStatus = "same" | "changed" | "added" | "one_off";

export type FieldChange = { field: string; before: string; after: string };

export type ListDiff = {
  /** Keyed by the project row's id. */
  rows: Record<
    string,
    { status: LineStatus; seriesRowId: string | null; changes: FieldChange[] }
  >;
  /** Series rows no live project row points to: "In series, not here". */
  missing: string[];
};

type Line = {
  id: string;
  link: string | null;
  oneOff: boolean;
  values: Record<string, string>;
};

/* "8.00" and "8" are the same amount. */
function amount(q: string | null): string {
  return q === null ? "" : String(Number(q));
}

function materialValues(
  m: Pick<
    Material,
    "name" | "supplyId" | "quantity" | "unit" | "spaceId" | "notes"
  >,
) {
  return {
    name: m.name,
    supplyId: m.supplyId ?? "",
    quantity: amount(m.quantity),
    unit: m.unit,
    spaceId: m.spaceId ?? "",
    notes: m.notes,
  };
}

function itemValues(i: { text: string; spaceId: string | null }) {
  return { text: i.text, spaceId: i.spaceId ?? "" };
}

function compare(
  projectLines: Line[],
  seriesLines: { id: string; values: Record<string, string> }[],
): ListDiff {
  const series = new Map(seriesLines.map((s) => [s.id, s]));
  const linked = new Set<string>();
  const rows: ListDiff["rows"] = {};
  for (const line of projectLines) {
    const source = line.link ? series.get(line.link) : undefined;
    if (source) linked.add(source.id);
    if (line.oneOff) {
      rows[line.id] = {
        status: "one_off",
        seriesRowId: source?.id ?? null,
        changes: [],
      };
    } else if (!source) {
      rows[line.id] = { status: "added", seriesRowId: null, changes: [] };
    } else {
      const changes = Object.keys(line.values)
        .filter((k) => line.values[k] !== source.values[k])
        .map((k) => ({
          field: k,
          before: source.values[k] ?? "",
          after: line.values[k] ?? "",
        }));
      rows[line.id] = {
        status: changes.length ? "changed" : "same",
        seriesRowId: source.id,
        changes,
      };
    }
  }
  return {
    rows,
    missing: seriesLines.filter((s) => !linked.has(s.id)).map((s) => s.id),
  };
}

export type SeriesDiff = {
  seriesId: string;
  seriesUpdatedAt: Date;
  materials: ListDiff;
  checklist: ListDiff;
  differs: number;
};

/** How an open project's materials and checklist differ from its series; null when there is nothing to compare. */
export async function seriesDiff(
  exec: Executor,
  scope: PropertyScope,
  projectId: string,
): Promise<SeriesDiff | null> {
  const [project] = await exec
    .select()
    .from(projects)
    .where(liveIn(projects, scope.propertyId, projectId));
  if (!project) throw new NotFoundError("project");
  if (!project.seriesId || !OPEN.includes(project.status)) return null;
  const [series] = await exec
    .select()
    .from(projectSeries)
    .where(liveIn(projectSeries, scope.propertyId, project.seriesId));
  if (!series) return null;

  const [pm, sm, pi, si] = await Promise.all([
    exec
      .select()
      .from(materials)
      .where(
        and(eq(materials.projectId, projectId), isNull(materials.deletedAt)),
      ),
    exec
      .select()
      .from(materials)
      .where(
        and(eq(materials.seriesId, series.id), isNull(materials.deletedAt)),
      ),
    exec
      .select()
      .from(projectItems)
      .where(
        and(
          eq(projectItems.projectId, projectId),
          isNull(projectItems.deletedAt),
        ),
      ),
    exec
      .select()
      .from(projectSeriesItems)
      .where(
        and(
          eq(projectSeriesItems.seriesId, series.id),
          isNull(projectSeriesItems.deletedAt),
        ),
      ),
  ]);
  const m = compare(
    pm.map((r) => ({
      id: r.id,
      link: r.seriesMaterialId,
      oneOff: r.oneOff,
      values: materialValues(r),
    })),
    sm.map((r) => ({ id: r.id, values: materialValues(r) })),
  );
  const c = compare(
    pi.map((r) => ({
      id: r.id,
      link: r.seriesItemId,
      oneOff: r.oneOff,
      values: itemValues(r),
    })),
    si.map((r) => ({ id: r.id, values: itemValues(r) })),
  );
  const count = (d: ListDiff) =>
    Object.values(d.rows).filter(
      (r) => r.status === "changed" || r.status === "added",
    ).length + d.missing.length;
  return {
    seriesId: series.id,
    seriesUpdatedAt: series.updatedAt,
    materials: m,
    checklist: c,
    differs: count(m) + count(c),
  };
}

/**
 * Send a project's differences back to its series, after a person has seen
 * and confirmed them. `pick` names rows by id: a project row that changed or
 * was added, or a series row that is missing from the project (which removes
 * it from the series). 'all' takes every difference except "only this project"
 * lines. `expectedSeriesUpdatedAt` is the series as the confirm dialog showed
 * it; if anyone has changed it since, nothing is written.
 */
export async function updateSeriesFromProject(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  projectId: string,
  pick: "all" | { materials?: string[]; items?: string[] },
  expectedSeriesUpdatedAt: Date | undefined,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(liveIn(projects, scope.propertyId, projectId));
    if (!project) throw new NotFoundError("project");
    if (!project.seriesId)
      throw new ValidationError("This project isn’t part of a series.");
    if (!OPEN.includes(project.status))
      throw new ValidationError(
        "This project is finished; change the series directly.",
      );
    const [series] = await tx
      .select()
      .from(projectSeries)
      .where(liveIn(projectSeries, scope.propertyId, project.seriesId))
      .for("update");
    assertFresh("series", series, expectedSeriesUpdatedAt);
    const d = (await seriesDiff(tx, scope, projectId))!;
    const wanted = (list: string[] | undefined) =>
      pick === "all" ? () => true : (id: string) => (list ?? []).includes(id);
    const wantMaterial = wanted(pick === "all" ? undefined : pick.materials);
    const wantItem = wanted(pick === "all" ? undefined : pick.items);
    let applied = 0;

    // Materials.
    for (const [rowId, r] of Object.entries(d.materials.rows)) {
      if (
        !wantMaterial(rowId) ||
        (r.status !== "changed" && r.status !== "added")
      )
        continue;
      const [line] = await tx
        .select()
        .from(materials)
        .where(eq(materials.id, rowId));
      const values = {
        name: line!.name,
        supplyId: line!.supplyId,
        quantity: line!.quantity,
        unit: line!.unit,
        spaceId: line!.spaceId,
        notes: line!.notes,
      };
      if (r.status === "changed") {
        const [before] = await tx
          .select()
          .from(materials)
          .where(eq(materials.id, r.seriesRowId!));
        await tx
          .update(materials)
          .set({ ...values, updatedAt: new Date(), updatedBy: actor.userId })
          .where(eq(materials.id, r.seriesRowId!));
        await recordAudit(tx, actor, {
          action: "update",
          entityType: "material",
          entityId: r.seriesRowId!,
          ...diff(before!, values),
        });
      } else {
        const [added] = await tx
          .insert(materials)
          .values({
            propertyId: scope.propertyId,
            seriesId: series!.id,
            ...values,
            sort: line!.sort,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          })
          .returning();
        await tx
          .update(materials)
          .set({ seriesMaterialId: added!.id })
          .where(eq(materials.id, rowId));
        await recordAudit(tx, actor, {
          action: "create",
          entityType: "material",
          entityId: added!.id,
          after: { name: added!.name, seriesId: series!.id },
        });
      }
      applied++;
    }
    for (const seriesRowId of d.materials.missing) {
      if (!wantMaterial(seriesRowId)) continue;
      await softDelete(tx, materials, "material", scope, seriesRowId, actor);
      applied++;
    }

    // Checklist.
    for (const [rowId, r] of Object.entries(d.checklist.rows)) {
      if (!wantItem(rowId) || (r.status !== "changed" && r.status !== "added"))
        continue;
      const [item] = await tx
        .select()
        .from(projectItems)
        .where(eq(projectItems.id, rowId));
      const values = { text: item!.text, spaceId: item!.spaceId };
      if (r.status === "changed") {
        const [before] = await tx
          .select()
          .from(projectSeriesItems)
          .where(eq(projectSeriesItems.id, r.seriesRowId!));
        await tx
          .update(projectSeriesItems)
          .set({ ...values, updatedAt: new Date(), updatedBy: actor.userId })
          .where(eq(projectSeriesItems.id, r.seriesRowId!));
        await recordAudit(tx, actor, {
          action: "update",
          entityType: "series_item",
          entityId: r.seriesRowId!,
          ...diff(before!, values),
        });
      } else {
        const [added] = await tx
          .insert(projectSeriesItems)
          .values({
            propertyId: scope.propertyId,
            seriesId: series!.id,
            ...values,
            sort: item!.sort,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          })
          .returning();
        await tx
          .update(projectItems)
          .set({ seriesItemId: added!.id })
          .where(eq(projectItems.id, rowId));
        await recordAudit(tx, actor, {
          action: "create",
          entityType: "series_item",
          entityId: added!.id,
          after: { text: added!.text, seriesId: series!.id },
        });
      }
      applied++;
    }
    for (const seriesRowId of d.checklist.missing) {
      if (!wantItem(seriesRowId)) continue;
      await softDelete(
        tx,
        projectSeriesItems,
        "series_item",
        scope,
        seriesRowId,
        actor,
      );
      applied++;
    }

    if (applied > 0) await touchOwner(tx, { seriesId: series!.id }, actor);
    return { applied };
  });
}

/** The other way to settle "In series, not here": copy the series line into this project after all. */
export async function copySeriesLineToProject(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  projectId: string,
  line: { material: string } | { item: string },
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [project] = await tx
      .select()
      .from(projects)
      .where(liveIn(projects, scope.propertyId, projectId));
    if (!project?.seriesId) throw new NotFoundError("project");
    if ("material" in line) {
      const [source] = await tx
        .select()
        .from(materials)
        .where(
          and(
            liveIn(materials, scope.propertyId, line.material),
            eq(materials.seriesId, project.seriesId),
          ),
        );
      if (!source) throw new NotFoundError("material");
      await copyMaterials(tx, scope, actor, [source], projectId);
    } else {
      const [source] = await tx
        .select()
        .from(projectSeriesItems)
        .where(
          and(
            liveIn(projectSeriesItems, scope.propertyId, line.item),
            eq(projectSeriesItems.seriesId, project.seriesId),
          ),
        );
      if (!source) throw new NotFoundError("to-do");
      await copyItems(tx, scope, actor, [source], projectId);
    }
    await touchOwner(tx, { projectId }, actor);
  });
}

/** Copies of series lines on a project, each linked back to its source. */
export async function copyMaterials(
  tx: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  rows: Material[],
  projectId: string,
) {
  if (rows.length === 0) return;
  const added = await tx
    .insert(materials)
    .values(
      rows.map((m) => ({
        propertyId: scope.propertyId,
        projectId,
        name: m.name,
        supplyId: m.supplyId,
        quantity: m.quantity,
        unit: m.unit,
        spaceId: m.spaceId,
        notes: m.notes,
        seriesMaterialId: m.id,
        sort: m.sort,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })),
    )
    .returning({ id: materials.id, name: materials.name });
  for (const a of added) {
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "material",
      entityId: a.id,
      after: { name: a.name, projectId },
    });
  }
}

export async function copyItems(
  tx: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  rows: (typeof projectSeriesItems.$inferSelect)[],
  projectId: string,
) {
  if (rows.length === 0) return;
  const added = await tx
    .insert(projectItems)
    .values(
      rows.map((i) => ({
        propertyId: scope.propertyId,
        projectId,
        text: i.text,
        spaceId: i.spaceId,
        seriesItemId: i.id,
        sort: i.sort,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })),
    )
    .returning({ id: projectItems.id, text: projectItems.text });
  for (const a of added) {
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "project_item",
      entityId: a.id,
      after: { text: a.text },
    });
  }
}

/** Live series lines, for copying into a new project. */
export async function seriesLines(exec: Executor, seriesId: string) {
  const [m, i] = await Promise.all([
    exec
      .select()
      .from(materials)
      .where(and(eq(materials.seriesId, seriesId), isNull(materials.deletedAt)))
      .orderBy(asc(materials.sort), asc(materials.createdAt)),
    exec
      .select()
      .from(projectSeriesItems)
      .where(
        and(
          eq(projectSeriesItems.seriesId, seriesId),
          isNull(projectSeriesItems.deletedAt),
        ),
      )
      .orderBy(asc(projectSeriesItems.sort), asc(projectSeriesItems.createdAt)),
  ]);
  return { materials: m, items: i };
}

/** Quantities per series line across projects, for the series' history table. */
export async function quantitiesByLine(exec: Executor, projectIds: string[]) {
  if (projectIds.length === 0) return [];
  return exec
    .select({
      projectId: materials.projectId,
      seriesMaterialId: materials.seriesMaterialId,
      name: materials.name,
      quantity: materials.quantity,
      unit: materials.unit,
      oneOff: materials.oneOff,
      notes: materials.notes,
    })
    .from(materials)
    .where(
      and(
        inArray(materials.projectId, projectIds),
        isNull(materials.deletedAt),
      ),
    );
}
