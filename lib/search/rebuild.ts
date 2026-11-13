/*
 * Search documents, rebuilt in app code inside the same transaction as the write.
 *
 * Why not a generated column: a fixture's document includes the *path of the place
 * it is in* and the *names of the parts it uses*, which live in other rows. That
 * is what lets "living room bulb" find the overhead light. The price is the
 * cascade table below — every write that changes text another row's document
 * includes must rebuild that row too. `rebuildAll()` is the safety net (and what
 * a restore runs).
 *
 *   write                          rebuilds
 *   ─────────────────────────────  ─────────────────────────────────────────────
 *   place renamed / moved          it, every place under it, and every fixture,
 *                                  note and part-use place in that subtree
 *   fixture renamed / moved          it, its parts, its notes
 *   part renamed / fields changed  it, the fixtures and places that use it, its notes
 *   part use added / removed       the part, and the fixture or place it is used by
 *   contact renamed / trades        it, its notes
 *   project renamed                it, its notes
 *   material added / changed /     its project or series (their documents carry
 *     removed                        material names, so "pine straw" finds them)
 *   series renamed / how-to        it
 *   system renamed / deleted /     it, and every fixture in it
 *     restored
 *   fixture's system changed       the fixture (its own rebuild)
 *
 * Weights: A = the record's own name, B = where it is and what it is, C = notes.
 */

import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { Executor } from "../core/types";
import {
  contacts,
  contactTrades,
  fixtures,
  logs,
  materials,
  projects,
  projectSeries,
  spaces,
  supplies,
  supplyUses,
  systems,
} from "../db/schema";
import { TEMPLATES, isCategory } from "../parts/templates";

type Doc = { a?: string[]; b?: string[]; c?: string[] };

function join(parts: (string | null | undefined)[] | undefined): string {
  return (parts ?? [])
    .filter((p): p is string => !!p && p.trim() !== "")
    .join(" ");
}

function vector(doc: Doc) {
  return sql`setweight(to_tsvector('english', ${join(doc.a)}), 'A')
    || setweight(to_tsvector('english', ${join(doc.b)}), 'B')
    || setweight(to_tsvector('english', ${join(doc.c)}), 'C')`;
}

/** Names from the root down to (and including) this place. */
export async function spacePath(
  exec: Executor,
  spaceId: string | null,
): Promise<{ id: string; name: string }[]> {
  if (!spaceId) return [];
  const rows = await exec.execute<{
    id: string;
    name: string;
    depth: number;
  }>(sql`
    with recursive up as (
      select id, name, parent_id, 0 as depth from spaces where id = ${spaceId}
      union all
      select s.id, s.name, s.parent_id, up.depth + 1 from spaces s join up on s.id = up.parent_id
      where up.depth < 20
    )
    select id, name, depth from up order by depth desc`);
  return [...rows].map((r) => ({ id: r.id, name: r.name }));
}

/** This place and every live place under it. */
export async function subtreeIds(
  exec: Executor,
  spaceId: string,
): Promise<string[]> {
  const rows = await exec.execute<{ id: string }>(sql`
    with recursive down as (
      select id, 0 as depth from spaces where id = ${spaceId}
      union all
      select s.id, down.depth + 1 from spaces s join down on s.parent_id = down.id
      where s.deleted_at is null and down.depth < 20
    )
    select id from down`);
  return [...rows].map((r) => r.id);
}

function fieldText(category: string, fields: Record<string, string>): string[] {
  const label = isCategory(category) ? TEMPLATES[category].label : category;
  return [label, ...Object.values(fields ?? {})];
}

export async function rebuildSpace(exec: Executor, id: string) {
  const [row] = await exec.select().from(spaces).where(eq(spaces.id, id));
  if (!row) return;
  const path = await spacePath(exec, row.parentId);
  const used = await exec
    .select({ name: supplies.name, category: supplies.category })
    .from(supplyUses)
    .innerJoin(supplies, eq(supplies.id, supplyUses.supplyId))
    .where(and(eq(supplyUses.spaceId, id), isNull(supplyUses.deletedAt)));
  await exec
    .update(spaces)
    .set({
      searchDoc: vector({
        a: [row.name],
        b: [...path.map((p) => p.name), row.kind],
        c: [
          row.notes,
          ...used.flatMap((u) => [
            u.name,
            isCategory(u.category) ? TEMPLATES[u.category].label : "",
          ]),
        ],
      }),
    } as never)
    .where(eq(spaces.id, id));
}

