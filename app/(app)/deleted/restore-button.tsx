'use client'

import { useState, useTransition } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { InlineError } from '@/components/useRun'
import { restoreAction } from './actions'

export function RestoreButton({ kind, id }: { kind: string; id: string }) {
  const [pending, start] = useTransition()
  const [error, setError] = useState<string | null>(null)
  return (
    <span className="flex shrink-0 flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        className={buttonClass('secondary', 'min-h-9 px-3 text-sm')}
        onClick={() =>
          start(async () => {
            setError(null)
            const r = await restoreAction(kind, id)
            if (r.error) setError(r.error)
          })
        }
      >
        {pending ? 'Restoring…' : 'Restore'}
      </button>
      <InlineError className="max-w-56 text-right">{error}</InlineError>
    </span>
  )
}
