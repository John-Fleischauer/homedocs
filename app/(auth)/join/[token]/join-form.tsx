'use client'

import { useActionState } from 'react'
import { Field, FormError, SubmitButton, TextInput } from '@/components/ui/Field'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy'
import { joinAction, type FormState } from '../../actions'
import { keepFormValues } from '@/lib/keep-form-values'
import { focusUnlessTouch } from '@/components/ui/focus'

export function JoinForm({ token, kind }: { token: string; kind: 'invite' | 'reset' }) {
  const [state, action] = useActionState<FormState, FormData>(joinAction.bind(null, token), {})
  return (
    <form action={action} onReset={keepFormValues} className="flex flex-col gap-4">
      {kind === 'invite' ? (
        <>
          <Field label="Your Name">
            <TextInput name="displayName" autoComplete="name" required ref={focusUnlessTouch} />
          </Field>
          <Field label="Email" hint="For signing in">
            <TextInput name="email" type="email" autoComplete="username" required />
          </Field>
        </>
      ) : null}
      <Field label={kind === 'invite' ? 'Choose Password' : 'New Password'} hint={`At least ${MIN_PASSWORD_LENGTH} characters`}>
        <TextInput
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={MIN_PASSWORD_LENGTH}
          required
          ref={kind === 'reset' ? focusUnlessTouch : undefined}
        />
      </Field>
      <FormError>{state.error}</FormError>
      <SubmitButton pendingText="One moment…">{kind === 'invite' ? 'Join' : 'Set Password'}</SubmitButton>
    </form>
  )
}
