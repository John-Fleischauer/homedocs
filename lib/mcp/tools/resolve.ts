/*
 * Records by id or by name.
 *
 * A model talking to a contact says "the living room light", not a uuid, so
 * every tool argument that names a record accepts either. An id is used as-is
 * (and must exist in this property); a name is matched exactly first
 * (case-insensitive), then by similarity. An ambiguous name is refused with the
 * candidates, so the model can ask or pick by id — never guessed.
 */

import { and, eq, isNull, sql } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Executor, PropertyScope } from "../../core/types";
import {
  contacts,
  fixtures,
  projects,
  projectSeries,
  spaces,
  supplies,
  systems,
} from "../../db/schema";
import { ToolRefusal } from "./types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Named = PgTable & {
  id: PgColumn;
  propertyId: PgColumn;
  deletedAt: PgColumn;
};

const KINDS = {
  place: {
    table: spaces,
    name: spaces.name,
    label: "place",
    list: "list_places",
  },
  system: {
    table: systems,
    name: systems.name,
    label: "system",
    list: "list_systems",
  },
  fixture: {
    table: fixtures,
    name: fixtures.name,
    label: "fixture",
    list: "search",
  },
  part: { table: supplies, name: supplies.name, label: "part", list: "search" },
  contact: {
    table: contacts,
    name: contacts.name,
    label: "contact",
    list: "search",
  },
  project: {
    table: projects,
    name: projects.title,
    label: "project",
    list: "list_projects",
  },
  series: {
    table: projectSeries,
    name: projectSeries.title,
    label: "series",
    list: "list_series",
  },
} as const;

export type RefKind = keyof typeof KINDS;

export async function resolveRef(
  exec: Executor,
  scope: PropertyScope,
  kind: RefKind,
  ref: string,
): Promise<string> {
  const { table, name, label, list } = KINDS[kind];
  const t = table as unknown as Named;
  const live = and(eq(t.propertyId, scope.propertyId), isNull(t.deletedAt));
  const value = ref.trim();

  if (UUID.test(value)) {
    const [row] = await exec
      .select({ id: t.id })
      .from(t)
      .where(and(live, eq(t.id, value)));
    if (!row)
      throw new ToolRefusal(
        `No ${label} has the id ${value}.`,
        `Call ${list} to find it.`,
      );
    return row.id as string;
  }

  const exact = await exec
    .select({ id: t.id, name })
    .from(t)
    .where(and(live, sql`lower(${name}) = lower(${value})`))
    .limit(5);
  if (exact.length === 1) return exact[0]!.id as string;

  const candidates =
    exact.length > 1
      ? exact
      : await exec
          .select({ id: t.id, name })
          .from(t)
          .where(
            and(
              live,
              sql`(${name} ilike ${"%" + value.replace(/[%_]/g, "") + "%"} or similarity(${name}, ${value}) > 0.3)`,
            ),
          )
          .orderBy(sql`similarity(${name}, ${value}) desc`)
          .limit(6);

  if (candidates.length === 1) return candidates[0]!.id as string;
  if (candidates.length === 0) {
    throw new ToolRefusal(
      `No ${label} is called “${value}”.`,
      `Call ${list} to see what exists, or create it first.`,
    );
  }
  throw new ToolRefusal(
    `“${value}” matches more than one ${label}: ${candidates.map((c) => `${c.name} (${c.id})`).join("; ")}.`,
    "Ask which one is meant, or pass its id.",
  );
}

export async function optionalRef(
  exec: Executor,
  scope: PropertyScope,
  kind: RefKind,
  ref: string | undefined | null,
): Promise<string | null> {
  return ref && ref.trim() ? resolveRef(exec, scope, kind, ref) : null;
}
