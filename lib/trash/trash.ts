/*
 * "Recently deleted": everything soft-deleted in the last 90 days, restorable
 * by any member. A non-technical family member who deletes the wrong thing
 * should be able to fix it without calling anyone.
 */

import { and, desc, eq, gt, isNotNull, sql } from 'drizzle-orm'
import { inTransaction } from '../core/internal'
import { restoreRow } from '../core/records'
import { ValidationError, type ActorContext, type Executor, type PropertyScope } from '../core/types'
import { contacts, fixtures, logs, projects, projectSeries, spaces, supplies, systems, users } from '../db/schema'
import {
  cascadeContact,
  cascadeFixture,
  cascadeProject,
  cascadeSpace,
  cascadeSupply,
  cascadeSystem,
  rebuildLog,
  rebuildSeries,
} from '../search/rebuild'

const TABLES = {
  place: { table: spaces, entity: 'space', title: spaces.name, cascade: cascadeSpace },
  system: { table: systems, entity: 'system', title: systems.name, cascade: cascadeSystem },
  fixture: { table: fixtures, entity: 'fixture', title: fixtures.name, cascade: cascadeFixture },
  part: { table: supplies, entity: 'supply', title: supplies.name, cascade: cascadeSupply },
  note: { table: logs, entity: 'log', title: logs.title, cascade: rebuildLog },
  contact: { table: contacts, entity: 'contact', title: contacts.name, cascade: cascadeContact },
  project: { table: projects, entity: 'project', title: projects.title, cascade: cascadeProject },
  series: { table: projectSeries, entity: 'project_series', title: projectSeries.title, cascade: rebuildSeries },
} as const

export type TrashKind = keyof typeof TABLES

export const TRASH_KINDS = Object.keys(TABLES) as [TrashKind, ...TrashKind[]]

/* Own keys only: `'toString' in TABLES` is true. */
export function isTrashKind(value: string): value is TrashKind {
  return Object.hasOwn(TABLES, value)
}

export async function listDeleted(exec: Executor, scope: PropertyScope) {
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
  const out: { kind: TrashKind; id: string; title: string; deletedAt: Date; by: string | null }[] = []
  for (const [kind, t] of Object.entries(TABLES) as [TrashKind, (typeof TABLES)[TrashKind]][]) {
    const rows = await exec
      .select({ id: t.table.id, title: t.title, deletedAt: t.table.deletedAt, by: users.displayName })
      .from(t.table)
      .leftJoin(users, eq(users.id, t.table.updatedBy))
      .where(and(eq(t.table.propertyId, scope.propertyId), isNotNull(t.table.deletedAt), gt(t.table.deletedAt, since)))
      .orderBy(desc(t.table.deletedAt))
      .limit(100)
    for (const r of rows) out.push({ kind, id: r.id, title: r.title, deletedAt: r.deletedAt!, by: r.by })
  }
  return out.sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime())
}

export async function restore(exec: Executor, scope: PropertyScope, actor: ActorContext, kind: TrashKind, id: string) {
  const t = TABLES[kind]
  return inTransaction(exec, async (tx) => {
    if (kind === 'place') {
      // A place whose parent is gone comes back at the top level.
      await tx.execute(sql`update spaces set parent_id = null where id = ${id}
        and parent_id in (select id from spaces where deleted_at is not null)`)
    }
    try {
      await restoreRow(tx, t.table, t.entity, scope, id, actor)
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ValidationError('Something with the same name is already there, so this can’t come back as-is.')
      }
      throw err
    }
    await t.cascade(tx, id)
  })
}