export async function rebuildFixture(exec: Executor, id: string) {
  const [row] = await exec.select().from(fixtures).where(eq(fixtures.id, id));
  if (!row) return;
  const path = await spacePath(exec, row.spaceId);
  const used = await exec
    .select({
      name: supplies.name,
      category: supplies.category,
      fields: supplies.fields,
    })
    .from(supplyUses)
    .innerJoin(supplies, eq(supplies.id, supplyUses.supplyId))
    .where(
      and(
        eq(supplyUses.fixtureId, id),
        isNull(supplyUses.deletedAt),
        isNull(supplies.deletedAt),
      ),
    );
  const [system] = row.systemId
    ? await exec
        .select({ name: systems.name })
        .from(systems)
        .where(and(eq(systems.id, row.systemId), isNull(systems.deletedAt)))
    : [];
  await exec
    .update(fixtures)
    .set({
      searchDoc: vector({
        a: [row.name],
        b: [
          row.category,
          system?.name ?? "",
          ...path.map((p) => p.name),
          ...used.flatMap((u) => [u.name, ...fieldText(u.category, u.fields)]),
        ],
        c: [row.notes, row.guideNote],
      }),
    } as never)
    .where(eq(fixtures.id, id));
}

export async function rebuildSupply(exec: Executor, id: string) {
  const [row] = await exec.select().from(supplies).where(eq(supplies.id, id));
  if (!row) return;
  const uses = await exec
    .select({
      fixtureName: fixtures.name,
      spaceId: supplyUses.spaceId,
      fixtureSpace: fixtures.spaceId,
      surface: supplyUses.surface,
    })
    .from(supplyUses)
    .leftJoin(fixtures, eq(fixtures.id, supplyUses.fixtureId))
    .where(and(eq(supplyUses.supplyId, id), isNull(supplyUses.deletedAt)));
  const places: string[] = [];
  for (const use of uses) {
    places.push(use.fixtureName ?? "", use.surface);
    for (const p of await spacePath(exec, use.spaceId ?? use.fixtureSpace))
      places.push(p.name);
  }
  await exec
    .update(supplies)
    .set({
      searchDoc: vector({
        a: [row.name],
        b: fieldText(row.category, row.fields),
        c: [row.notes, ...places],
      }),
    } as never)
    .where(eq(supplies.id, id));
}

export async function rebuildLog(exec: Executor, id: string) {
  const [row] = await exec.select().from(logs).where(eq(logs.id, id));
  if (!row) return;
  const names: string[] = [];
  const [fixture] = row.fixtureId
    ? await exec
        .select({ name: fixtures.name, spaceId: fixtures.spaceId })
        .from(fixtures)
        .where(eq(fixtures.id, row.fixtureId))
    : [];
  if (fixture) names.push(fixture.name);
  for (const p of await spacePath(
    exec,
    row.spaceId ?? fixture?.spaceId ?? null,
  ))
    names.push(p.name);
  if (row.supplyId) {
    const [s] = await exec
      .select({
        name: supplies.name,
        category: supplies.category,
        fields: supplies.fields,
      })
      .from(supplies)
      .where(eq(supplies.id, row.supplyId));
    if (s) names.push(s.name, ...fieldText(s.category, s.fields));
  }
  if (row.contactId) {
    const [c] = await exec
      .select({ name: contacts.name, company: contacts.company })
      .from(contacts)
      .where(eq(contacts.id, row.contactId));
    if (c) names.push(c.name, c.company);
  }
  if (row.projectId) {
    const [p] = await exec
      .select({ title: projects.title })
      .from(projects)
      .where(eq(projects.id, row.projectId));
    if (p) names.push(p.title);
  }
  await exec
    .update(logs)
    .set({
      searchDoc: vector({
        a: [row.title],
        b: names,
        c: [row.body, row.nextTime],
      }),
    } as never)
    .where(eq(logs.id, id));
}

