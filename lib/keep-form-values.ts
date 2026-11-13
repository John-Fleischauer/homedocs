import { useCallback, useRef, type FormEvent } from 'react'

/*
 * React 19 resets a `<form action={fn}>` once the action returns, so a form
 * that stays on screen after the server refused the input loses what was typed
 * (the standards' design.md: forms keep what was typed). React resets through the native
 * `form.reset()`, whose cancelable "reset" event this cancels; `useFormStatus`
 * keeps working.
 *
 *   <form action={fn} onReset={keepFormValues}>
 *
 * It cancels every reset, so the form also keeps its values after a success:
 * right for an edit form, which should go on showing what was saved. A form
 * that should clear after a success uses `useClearOnSuccess` below.
 */
export function keepFormValues(e: FormEvent<HTMLFormElement>) {
  e.preventDefault()
}

/** An action result that carries an `error` is a refusal: the form keeps what was typed. */
export function isRefusal(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    'error' in result &&
    Boolean((result as { error?: unknown }).error)
  )
}

/**
 * For a form that clears after a success (an "Add …" form that stays on the
 * page) but keeps what was typed when the server refuses. Wrap the action
 * before handing it to `useActionState`:
 *
 *   const form = useClearOnSuccess(createThing)
 *   const [state, formAction] = useActionState(form.action, {})
 *   <form action={formAction} onReset={form.onReset}>
 *
 * React runs the reset after the action resolves, before the new state reaches
 * this render's closure, so the outcome travels through a ref the wrapper sets.
 */
export function useClearOnSuccess<State, Payload>(
  action: (state: Awaited<State>, payload: Payload) => State | Promise<State>,
) {
  const refused = useRef(false)
  const wrapped = useCallback(
    async (state: Awaited<State>, payload: Payload): Promise<State> => {
      /* Refused until it says otherwise: an action that throws (a dropped
         connection) keeps what was typed too. */
      refused.current = true
      const result = await action(state, payload)
      refused.current = isRefusal(result)
      return result
    },
    [action],
  )
  const onReset = useCallback((e: FormEvent<HTMLFormElement>) => {
    if (refused.current) keepFormValues(e)
  }, [])
  return { action: wrapped, onReset }
}
