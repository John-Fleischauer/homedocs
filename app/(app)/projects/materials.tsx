'use client'

/*
 * What a job takes, as a list of lines, on a series or a project. On an open
 * project in a series, lines that differ from the series are marked, and each
 * can be sent back to the series after a confirmation that says exactly what
 * will change.
 */

import { useState, useTransition } from 'react'
import { ActionForm, type FormAction } from '@/components/ActionForm'
import { DeleteButton } from '@/components/DeleteButton'
import { buttonClass } from '@/components/ui/Button'
import { Pill } from '@/components/ui/Card'
import { Checkbox, Field, FormError, Select, SubmitButton, TextInput } from '@/components/ui/Field'
import { Icon } from '@/components/ui/icons'
import { useSeriesConfirm } from '@/components/SeriesConfirm'
import type { ActionResult } from '@/lib/web/action'
import { amountOf, type MaterialView, type MissingView } from './series-view'

type Part = { id: string; name: string; units: string[] }
type Place = { id: string; label: string }
type Run = (fn: () => Promise<ActionResult>) => void

const LINK = 'inline-flex min-h-11 items-center text-sm font-medium text-accent'

/** Runs a server action from a button; a refusal comes back as `error`, shown in place. */
export function useRun(): [boolean, Run, string | null] {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return [
    pending,
    (fn) =>
      start(async () => {
        setError(null)
        const result = await fn()
        if (result?.error) setError(result.error)
      }),
    error,
  ]
}

