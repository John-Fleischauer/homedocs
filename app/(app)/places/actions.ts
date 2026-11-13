'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { createSpace, deleteSpace, updateSpace } from '@/lib/places/places'
import { act, type ActionResult } from '@/lib/web/action'
import { id, optionalId, text, timestamp, withForm } from '@/lib/web/fields'

const placeFields = { name: text(), parentId: optionalId(), kind: text(200), notes: text() }

export async function createPlaceAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await act(fd, z.object(placeFields), async (input, { scope, actor }) => ({
    id: (await createSpace(db, scope, actor, input)).id,
  }))
  if (r.error) return r
  redirect(`/places/${r.id}`)
}

export async function updatePlaceAction(placeId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await act(
    withForm(fd, { id: placeId }),
    z.object({ ...placeFields, id: id(), updatedAt: timestamp() }),
    async ({ id, updatedAt, ...input }, { scope, actor }) => {
      await updateSpace(db, scope, actor, id, input, updatedAt)
    },
  )
  if (r.error) return r
  redirect(`/places/${placeId}`)
}

export async function deletePlaceAction(placeId: string): Promise<ActionResult> {
  const r = await act({ id: placeId }, z.object({ id: id() }), async (input, { scope, actor }) => {
    await deleteSpace(db, scope, actor, input.id)
  })
  if (r.error) return r
  redirect('/places')
}
