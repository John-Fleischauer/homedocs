'use server'

import { redirect } from 'next/navigation'
import { z } from 'zod'
import { db } from '@/lib/db'
import { createContact, deleteContact, updateContact } from '@/lib/contacts/contacts'
import { saveTradeGroups } from '@/lib/contacts/trades'
import { act, type ActionResult } from '@/lib/web/action'
import { RELOAD, checked, each, id, json, many, text, timestamp, withForm } from '@/lib/web/fields'

/* Phones and emails are rows of two inputs each, read in step: label i goes with value i. */
const contactFields = {
  name: text(),
  company: text(),
  phoneLabel: each(),
  phoneValue: each(),
  emailLabel: each(),
  emailValue: each(),
  website: text(2_000),
  notes: text(),
  accountNumber: text(),
  inGuide: checked(),
  trades: many(),
  preferred: many(),
  customTrades: text(),
  preferCustom: checked(),
}

function input(f: z.output<z.ZodObject<typeof contactFields>>) {
  const methods = (labels: string[], values: string[]) => values.map((value, i) => ({ label: labels[i] ?? '', value }))
  return {
    name: f.name,
    company: f.company,
    phones: methods(f.phoneLabel, f.phoneValue),
    emails: methods(f.emailLabel, f.emailValue),
    website: f.website,
    notes: f.notes,
    accountNumber: f.accountNumber,
    inGuide: f.inGuide,
    trades: f.trades,
    preferred: f.preferred,
    newTrades: f.customTrades
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean),
    preferNew: f.preferCustom,
  }
}

export async function createContactAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await act(fd, z.object(contactFields), async (fields, { scope, actor }) => ({
    id: (await createContact(db, scope, actor, input(fields))).id,
  }))
  if (r.error) return r
  redirect(`/contacts/${r.id}`)
}

export async function updateContactAction(contactId: string, _: ActionResult, fd: FormData): Promise<ActionResult> {
  const r = await act(
    withForm(fd, { id: contactId }),
    z.object({ ...contactFields, id: id(), updatedAt: timestamp() }),
    async ({ id, updatedAt, ...fields }, { scope, actor }) => {
      await updateContact(db, scope, actor, id, input(fields), updatedAt)
    },
  )
  if (r.error) return r
  redirect(`/contacts/${contactId}`)
}

export async function deleteContactAction(contactId: string): Promise<ActionResult> {
  const r = await act({ id: contactId }, z.object({ id: id() }), async (input, { scope, actor }) => {
    await deleteContact(db, scope, actor, input.id)
  })
  if (r.error) return r
  redirect('/contacts')
}

/* The trade groups editor sends its state as JSON. Its shape is checked here;
   the domain trims, de-duplicates and caps it (`cleanTradeGroups`). */
const tradeGroups = z
  .array(
    z.object({ label: z.string().max(1_000), trades: z.array(z.string().max(1_000)).max(1_000) }, { error: RELOAD }),
    { error: RELOAD },
  )
  .max(100, { error: RELOAD })

export async function saveTradesAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(fd, z.object({ groups: json(tradeGroups) }), async (input, { scope, actor }) => {
    await saveTradeGroups(db, scope, actor, input.groups)
  })
}
