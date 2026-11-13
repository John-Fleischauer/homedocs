/*
 * One search box over everything.
 *
 * Full text first (weighted documents from rebuild.ts, prefix-matched so a
 * half-typed word works), then trigram similarity on names as a fallback for
 * typos ("plumer"). Results are ranked across types in one list.
 */

import { sql } from "drizzle-orm";
import type { Executor, PropertyScope } from "../core/types";

export type SearchKind =
  | "place"
  | "system"
  | "fixture"
  | "part"
  | "note"
  | "contact"
  | "project"
  | "series";

export type SearchHit = {
  kind: SearchKind;
  id: string;
  title: string;
  detail: string;
  rank: number;
};

/** "living rm bulb" → "living:* & rm:* & bulb:*", with anything but letters and digits removed. */
export function prefixQuery(q: string): string | null {
  const words = q
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean)
    .slice(0, 8);
  return words.length ? words.map((w) => `${w}:*`).join(" & ") : null;
}

export async function search(
  exec: Executor,
  scope: PropertyScope,
  q: string,
  limit = 30,
): Promise<SearchHit[]> {
  const tsq = prefixQuery(q);
  if (!tsq) return [];
  const p = scope.propertyId;

  const rows = await exec.execute<SearchHit>(sql`
    with q as (select to_tsquery('english', ${tsq}) as query)
    select * from (
      select 'place' as kind, s.id, s.name as title, s.kind::text as detail, ts_rank(s.search_doc, q.query) as rank
        from spaces s, q where s.property_id = ${p} and s.deleted_at is null and s.search_doc @@ q.query
      union all
      select 'system', y.id, y.name, 'system', ts_rank(y.search_doc, q.query)
        from systems y, q where y.property_id = ${p} and y.deleted_at is null and y.search_doc @@ q.query
      union all
      select 'fixture', f.id, f.name, coalesce(sp.name, ''), ts_rank(f.search_doc, q.query)
        from fixtures f left join spaces sp on sp.id = f.space_id, q
        where f.property_id = ${p} and f.deleted_at is null and f.search_doc @@ q.query
      union all
      select 'part', u.id, u.name, u.category::text, ts_rank(u.search_doc, q.query)
        from supplies u, q where u.property_id = ${p} and u.deleted_at is null and u.search_doc @@ q.query
      union all
      select 'note', l.id, l.title, to_char(l.happened_on, 'Mon D, YYYY'), ts_rank(l.search_doc, q.query) * 0.8
        from logs l, q where l.property_id = ${p} and l.deleted_at is null and l.search_doc @@ q.query
      union all
      select 'contact', c.id, c.name, c.company, ts_rank(c.search_doc, q.query)
        from contacts c, q where c.property_id = ${p} and c.deleted_at is null and c.search_doc @@ q.query
      union all
      select 'project', pr.id, pr.title, replace(pr.status::text, '_', ' '), ts_rank(pr.search_doc, q.query)
        from projects pr, q where pr.property_id = ${p} and pr.deleted_at is null and pr.search_doc @@ q.query
      union all
      select 'series', se.id, se.title, 'series', ts_rank(se.search_doc, q.query)
        from project_series se, q where se.property_id = ${p} and se.deleted_at is null and se.search_doc @@ q.query
    ) hits
    order by rank desc, title
    limit ${limit}`);
  const hits = [...rows];
  if (hits.length > 0) return hits;

  // Nothing matched as words: try names that look like what was typed.
  const typed = q.trim();
  const fuzzy = await exec.execute<SearchHit>(sql`
    select * from (
      select 'place' as kind, id, name as title, kind::text as detail, similarity(name, ${typed}) as rank
        from spaces where property_id = ${p} and deleted_at is null and name % ${typed}
      union all
      select 'system', id, name, 'system', similarity(name, ${typed}) from systems
        where property_id = ${p} and deleted_at is null and name % ${typed}
      union all
      select 'fixture', id, name, category, similarity(name, ${typed}) from fixtures
        where property_id = ${p} and deleted_at is null and name % ${typed}
      union all
      select 'part', id, name, category::text, similarity(name, ${typed}) from supplies
        where property_id = ${p} and deleted_at is null and name % ${typed}
      union all
      select 'contact', id, name, company, similarity(name, ${typed}) from contacts
        where property_id = ${p} and deleted_at is null and name % ${typed}
    ) hits
    order by rank desc
    limit ${limit}`);
  return [...fuzzy];
}

export const KIND_PATH: Record<SearchKind, string> = {
  place: "/places",
  system: "/systems",
  fixture: "/fixtures",
  part: "/parts",
  note: "/notes",
  contact: "/contacts",
  project: "/projects",
  series: "/projects/series",
};