export function Materials({
  rows,
  missing = [],
  parts,
  places,
  canEdit,
  onProject,
  add,
  update,
  remove,
  setOneOff,
  sendToSeries,
  copyHere,
  dropFromSeries,
}: {
  rows: MaterialView[]
  missing?: MissingView[]
  parts: Part[]
  places: Place[]
  canEdit: boolean
  /** On a project (not a series): offer "Only this project". */
  onProject: boolean
  add: FormAction
  update: (id: string, prev: ActionResult, fd: FormData) => Promise<ActionResult>
  remove: (id: string) => Promise<ActionResult>
  setOneOff?: (id: string, oneOff: boolean) => Promise<ActionResult>
  sendToSeries?: (id: string) => Promise<ActionResult>
  copyHere?: (seriesRowId: string) => Promise<ActionResult>
  dropFromSeries?: (seriesRowId: string) => Promise<ActionResult>
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [pending, run, error] = useRun()
  const [ask, dialog] = useSeriesConfirm()

  return (
    <div className="flex flex-col gap-3">
      {rows.length || missing.length ? (
        <ul className="divide-y divide-line rounded-card border border-line bg-card">
          {rows.map((m) => {
            const differs = m.status === 'changed' || m.status === 'added'
            if (editing === m.id) {
              return (
                <li key={m.id} className="px-4 py-3">
                  <MaterialForm
                    action={update.bind(null, m.id)}
                    parts={parts}
                    places={places}
                    initial={m}
                    submit="Save"
                    onDone={() => setEditing(null)}
                  />
                </li>
              )
            }
            return (
              <li key={m.id} className={`flex flex-col gap-1 px-4 py-3 ${differs ? 'border-l-4 border-l-warn bg-warn-soft' : ''}`}>
                <div className="flex items-start gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium text-ink">
                      {[m.name, amountOf(m.quantity || null, m.unit)].filter(Boolean).join(' · ')}
                    </span>
                    {m.notes || m.spaceName || (m.partName && m.partName !== m.name) ? (
                      <span className="block text-sm text-ink-3">
                        {[m.notes, m.spaceName, m.partName && m.partName !== m.name ? `Part: ${m.partName}` : ''].filter(Boolean).join(' · ')}
                      </span>
                    ) : null}
                  </span>
                  {m.status === 'changed' ? <Pill tone="warn">{m.was}</Pill> : null}
                  {m.status === 'added' ? <Pill tone="warn">Not in Series</Pill> : null}
                  {m.oneOff ? <Pill>This Project Only</Pill> : null}
                </div>
                {canEdit ? (
                  <div className="flex flex-wrap items-center gap-x-4">
                    {differs && sendToSeries ? (
                      <button type="button" disabled={pending} className={LINK} onClick={() => ask([m.change!], () => run(() => sendToSeries(m.id)))}>
                        Update Series
                      </button>
                    ) : null}
                    {m.status === 'added' && setOneOff ? (
                      <button type="button" disabled={pending} className={LINK} onClick={() => run(() => setOneOff(m.id, true))}>
                        Only This Project
                      </button>
                    ) : null}
                    {m.oneOff && setOneOff ? (
                      <button type="button" disabled={pending} className={LINK} onClick={() => run(() => setOneOff(m.id, false))}>
                        Not Just This Project
                      </button>
                    ) : null}
                    <button type="button" className={LINK} onClick={() => setEditing(m.id)}>
                      Edit
                    </button>
                    <span className="ml-auto">
                      <DeleteButton compact recoverable={false} what={`“${m.name}”`} label="Remove" action={() => remove(m.id)} />
                    </span>
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
                  <button type="button" disabled={pending} className={LINK} onClick={() => run(() => copyHere(m.id))}>
                    Add Here
                  </button>
                  <button type="button" disabled={pending} className={LINK} onClick={() => ask([m.change], () => run(() => dropFromSeries(m.id)))}>
                    Remove from Series
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-1 text-sm text-ink-3">No materials yet</p>
      )}
      {canEdit ? (
        adding ? (
          <Card>
            <MaterialForm action={add} parts={parts} places={places} submit="Add" onProject={onProject} onDone={() => setAdding(false)} />
          </Card>
        ) : (
          <button type="button" className={buttonClass('secondary')} onClick={() => setAdding(true)}>
            <Icon name="plus" />
            Add Material
          </button>
        )
      ) : null}
      <FormError>{error}</FormError>
      {dialog}
    </div>
  )
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="rounded-card border border-line bg-card px-4 py-3">{children}</div>
}

function MaterialForm({
  action,
  parts,
  places,
  initial,
  submit,
  onProject = false,
  onDone,
}: {
  action: FormAction
  parts: Part[]
  places: Place[]
  initial?: MaterialView
  submit: string
  onProject?: boolean
  onDone: () => void
}) {
  const [partId, setPartId] = useState(initial?.supplyId ?? '')
  const part = parts.find((p) => p.id === partId)
  return (
    <ActionForm action={action} onSuccess={onDone} className="flex flex-col gap-3">
      {parts.length ? (
        <Field label="Part" hint="Fills in the name and unit">
          <Select name="supplyId" value={partId} onChange={(e) => setPartId(e.target.value)}>
            <option value="">—</option>
            {parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      <Field label="What">
        <TextInput
          key={partId}
          name="name"
          defaultValue={initial && initial.supplyId === (partId || null) ? initial.name : (part?.name ?? '')}
          placeholder={part ? part.name : 'Mulch'}
          required={!part}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount">
          <TextInput name="quantity" inputMode="decimal" defaultValue={initial?.quantity} placeholder="8" />
        </Field>
        <Field label="Unit">
          {part && part.units.length ? (
            <Select key={partId} name="unit" defaultValue={initial && initial.supplyId === partId ? initial.unit : part.units[0]}>
              {part.units.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </Select>
          ) : (
            <TextInput key={partId} name="unit" defaultValue={initial?.unit} placeholder="roll" />
          )}
        </Field>
      </div>
      <Field label="Notes" hint="Where or what for">
        <TextInput name="notes" defaultValue={initial?.notes} />
      </Field>
      {places.length ? (
        <Field label="Place">
          <Select name="spaceId" defaultValue={initial?.spaceId ?? ''}>
            <option value="">—</option>
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {onProject ? <Checkbox name="oneOff" label="Only This Project" hint="Not added to the series" /> : null}
      <div className="flex gap-2">
        <SubmitButton>{submit}</SubmitButton>
        <button type="button" className={buttonClass('ghost')} onClick={onDone}>
          Cancel
        </button>
      </div>
    </ActionForm>
  )
}

/** The project's banner: how many things differ, and the one button that sends them all. */
export function SeriesBanner({
  seriesTitle,
  changes,
  canEdit,
  sendAll,
}: {
  seriesTitle: string
  changes: string[]
  canEdit: boolean
  sendAll: () => Promise<ActionResult>
}) {
  const [pending, run, error] = useRun()
  const [ask, dialog] = useSeriesConfirm()
  if (changes.length === 0) return null
  return (
    <div className="mt-4 flex flex-col gap-2 rounded-card border border-warn/30 bg-warn-soft px-4 py-3 text-warn">
      <p className="text-[15px]">
        <span className="font-semibold">
          {changes.length === 1 ? '1 difference' : `${changes.length} differences`} from {seriesTitle}
        </span>
      </p>
      {canEdit ? (
        <button
          type="button"
          disabled={pending}
          className={buttonClass('secondary', 'self-start')}
          onClick={() => ask(changes, () => run(sendAll))}
        >
          Update Series with All Changes
        </button>
      ) : null}
      <FormError>{error}</FormError>
      {dialog}
    </div>
  )
}
