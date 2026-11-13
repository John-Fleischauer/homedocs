'use client'

import { useState } from 'react'
import { ActionForm, type FormAction } from './ActionForm'
import { buttonClass } from './ui/Button'
import { Field, SubmitButton, TextInput } from './ui/Field'
import { Icon } from './ui/icons'
import { focusUnlessTouch } from './ui/focus'

export function LinkForm({ action }: { action: FormAction }) {
  const [open, setOpen] = useState(false)
  if (!open) {
    return (
      <button type="button" className={buttonClass('secondary')} onClick={() => setOpen(true)}>
        <Icon name="link" />
        Paste Link
      </button>
    )
  }
  return (
    <ActionForm action={action} resetOnSuccess onSuccess={() => setOpen(false)}>
      <Field label="Address" hint="Homebox, paperless or Home Assistant">
        <TextInput name="url" type="url" inputMode="url" placeholder="https://homebox.example/item/…" required ref={focusUnlessTouch} />
      </Field>
      <Field label="Label">
        <TextInput name="title" />
      </Field>
      <div className="flex gap-2">
        <SubmitButton>Link</SubmitButton>
        <button type="button" className={buttonClass('ghost')} onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </ActionForm>
  )
}