export async function rebuildContact(exec: Executor, id: string) {
  const [row] = await exec.select().from(contacts).where(eq(contacts.id, id));
  if (!row) return;
  const trades = await exec
    .select({ trade: contactTrades.trade })
    .from(contactTrades)
    .where(eq(contactTrades.contactId, id));
  await exec
    .update(contacts)
    .set({
      searchDoc: vector({
        a: [row.name, row.company],
        b: trades.map((t) => t.trade),
        c: [
          row.notes,
          ...row.phones.map((p) => p.value),
          ...row.emails.map((e) => e.value),
        ],
      }),
    } as never)
    .where(eq(contacts.id, id));
}

/* Material names are stored on the line (not read from the part), so a part rename needs no cascade here. */
async function materialNames(
  exec: Executor,
  owner: { projectId: string } | { seriesId: string },
) {
  const rows = await exec
    .select({ name: materials.name })
    .from(materials)
    .where(
      and(
        "projectId" in owner
          ? eq(materials.projectId, owner.projectId)
          : eq(materials.seriesId, owner.seriesId),
        isNull(materials.deletedAt),
      ),
    );
  return rows.map((r) => r.name);
}

export async function rebuildProject(exec: Executor, id: string) {
  const [row] = await exec.select().from(projects).where(eq(projects.id, id));
  if (!row) return;
  const names = await materialNames(exec, { projectId: id });
  await exec
    .update(projects)
    .set({
      searchDoc: vector({
        a: [row.title],
        b: [row.status.replace("_", " "), ...names],
        c: [row.summary],
      }),
    } as never)
    .where(eq(projects.id, id));
}

export async function rebuildSeries(exec: Executor, id: string) {
  const [row] = await exec
    .select()
    .from(projectSeries)
    .where(eq(projectSeries.id, id));
  if (!row) return;
  const names = await materialNames(exec, { seriesId: id });
  await exec
    .update(projectSeries)
    .set({
      searchDoc: vector({ a: [row.title], b: names, c: [row.howTo] }),
    } as never)
    .where(eq(projectSeries.id, id));
}

export async function rebuildSystem(exec: Executor, id: string) {
  const [row] = await exec.select().from(systems).where(eq(systems.id, id));
  if (!row) return;
  await exec
    .update(systems)
    .set({
      searchDoc: vector({ a: [row.name], b: row.trades, c: [row.notes] }),
    } as never)
    .where(eq(systems.id, id));
}

// ─── cascades ────────────────────────────────────────────────────────────────

async function each(ids: string[], fn: (id: string) => Promise<void>) {
  for (const id of new Set(ids)) await fn(id);
}

/** A place was renamed or moved. */
export async function cascadeSpace(exec: Executor, spaceId: string) {
  const ids = await subtreeIds(exec, spaceId);
  await each(ids, (id) => rebuildSpace(exec, id));
  if (ids.length === 0) return;
  const fixtureIds = (
    await exec
      .select({ id: fixtures.id })
      .from(fixtures)
      .where(inArray(fixtures.spaceId, ids))
  ).map((t) => t.id);
  await each(fixtureIds, (id) => rebuildFixture(exec, id));
  const notes = await exec
    .select({ id: logs.id })
    .from(logs)
    .where(
      fixtureIds.length
        ? or(inArray(logs.spaceId, ids), inArray(logs.fixtureId, fixtureIds))
        : inArray(logs.spaceId, ids),
    );
  await each(
    notes.map((n) => n.id),
    (id) => rebuildLog(exec, id),
  );
  const parts = await exec
    .select({ id: supplyUses.supplyId })
    .from(supplyUses)
    .where(
      fixtureIds.length
        ? or(
            inArray(supplyUses.spaceId, ids),
            inArray(supplyUses.fixtureId, fixtureIds),
          )
        : inArray(supplyUses.spaceId, ids),
    );
  await each(
    parts.map((p) => p.id),
    (id) => rebuildSupply(exec, id),
  );
}

