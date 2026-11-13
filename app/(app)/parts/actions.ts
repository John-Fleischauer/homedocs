'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { addUse, createPart, deletePart, removeUse, updatePart, updateUse } from '@/lib/parts/parts'
import { TEMPLATES, isCategory } from '@/lib/parts/templates'
import { act, type ActionResult } from '@/lib/web/action'
import { collect, formValues, id, localPath, optionalId, text, timestamp, withForm } from '@/lib/web/fields'

/*
 * A part's own fields depend on its category, so the form sends them as
 * `f_<key>`. They are gathered into `fields` before the parse; only the
 * category's own keys are passed on.
 */
function gather(values: Record<string, unknown>): Record<string, unknown> {
  const fields = collect(Object.entries(values).flatMap(([name, value]) => (name.startsWith('f_') ? [[name.slice(2), value] as [string, unknown]] : [])))
  return { ...values, fields }
}

const partFields = {
  category: text(200),
  name: text(),
  fields: z.record(z.string(), text()),
  units: text(),
  buyUrl: text(2_000),
  notes: text(),
}

function partInput(f: z.output<z.ZodObject<typeof partFields>>) {
  const fields: Record<string, string> = {}
  if (isCategory(f.category)) for (const t of TEMPLATES[f.category].fields) fields[t.key] = f.fields[t.key] ?? ''
  const [unit = '', ...extraUnits] = f.units.split(',').map((u) => u.trim())
  return { category: f.category, name: f.name, fields, unit, extraUnits, buyUrl: f.buyUrl, notes: f.notes }
}

const useFields = {
  surface: text(),
  finish: text(),
  quantity: text(200),
  useUnit: text(200),
  quantityNeeded: text(200),
  useNotes: text(),
}

function useInput(f: z.output<z.ZodObject<typeof useFields>>) {
  return {
    surface: f.surface,
    finish: f.finish,
    quantity: f.quantity,
    unit: f.useUnit,
    quantityNeeded: f.quantityNeeded,
    notes: f.useNotes,
  }
}

/** Where to go after: back to the fixture or place the part was added from, or the part. */
function after(where: { fixtureId: string | null; spaceId: string | null }, partId: string) {
  if (where.fixtureId) return `/fixtures/${where.fixtureId}`
  if (where.spaceId) return `/places/${where.spaceId}`
  return `/parts/${partId}`
}

export async function createPartAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  /* Where to go once it's done: set by the work, which runs only if act() let
     it, so redirect() below never runs with it unset. */
  let to = ''
  const r = await act(
    gather(formValues(fd)),
    z.object({ ...partFields, ...useFields, fixtureId: optionalId(), spaceId: optionalId() }),
    async (input, { scope, actor }) => {
      const part = await createPart(db, scope, actor, partInput(input))
      const { fixtureId, spaceId } = input
      if (fixtureId || spaceId) await addUse(db, scope, actor, { supplyId: part.id, fixtureId, spaceId, ...useInput(input) })
      to = after(input, part.id)
      return { id: part.id }
    },
  )
  if (r.error) return r
  redirect(to)
}

export async function updatePartAction(partId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await act(
    gather(withForm(fd, { id: partId })),
    z.object({ ...partFields, id: id(), updatedAt: timestamp() }),
    async (input, { scope, actor }) => {
      await updatePart(db, scope, actor, input.id, partInput(input), input.updatedAt)
    },
  )
  if (r.error) return r
  redirect(`/parts/${partId}`)
}

export async function deletePartAction(partId: string): Promise<ActionResult> {
  const r = await act({ id: partId }, z.object({ id: id() }), async (input, { scope, actor }) => {
    await deletePart(db, scope, actor, input.id)
  })
  if (r.error) return r
  redirect('/parts')
}

/** Link an existing part to a fixture or place. */
export async function addUseAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  /* Where to go once it's done: set by the work, which runs only if act() let
     it, so redirect() below never runs with it unset. */
  let to = ''
  const r = await act(
    fd,
    z.object({
      ...useFields,
      supplyId: optionalId().pipe(z.string({ error: 'Pick a part.' })),
      fixtureId: optionalId(),
      spaceId: optionalId(),
    }),
    async (input, { scope, actor }) => {
      const { supplyId, fixtureId, spaceId } = input
      await addUse(db, scope, actor, { supplyId, fixtureId, spaceId, ...useInput(input) })
      to = after(input, supplyId)
    },
  )
  if (r.error) return r
  redirect(to)
}

/** `back` is where the page came from; only a path inside the app. */
export async function updateUseAction(useId: string, back: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  /* Where to go once it's done: set by the work, which runs only if act() let
     it, so redirect() below never runs with it unset. */
  let to = ''
  const r = await act(
    withForm(fd, { id: useId, back }),
    z.object({ ...useFields, id: id(), back: localPath() }),
    async (input, { scope, actor }) => {
      await updateUse(db, scope, actor, input.id, useInput(input))
      to = input.back
    },
  )
  if (r.error) return r
  redirect(to)
}

export async function removeUseAction(useId: string, back: string): Promise<ActionResult> {
  /* Where to go once it's done: set by the work, which runs only if act() let
     it, so redirect() below never runs with it unset. */
  let to = ''
  const r = await act({ id: useId, back }, z.object({ id: id(), back: localPath() }), async (input, { scope, actor }) => {
    await removeUse(db, scope, actor, input.id)
    to = input.back
  })
  if (r.error) return r
  redirect(to)
}
