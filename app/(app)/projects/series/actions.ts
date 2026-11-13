'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { addSeriesItem, createSeries, deleteSeries, removeSeriesItem, updateSeries } from '@/lib/projects/series'
import { act, type ActionResult } from '@/lib/web/action'
import { id, ids, optionalId, text, timestamp, withForm } from '@/lib/web/fields'

const seriesFields = { title: text(), howTo: text(), contactId: optionalId(), spaceIds: ids() }

export async function createSeriesAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await act(fd, z.object(seriesFields), async (input, { scope, actor }) => ({
    id: (await createSeries(db, scope, actor, input)).id,
  }))
  if (r.error) return r
  redirect(`/projects/series/${r.id}`)
}

export async function saveSeriesAction(seriesId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await act(
    withForm(fd, { id: seriesId }),
    z.object({ ...seriesFields, id: id(), updatedAt: timestamp() }),
    async ({ id, updatedAt, ...input }, { scope, actor }) => {
      await updateSeries(db, scope, actor, id, input, updatedAt)
    },
  )
  if (r.error) return r
  redirect(`/projects/series/${seriesId}`)
}

export async function deleteSeriesAction(seriesId: string): Promise<ActionResult> {
  const r = await act({ id: seriesId }, z.object({ id: id() }), async (input, { scope, actor }) => {
    await deleteSeries(db, scope, actor, input.id)
  })
  if (r.error) return r
  redirect('/projects')
}

export async function addSeriesItemAction(seriesId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(
    withForm(fd, { seriesId }),
    z.object({ seriesId: id(), text: text(), spaceId: optionalId() }),
    async ({ seriesId, ...input }, { scope, actor }) => {
      await addSeriesItem(db, scope, actor, seriesId, input)
    },
  )
}

export async function removeSeriesItemAction(itemId: string): Promise<ActionResult> {
  return act({ id: itemId }, z.object({ id: id() }), async (input, { scope, actor }) => {
    await removeSeriesItem(db, scope, actor, input.id)
  })
}
