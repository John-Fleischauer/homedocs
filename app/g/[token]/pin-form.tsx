'use client'

import { useActionState } from 'react'
import { Card } from '@/components/ui/Card'
import { FormError, SubmitButton, TextInput } from '@/components/ui/Field'
import { unlockAction, type UnlockState } from './actions'
import { keepFormValues } from '@/lib/keep-form-values'

export function PinForm({ token }: { token: string }) {
  const [state, action] = useActionState<UnlockState, FormData>(unlockAction.bind(null, token), {})
  return (
    <Card className="p-4">
      <p className="text-[15px] font-medium text-ink">Codes and Address Hidden</p>
      <p className="mb-3 text-sm text-ink-3">Shown on the house Wi-Fi. Away from the house, enter the PIN you were sent.</p>
      <form action={action} onReset={keepFormValues} className="flex flex-col gap-2">
        <div className="flex gap-2">
          <TextInput name="pin" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={8} placeholder="PIN" aria-label="PIN" required />
          <SubmitButton pendingText="…">Unlock</SubmitButton>
        </div>
        <FormError>{state.error}</FormError>
      </form>
    </Card>
  )
}