/** A fixture was renamed or moved. */
export async function cascadeFixture(exec: Executor, fixtureId: string) {
  await rebuildFixture(exec, fixtureId);
  const parts = await exec
    .select({ id: supplyUses.supplyId })
    .from(supplyUses)
    .where(eq(supplyUses.fixtureId, fixtureId));
  await each(
    parts.map((p) => p.id),
    (id) => rebuildSupply(exec, id),
  );
  const notes = await exec
    .select({ id: logs.id })
    .from(logs)
    .where(eq(logs.fixtureId, fixtureId));
  await each(
    notes.map((n) => n.id),
    (id) => rebuildLog(exec, id),
  );
}

/** A part was renamed or its fields changed. */
export async function cascadeSupply(exec: Executor, supplyId: string) {
  await rebuildSupply(exec, supplyId);
  const uses = await exec
    .select({ fixtureId: supplyUses.fixtureId, spaceId: supplyUses.spaceId })
    .from(supplyUses)
    .where(eq(supplyUses.supplyId, supplyId));
  await each(
    uses.flatMap((u) => (u.fixtureId ? [u.fixtureId] : [])),
    (id) => rebuildFixture(exec, id),
  );
  await each(
    uses.flatMap((u) => (u.spaceId ? [u.spaceId] : [])),
    (id) => rebuildSpace(exec, id),
  );
  const notes = await exec
    .select({ id: logs.id })
    .from(logs)
    .where(eq(logs.supplyId, supplyId));
  await each(
    notes.map((n) => n.id),
    (id) => rebuildLog(exec, id),
  );
}

/** A part use was added, changed or removed. */
export async function cascadeUse(
  exec: Executor,
  use: { supplyId: string; fixtureId: string | null; spaceId: string | null },
) {
  await rebuildSupply(exec, use.supplyId);
  if (use.fixtureId) await rebuildFixture(exec, use.fixtureId);
  if (use.spaceId) await rebuildSpace(exec, use.spaceId);
}

export async function cascadeContact(exec: Executor, contactId: string) {
  await rebuildContact(exec, contactId);
  const notes = await exec
    .select({ id: logs.id })
    .from(logs)
    .where(eq(logs.contactId, contactId));
  await each(
    notes.map((n) => n.id),
    (id) => rebuildLog(exec, id),
  );
}

export async function cascadeProject(exec: Executor, projectId: string) {
  await rebuildProject(exec, projectId);
  const notes = await exec
    .select({ id: logs.id })
    .from(logs)
    .where(eq(logs.projectId, projectId));
  await each(
    notes.map((n) => n.id),
    (id) => rebuildLog(exec, id),
  );
}

/** A system was renamed, deleted or restored: its fixtures carry its name. */
export async function cascadeSystem(exec: Executor, systemId: string) {
  await rebuildSystem(exec, systemId);
  const rows = await exec
    .select({ id: fixtures.id })
    .from(fixtures)
    .where(eq(fixtures.systemId, systemId));
  await each(
    rows.map((r) => r.id),
    (id) => rebuildFixture(exec, id),
  );
}

/** Every document, from scratch. After a restore, or if a cascade was ever missed. */
export async function rebuildAll(exec: Executor) {
  for (const r of await exec.select({ id: spaces.id }).from(spaces))
    await rebuildSpace(exec, r.id);
  for (const r of await exec.select({ id: systems.id }).from(systems))
    await rebuildSystem(exec, r.id);
  for (const r of await exec.select({ id: fixtures.id }).from(fixtures))
    await rebuildFixture(exec, r.id);
  for (const r of await exec.select({ id: supplies.id }).from(supplies))
    await rebuildSupply(exec, r.id);
  for (const r of await exec.select({ id: contacts.id }).from(contacts))
    await rebuildContact(exec, r.id);
  for (const r of await exec.select({ id: projects.id }).from(projects))
    await rebuildProject(exec, r.id);
  for (const r of await exec
    .select({ id: projectSeries.id })
    .from(projectSeries))
    await rebuildSeries(exec, r.id);
  for (const r of await exec.select({ id: logs.id }).from(logs))
    await rebuildLog(exec, r.id);
}
