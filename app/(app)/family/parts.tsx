'use client'

import { useActionState, useTransition } from 'react'
import { CopyButton } from '@/components/CopyButton'
import { ActionForm, type FormAction } from '@/components/ActionForm'
import { buttonClass } from '@/components/ui/Button'
import { Field, Select, SubmitButton, TextInput } from '@/components/ui/Field'
import type { ActionResult } from '@/lib/web/action'
import { keepFormValues, useClearOnSuccess } from '@/lib/keep-form-values'

export const ROLE_HELP = {
  admin: 'Admin — can change anything, invite people, share the guide',
  member: 'Member — can look things up, add and change them',
  viewer: 'Viewer — can look things up',
} as const

/* A made link is shown once, with a copy button: it is not stored anywhere readable. */
function MadeLink({ url, kind }: { url: string; kind: string }) {
  return (
    <div className="flex flex-col gap-2 rounded-control bg-accent-soft p-3">
      <p className="text-sm text-accent">Send this {kind} link — it works once, for 7 days:</p>
      <code className="break-all rounded bg-card px-2 py-1.5 text-xs text-ink">{url}</code>
      <CopyButton text={url} />
    </div>
  )
}

export function InviteForm({ action }: { action: FormAction }) {
  const form = useClearOnSuccess(action)
  const [state, formAction] = useActionState<ActionResult, FormData>(form.action, {})
  return (
    <form action={formAction} onReset={form.onReset} className="flex flex-col gap-3">
      <Field label="Name">
        <TextInput name="label" placeholder="Mom" />
      </Field>
      <Field label="Role">
        <Select name="role" defaultValue="member">
          {Object.entries(ROLE_HELP).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {state.message ? <MadeLink url={state.message} kind="invite" /> : null}
      <SubmitButton pendingText="Making link…">Make Invite Link</SubmitButton>
    </form>
  )
}

export function AddMemberForm({
  action,
  sso,
  password,
  needsVerifiedEmail,
}: {
  action: FormAction
  sso: string | null
  password: boolean
  needsVerifiedEmail: boolean
}) {
  const form = useClearOnSuccess(action)
  const [state, formAction] = useActionState<ActionResult, FormData>(form.action, {})
  return (
    <form action={formAction} onReset={form.onReset} className="flex flex-col gap-3">
      <Field label="Name">
        <TextInput name="displayName" required placeholder="Mom" />
      </Field>
      <Field
        label="Email"
        hint={
          sso
            ? `The one they use with ${sso}` + (needsVerifiedEmail ? `; ${sso} must show it as verified` : '')
            : undefined
        }
      >
        <TextInput name="email" type="email" inputMode="email" required />
      </Field>
      <Field label="Role">
        <Select name="role" defaultValue="member">
          {Object.entries(ROLE_HELP).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </Select>
      </Field>
      {password ? (
        <Field
          label="Password"
          hint={
            sso
              ? `Blank if they use ${sso}`
              : 'Or leave blank and send a password link'
          }
        >
          <TextInput name="password" type="password" minLength={8} />
        </Field>
      ) : null}
      {state.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
      {state.message ? <p role="status" className="text-sm text-accent">{state.message}</p> : null}
      <SubmitButton pendingText="Adding…">Add Person</SubmitButton>
    </form>
  )
}

export function ResetLink({ action, label = 'Make Password Reset Link' }: { action: FormAction; label?: string }) {
  const [state, formAction] = useActionState<ActionResult, FormData>(action, {})
  return (
    <form action={formAction} onReset={keepFormValues} className="flex flex-col gap-2">
      {state.message ? <MadeLink url={state.message} kind="password reset" /> : null}
      {state.error ? <p className="text-sm text-danger">{state.error}</p> : null}
      {!state.message ? (
        <SubmitButton variant="ghost" className="min-h-9 self-start px-2 text-sm" pendingText="…">
          {label}
        </SubmitButton>
      ) : null}
    </form>
  )
}

export function RoleSelect({
  role,
  setRole,
  disabled,
}: {
  role: string
  setRole: (r: string) => Promise<ActionResult>
  disabled?: boolean
}) {
  const [pending, start] = useTransition()
  return (
    <Select
      aria-label="Role"
      defaultValue={role}
      disabled={disabled || pending}
      onChange={(e) =>
        start(async () => {
          const r = await setRole(e.target.value)
          if (r.error) {
            alert(r.error)
            location.reload()
          }
        })
      }
      className="max-w-32 shrink-0"
    >
      <option value="admin">Admin</option>
      <option value="member">Member</option>
      <option value="viewer">Viewer</option>
    </Select>
  )
}

export function RevokeButton({ action }: { action: () => Promise<unknown> }) {
  const [pending, start] = useTransition()
  return (
    <button type="button" disabled={pending} className={buttonClass('ghost', 'min-h-9 px-2 text-sm')} onClick={() => start(async () => void (await action()))}>
      Cancel Link
    </button>
  )
}


/* Letting in an account a single sign-on made: pick what they can do, then Let In. */
export function PlaceForm({ action, suggested }: { action: FormAction; suggested: string }) {
  return (
    <ActionForm action={action} className="flex items-center gap-2">
      <Select name="role" aria-label="Role" defaultValue={suggested} className="max-w-32 shrink-0">
        <option value="admin">Admin</option>
        <option value="member">Member</option>
        <option value="viewer">Viewer</option>
      </Select>
      <SubmitButton variant="secondary" pendingText="Letting in…">
        Let In
      </SubmitButton>
    </ActionForm>
  )
}
