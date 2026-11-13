'use client'

/*
 * A form bound to a server action, with the refusal shown inline.
 *
 * useActionState keeps it working before hydration: without JS the browser
 * posts it and the page re-renders with the same state. Actions that create
 * something redirect on success, so most forms never see `ok`; the ones that
 * stay put (inline edits, toggles) can reset or show a short confirmation.
 *
 * React 19 resets a form after its action returns, refusal or not, which would
 * throw away what was typed when the server said no. So the form keeps its
 * values (`keepFormValues`) and clears only when `resetOnSuccess` asks it to,
 * after a success.
 */

import { useActionState, useEffect, useRef, type FormEvent, type ReactNode } from 'react'
import { keepFormValues } from '@/lib/keep-form-values'
import { FormError } from './ui/Field'
import type { ActionResult } from '@/lib/web/action'

export type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>

export function ActionForm({
  action,
  children,
  className = 'flex flex-col gap-4',
  resetOnSuccess = false,
  successText,
  onSuccess,
}: {
  action: FormAction
  children: ReactNode
  className?: string
  resetOnSuccess?: boolean
  successText?: string
  onSuccess?: (result: ActionResult) => void
}) {
  const [state, formAction] = useActionState<ActionResult, FormData>(action, {})
  const ref = useRef<HTMLFormElement>(null)
  const seen = useRef<ActionResult | null>(null)
  const clearing = useRef(false)

  useEffect(() => {
    if (!state.ok || seen.current === state) return
    seen.current = state
    if (resetOnSuccess) {
      clearing.current = true
      ref.current?.reset()
      clearing.current = false
    }
    onSuccess?.(state)
  }, [state, resetOnSuccess, onSuccess])

  /* Only our own reset after a success goes through; React's after every action doesn't. */
  const onReset = (e: FormEvent<HTMLFormElement>) => {
    if (!clearing.current) keepFormValues(e)
  }

  return (
    <form ref={ref} action={formAction} onReset={onReset} className={className}>
      {children}
      <FormError>{state.error}</FormError>
      {state.ok && (state.message || successText) ? (
        <p role="status" className="text-sm text-accent">
          {state.message ?? successText}
        </p>
      ) : null}
    </form>
  )
}
