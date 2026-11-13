'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { createFixture, deleteFixture, updateFixture } from '@/lib/fixtures/fixtures'
import { act, type ActionResult } from '@/lib/web/action'
import { checked, id, keptId, localPath, optionalId, text, timestamp, withForm } from '@/lib/web/fields'

const fixtureFields = {
  name: text(),
  spaceId: optionalId(),
  /* Left out of the form means "keep the system it has". */
  systemId: keptId(),
  category: text(200),
  notes: text(),
  inGuide: checked(),
  guideNote: text(),
}

export async function createFixtureAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await act(fd, z.object(fixtureFields), async (input, { scope, actor }) => ({
    id: (await createFixture(db, scope, actor, input)).id,
  }))
  if (r.error) return r
  redirect(`/fixtures/${r.id}`)
}

export async function updateFixtureAction(fixtureId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await act(
    withForm(fd, { id: fixtureId }),
    z.object({ ...fixtureFields, id: id(), updatedAt: timestamp() }),
    async ({ id, updatedAt, ...input }, { scope, actor }) => {
      await updateFixture(db, scope, actor, id, input, updatedAt)
    },
  )
  if (r.error) return r
  redirect(`/fixtures/${fixtureId}`)
}

/** `back` is where the page came from; only a path inside the app, so a crafted call can't send anyone off-site. */
export async function deleteFixtureAction(fixtureId: string, back: string): Promise<ActionResult> {
  let to = '/fixtures'
  const r = await act({ id: fixtureId, back }, z.object({ id: id(), back: localPath() }), async (input, { scope, actor }) => {
    await deleteFixture(db, scope, actor, input.id)
    to = input.back
  })
  if (r.error) return r
  redirect(to)
}
