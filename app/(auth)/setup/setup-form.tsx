'use client'

import { useActionState } from 'react'
import { Field, FormError, SubmitButton, TextInput } from '@/components/ui/Field'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password-policy'
import { setupAction, type FormState } from '../actions'
import { keepFormValues } from '@/lib/keep-form-values'
import { focusUnlessTouch } from '@/components/ui/focus'

export function SetupForm() {
  const [state, action] = useActionState<FormState, FormData>(setupAction, {})
  return (
    <form action={action} onReset={keepFormValues} className="flex flex-col gap-4">
      <Field label="Home Name" hint="Shown at the top of every page">
        <TextInput name="homeName" placeholder="The Maple Street house" required ref={focusUnlessTouch} />
      </Field>
      <Field label="Your Name">
        <TextInput name="displayName" autoComplete="name" required />
      </Field>
      <Field label="Email">
        <TextInput name="email" type="email" autoComplete="username" required />
      </Field>
      <Field label="Password" hint={`At least ${MIN_PASSWORD_LENGTH} characters`}>
        <TextInput name="password" type="password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} required />
      </Field>
      <FormError>{state.error}</FormError>
      <SubmitButton pendingText="Creating…">Create Account</SubmitButton>
    </form>
  )
}
