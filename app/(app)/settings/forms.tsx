'use client'

import { ActionForm, type FormAction } from '@/components/ActionForm'
import { Field, SubmitButton, TextArea, TextInput } from '@/components/ui/Field'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy'

export function NameForm({ action, name }: { action: FormAction; name: string }) {
  return (
    <ActionForm action={action}>
      <Field label="Your Name">
        <TextInput name="displayName" defaultValue={name} required />
      </Field>
      <SubmitButton variant="secondary">Save</SubmitButton>
    </ActionForm>
  )
}

export function PasswordForm({ action, hasPassword }: { action: FormAction; hasPassword: boolean }) {
  return (
    <ActionForm action={action} resetOnSuccess>
      {hasPassword ? (
        <Field label="Current Password">
          <TextInput name="current" type="password" autoComplete="current-password" required />
        </Field>
      ) : null}
      <Field label="New Password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`}>
        <TextInput name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
      </Field>
      <SubmitButton variant="secondary">{hasPassword ? 'Change Password' : 'Set Password'}</SubmitButton>
    </ActionForm>
  )
}

export function HomeForm({
  action,
  initial,
  seenAs,
}: {
  action: FormAction
  initial: { name: string; address: string; homeNetworks: string[]; homeHostname: string }
  seenAs: string | null
}) {
  return (
    <ActionForm action={action}>
      <Field label="Name">
        <TextInput name="name" defaultValue={initial.name} required />
      </Field>
      <Field label="Address" hint="Shown on the house guide">
        <TextArea name="address" rows={2} defaultValue={initial.address} />
      </Field>
      <fieldset className="flex flex-col gap-3 rounded-card border border-line p-4">
        <legend className="px-1 text-sm font-semibold text-ink-2">Home Network</legend>
        <p className="text-sm text-ink-3">
          On the home network, the house guide shows codes without a PIN.
          {seenAs ? (
            <>
              {' '}
              This device is seen as <code className="rounded bg-sunk px-1">{seenAs}</code>.
            </>
          ) : null}
        </p>
        <Field label="Home Network Ranges" hint="E.g. 192.168.1.0/24, one per line">
          <TextArea name="homeNetworks" rows={2} defaultValue={initial.homeNetworks.join('\n')} />
        </Field>
        <Field label="Home Hostname" hint="Dynamic-DNS name for the home’s internet address">
          <TextInput name="homeHostname" defaultValue={initial.homeHostname} />
        </Field>
      </fieldset>
      <SubmitButton variant="secondary">Save</SubmitButton>
    </ActionForm>
  )
}

export function IntegrationForm({
  action,
  system,
  initial,
}: {
  action: FormAction
  system: 'homebox' | 'paperless'
  initial?: { baseUrl: string; lastStatus: string }
}) {
  const homebox = system === 'homebox'
  /* Cleared after a save: the token is a secret, and the form shouldn't keep it on screen. */
  return (
    <ActionForm action={action} resetOnSuccess>
      {initial?.lastStatus ? <p className="text-sm text-accent">Connected: {initial.lastStatus}</p> : null}
      <Field label="Address" hint={homebox ? 'E.g. https://homebox.example.com' : 'E.g. https://paperless.example.com'}>
        <TextInput name="baseUrl" type="url" inputMode="url" defaultValue={initial?.baseUrl} required />
      </Field>
      <Field
        label={homebox ? 'API Key' : 'API Token'}
        hint={
          initial
            ? 'Leave blank to keep the saved one'
            : homebox
              ? 'In Homebox (0.26+): profile → API keys → create; starts with hb_'
              : 'In paperless: My Profile → API Auth Token; ideally from a user that sees only home documents'
        }
      >
        <TextInput name="token" type="password" autoComplete="off" required={!initial} />
      </Field>
      <SubmitButton variant="secondary" pendingText="Testing…">
        {initial ? 'Save and Test' : 'Connect'}
      </SubmitButton>
    </ActionForm>
  )
}

export function RebuildSearch({ action }: { action: FormAction }) {
  return (
    <ActionForm action={action}>
      <p className="text-sm text-ink-3">After restoring a backup, or if search misses something</p>
      <SubmitButton variant="secondary" pendingText="Rebuilding…">Rebuild Search</SubmitButton>
    </ActionForm>
  )
}
