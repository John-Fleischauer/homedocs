'use client'

import { ActionForm, type FormAction } from '@/components/ActionForm'
import { Field, Select, SubmitButton, TextArea, TextInput } from '@/components/ui/Field'
import { focusUnlessTouch } from '@/components/ui/focus'

export function SeriesForm({
  action,
  places,
  contacts,
  initial,
  submit,
}: {
  action: FormAction
  places: { id: string; label: string }[]
  contacts: { id: string; label: string }[]
  initial?: { title?: string; howTo?: string; contactId?: string | null; spaceIds?: string[]; updatedAt?: string }
  submit: string
}) {
  return (
    <ActionForm action={action}>
      {initial?.updatedAt ? <input type="hidden" name="updatedAt" value={initial.updatedAt} /> : null}
      <Field label="Name">
        <TextInput name="title" defaultValue={initial?.title} placeholder="Spring mulching" required ref={initial?.title ? undefined : focusUnlessTouch} />
      </Field>
      <Field label="Instructions" hint="Shown on every project in the series">
        <TextArea name="howTo" rows={5} defaultValue={initial?.howTo} placeholder="Rake out the old mulch first" />
      </Field>
      {contacts.length ? (
        <Field label="Usually Done By">
          <Select name="contactId" defaultValue={initial?.contactId ?? ''}>
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {places.length ? (
        <Field label="Places" hint="Ctrl/⌘-click for more than one">
          <select
            name="spaceIds"
            multiple
            defaultValue={initial?.spaceIds ?? []}
            className="min-h-32 w-full rounded-control border border-line bg-card px-2 py-2 text-[15px] text-ink"
          >
            {places.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <SubmitButton>{submit}</SubmitButton>
    </ActionForm>
  )
}
