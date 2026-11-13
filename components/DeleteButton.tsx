'use client'

import { ConfirmInline } from './ConfirmInline'
import { buttonClass, type Variant } from './ui/Button'
import { Icon } from './ui/icons'

/* Asks in place, then runs the action. Deletes are recoverable from Recently Deleted. */
export function DeleteButton({
  action,
  what,
  label = 'Delete',
  variant = 'danger',
  compact = false,
  recoverable = true,
  className = '',
}: {
  action: () => Promise<unknown>
  what: string
  label?: string
  variant?: Variant
  compact?: boolean
  /** False when there is no Recently Deleted to bring it back from. */
  recoverable?: boolean
  /** Extra classes on the trigger. */
  className?: string
}) {
  return (
    <ConfirmInline
      action={action}
      verb={label}
      subject={what}
      variant="danger"
      note={recoverable ? 'Restorable from Recently Deleted' : undefined}
      pendingText={compact ? undefined : 'Deleting…'}
      trigger={compact ? <Icon name="trash" className="h-[18px] w-[18px]" /> : undefined}
      triggerLabel={compact ? `${label} ${what}` : undefined}
      triggerClass={
        compact
          ? 'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-sunk hover:text-danger ' + className
          : buttonClass(variant, className)
      }
    />
  )
}
