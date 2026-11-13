'use client'

import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react'
import { buttonClass, type Variant } from './ui/Button'
import { InlineError } from './useRun'

/**
 * A button that asks in place before it acts (standards design.md, Actions):
 * pressed, it is replaced by "<verb>?" with the verb and Cancel. Focus moves
 * to Cancel, the safe answer to a stray Enter, and back to the trigger when it
 * closes; Escape or a tap outside cancels. A refusal is shown in place, beside
 * the trigger, never in a browser dialog.
 */
export function ConfirmInline({
  action,
  verb,
  subject,
  trigger,
  triggerClass,
  triggerLabel,
  variant = 'danger',
  note,
  pendingText,
}: {
  action: () => Promise<unknown>
  /** The verb, on the question and the confirm button ("Delete", "Turn Off"). */
  verb: string
  /** What it acts on, for screen readers ("Delete the hall light?"). */
  subject?: string
  /** What the trigger shows; the verb by default. */
  trigger?: ReactNode
  triggerClass?: string
  /** The trigger's accessible name when it shows only an icon. */
  triggerLabel?: string
  /** The confirm button's style. */
  variant?: Variant
  /** One line under the question: what can or can't be had back. */
  note?: string
  pendingText?: string
}) {
  const [pending, start] = useTransition()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const groupRef = useRef<HTMLSpanElement>(null)
  const wasOpen = useRef(false)

  /* Back to the trigger once it closes, and once a confirmed action has
     finished: while it runs the trigger is disabled and can't take focus. */
  useEffect(() => {
    if (open) {
      cancelRef.current?.focus()
      wasOpen.current = true
    } else if (wasOpen.current && !pending) {
      triggerRef.current?.focus()
      wasOpen.current = false
    }
  }, [open, pending])

  /* A tap outside cancels: pointer events rather than blur, because Safari
     doesn't focus a button it taps, so a blur would close the group before the
     tap on the verb arrived. A tap, not a touch: a drag that scrolls the page
     to reread the record (moving more than a few pixels) leaves it open. */
  useEffect(() => {
    if (!open) return
    let start: { x: number; y: number; outside: boolean } | null = null
    const onDown = (event: PointerEvent) => {
      start = { x: event.clientX, y: event.clientY, outside: !groupRef.current?.contains(event.target as Node) }
    }
    const onUp = (event: PointerEvent) => {
      if (start?.outside && Math.hypot(event.clientX - start.x, event.clientY - start.y) < 10) setOpen(false)
      start = null
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('pointerup', onUp)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('pointerup', onUp)
    }
  }, [open])

  if (!open) {
    /* The refusal sits under the trigger, in one box, so it never becomes an
       extra item in the caller's row. */
    return (
      <span className="inline-flex max-w-full flex-col items-end gap-1">
        <button
          ref={triggerRef}
          type="button"
          disabled={pending}
          aria-label={triggerLabel}
          title={triggerLabel}
          className={triggerClass ?? buttonClass(variant)}
          onClick={() => {
            setError(null)
            setOpen(true)
          }}
        >
          {pending && pendingText ? pendingText : (trigger ?? verb)}
        </button>
        <InlineError className="max-w-56 text-right">{error}</InlineError>
      </span>
    )
  }
  return (
    <span
      ref={groupRef}
      role="group"
      aria-label={subject ? `${verb} ${subject}?` : `${verb}?`}
      className="inline-flex max-w-full flex-wrap items-center justify-end gap-2"
      onKeyDown={(event) => {
        if (event.key === 'Escape') setOpen(false)
      }}
    >
      <span className="text-sm font-medium text-ink">{verb}?</span>
      <button
        type="button"
        className={buttonClass(variant)}
        onClick={() => {
          setOpen(false)
          start(async () => {
            const result = (await action()) as { error?: string } | undefined
            if (result?.error) setError(result.error)
          })
        }}
      >
        {verb}
      </button>
      <button ref={cancelRef} type="button" className={buttonClass('secondary')} onClick={() => setOpen(false)}>
        Cancel
      </button>
      {note ? <span className="basis-full text-right text-xs text-ink-3">{note}</span> : null}
    </span>
  )
}
