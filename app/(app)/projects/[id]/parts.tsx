'use client'

import { useState, useTransition } from 'react'
import { ActionForm, type FormAction } from '@/components/ActionForm'
import { DeleteButton } from '@/components/DeleteButton'
import { buttonClass } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Card'
import { Checkbox, Field, FormError, Select, SubmitButton, TextArea, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import type { ActionResult } from '@/lib/web/action'
import { useRun } from '../materials'
import { useSeriesConfirm } from '@/components/SeriesConfirm'
import type { ItemView, MissingView } from '../series-view'

const FLOW = [
  ['idea', 'Idea'],
  ['planning', 'Planning'],
  ['quoted', 'Quotes'],
  ['scheduled', 'Scheduled'],
  ['in_progress', 'Doing'],
  ['done', 'Done'],
] as const

/* The status as a row of steps; tapping one moves the project there. */
export function StatusStepper({
  status,
  setStatus,
  canEdit,
}: {
  status: string
  setStatus: (s: string) => Promise<unknown>
  canEdit: boolean
}) {
  const [pending, start] = useTransition()
  const index = FLOW.findIndex(([s]) => s === status)
  return (
    <ol className="grid grid-cols-6 gap-1" aria-label="Status">
      {FLOW.map(([s, label], i) => {
        const current = s === status
        const past = index >= 0 && i < index
        return (
          <li key={s}>
            <button
              type="button"
              disabled={!canEdit || pending || current}
              aria-current={current ? 'step' : undefined}
              onClick={() => start(async () => void (await setStatus(s)))}
              className={`flex w-full flex-col items-center gap-1 rounded-control px-0.5 py-2 text-[10.5px] font-medium leading-tight ${
                current ? 'bg-accent text-accent-ink' : past ? 'bg-accent-soft text-accent' : 'bg-sunk text-ink-3'
              } disabled:cursor-default`}
            >
              {past ? <Icon name="check" className="h-4 w-4" /> : <span className="h-4 w-4 text-center">{i + 1}</span>}
              {label}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

export function Checklist({
  items,
  missing = [],
  toggle,
  remove,
  add,
  places,
  quotes,
  canEdit,
  inSeries = false,
  setOneOff,
  sendToSeries,
  copyHere,
  dropFromSeries,
}: {
  items: ItemView[]
  /** Series to-dos this project doesn't have. */
  missing?: MissingView[]
  /** Absent on a series' default checklist, which has nothing to tick. */
  toggle?: (id: string, done: boolean) => Promise<unknown>
  remove: (id: string) => Promise<unknown>
  add: FormAction
  places: { id: string; label: string }[]
  quotes: { id: string; label: string }[]
  canEdit: boolean
  /** A project in a series: offer "Only this project" when adding. */
  inSeries?: boolean
  setOneOff?: (id: string, oneOff: boolean) => Promise<ActionResult>
  sendToSeries?: (id: string) => Promise<ActionResult>
  copyHere?: (seriesRowId: string) => Promise<ActionResult>
  dropFromSeries?: (seriesRowId: string) => Promise<ActionResult>
}) {
  const [pending, run, error] = useRun()
  const [ask, dialog] = useSeriesConfirm()
  const [details, setDetails] = useState(false)
  const link = 'inline-flex min-h-11 items-center text-sm font-medium text-accent'
  return (
    <div className="flex flex-col gap-3">
      {items.length || missing.length ? (
        <ul className="divide-y divide-line rounded-card border border-line bg-card">
          {items.map((item) => {
            const differs = item.status === 'changed' || item.status === 'added'
            return (
              <li key={item.id} className={`flex flex-col px-4 py-2 ${differs ? 'border-l-4 border-l-warn bg-warn-soft' : ''}`}>
                <div className="flex min-h-12 items-center gap-3">
                  {toggle ? (
                    <input
                      type="checkbox"
                      checked={item.done}
                      disabled={!canEdit}
                      aria-label={item.text}
                      onChange={(e) => {
                        const done = e.target.checked
                        run(async () => (await toggle(item.id, done)) as ActionResult)
                      }}
                      className="h-6 w-6 shrink-0 accent-[var(--color-accent)]"
                    />
                  ) : null}
                  <span className="min-w-0 flex-1">
                    <span className={`block text-[15px] ${item.done ? 'text-ink-3 line-through' : 'text-ink'}`}>{item.text}</span>
                    {item.spaceName || item.quoteLabel ? (
                      <span className="block text-xs text-ink-3">
                        {[item.spaceName, item.quoteLabel ? `in ${item.quoteLabel}’s quote` : ''].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </span>
                  {item.status === 'changed' ? <Pill tone="warn">Changed</Pill> : null}
                  {item.status === 'added' ? <Pill tone="warn">Not in Series</Pill> : null}
                  {item.oneOff ? <Pill>This Project Only</Pill> : null}
                  {canEdit ? <DeleteButton compact what={`“${item.text}”`} label="Remove" action={() => remove(item.id)} /> : null}
                </div>
                {canEdit && (differs || item.oneOff) ? (
                  <div className="flex flex-wrap gap-x-4 pl-9">
                    {differs && sendToSeries ? (
                      <button type="button" disabled={pending} className={link} onClick={() => ask([item.change!], () => run(() => sendToSeries(item.id)))}>
                        Update Series
                      </button>
                    ) : null}
                    {item.status === 'added' && setOneOff ? (
                      <button type="button" disabled={pending} className={link} onClick={() => run(() => setOneOff(item.id, true))}>
                        Only This Project
                      </button>
                    ) : null}
                    {item.oneOff && setOneOff ? (
                      <button type="button" disabled={pending} className={link} onClick={() => run(() => setOneOff(item.id, false))}>
                        Not Just This Project
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            )
          })}
          {missing.map((m) => (
            <li key={m.id} className="flex flex-col gap-1 border-l-4 border-l-warn bg-warn-soft px-4 py-3">
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1 text-[15px] text-ink-2 line-through decoration-ink-3">{m.label}</span>
                <Pill tone="warn">In Series, Not Here</Pill>
              </div>
              {canEdit && copyHere && dropFromSeries ? (
                <div className="flex flex-wrap gap-x-4">
                  <button type="button" disabled={pending} className={link} onClick={() => run(() => copyHere(m.id))}>
                    Add Here
                  </button>
                  <button type="button" disabled={pending} className={link} onClick={() => ask([m.change], () => run(() => dropFromSeries(m.id)))}>
                    Remove from Series
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {canEdit ? (
        <ActionForm action={add} resetOnSuccess className="flex flex-col gap-2">
          <div className="flex gap-2">
            <TextInput name="text" placeholder="Add a to-do" aria-label="New to-do" required />
            <SubmitButton pendingText="…">Add</SubmitButton>
          </div>
          {inSeries ? <Checkbox name="oneOff" label="Only This Project" /> : null}
          {details ? (
            <div className={`grid gap-2 ${quotes.length ? 'grid-cols-2' : 'grid-cols-1'}`}>
              <Select name="spaceId" aria-label="Where" defaultValue="">
                <option value="">Choose Place</option>
                {places.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </Select>
              {quotes.length ? (
                <Select name="quoteId" aria-label="Covered by quote" defaultValue="">
                  <option value="">Which Quote?</option>
                  {quotes.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.label}
                    </option>
                  ))}
                </Select>
              ) : null}
            </div>
          ) : (
            <button type="button" className="min-h-11 self-start text-sm text-accent" onClick={() => setDetails(true)}>
              {quotes.length ? '+ where, and which quote covers it' : '+ where'}
            </button>
          )}
        </ActionForm>
      ) : null}
      <FormError>{error}</FormError>
      {dialog}
    </div>
  )
}

export function QuoteForm({ add, contacts }: { add: FormAction; contacts: { id: string; label: string }[] }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button type="button" className={buttonClass('secondary')} onClick={() => setOpen(true)}>
        Add Quote
      </button>
    )
  }
  return (
    <ActionForm action={add} resetOnSuccess onSuccess={() => setOpen(false)}>
      <Field label="From" hint={contacts.length ? undefined : 'Add the contact first'}>
        <Select name="contactId" defaultValue="">
          <option value="">—</option>
          {contacts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <TextInput name="amount" inputMode="decimal" placeholder="$" />
        </Field>
        <Field label="Date">
          <TextInput name="receivedOn" type="date" />
        </Field>
      </div>
      <Field label="What’s Included">
        <TextArea name="notes" />
      </Field>
      <div className="flex gap-2">
        <SubmitButton>Add Quote</SubmitButton>
        <button type="button" className={buttonClass('ghost')} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </ActionForm>
  )
}

export function QuoteButtons({
  status,
  setStatus,
  remove,
}: {
  status: string
  setStatus: (s: 'pending' | 'accepted' | 'declined') => Promise<unknown>
  remove: () => Promise<unknown>
}) {
  const [pending, start] = useTransition()
  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== 'accepted' ? (
        <button type="button" disabled={pending} className={buttonClass('primary', 'min-h-9 px-3 text-sm')} onClick={() => start(async () => void (await setStatus('accepted')))}>
          Accept
        </button>
      ) : null}
      {status === 'pending' ? (
        <button type="button" disabled={pending} className={buttonClass('secondary', 'min-h-9 px-3 text-sm')} onClick={() => start(async () => void (await setStatus('declined')))}>
          Decline
        </button>
      ) : (
        <button type="button" disabled={pending} className={buttonClass('ghost', 'min-h-9 px-3 text-sm')} onClick={() => start(async () => void (await setStatus('pending')))}>
          Undo
        </button>
      )}
      <DeleteButton compact what="this quote" recoverable={false} label="Remove" action={remove} />
    </div>
  )
}
