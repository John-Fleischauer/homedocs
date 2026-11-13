'use client'

import Link from 'next/link'
import { useTransition } from 'react'
import { buttonClass } from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { Icon } from '@/components/ui/icons'
import type { NoteRow } from '@/lib/notes/notes'
import type { ActionResult } from '@/lib/web/action'
import { formatDay } from '@/lib/web/format'
import { addLessonToHowToAction } from '../actions'

/* The series' one "how we do it" — read-only here, edited on the series so it can't drift. */
export function HowTo({ seriesId, text, canEdit }: { seriesId: string; text: string; canEdit: boolean }) {
  if (!text && !canEdit) return null
  return (
    <Card className="mt-4 px-4 py-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-3">Instructions</h2>
        {canEdit ? (
          <Link href={`/projects/series/${seriesId}/edit`} className="inline-flex min-h-11 items-center text-sm text-accent">
            Edit
          </Link>
        ) : null}
      </div>
      {text ? (
        <p className="whitespace-pre-wrap text-[15px] text-ink-2">{text}</p>
      ) : (
        <p className="text-sm text-ink-3">Nothing written yet</p>
      )}
    </Card>
  )
}

/* Last round's "next time" lessons, each one tap from becoming part of the how-to. */
export function LastTime({ lessons, seenAt, canEdit, howTo }: { lessons: NoteRow[]; seenAt: string; canEdit: boolean; howTo: string }) {
  const [pending, start] = useTransition()
  if (lessons.length === 0) return null
  return (
    <div className="mt-4 flex flex-col gap-2">
      {lessons.map(({ note }) => (
        <div key={note.id} className="flex gap-3 rounded-card border border-warn/30 bg-warn-soft px-4 py-3 text-warn">
          <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="min-w-0 flex-1 text-[15px]">
            <span className="font-semibold">Last Time:</span> {note.nextTime}
            <Link href={`/notes/${note.id}`} className="block text-xs">
              From “{note.title}”, {formatDay(note.happenedOn)}
            </Link>
            {canEdit && !howTo.includes(note.nextTime) ? (
              <button
                type="button"
                disabled={pending}
                className="mt-1 inline-flex min-h-11 items-center text-sm font-medium underline"
                onClick={() => {
                  if (!confirm(`Add this to the series instructions? Every project in the series will show it.\n\n“${note.nextTime}”`)) return
                  start(async () => {
                    const result = await addLessonToHowToAction(note.id, seenAt)
                    if (result.error) alert(result.error)
                  })
                }}
              >
                Add to Instructions
              </button>
            ) : null}
          </span>
        </div>
      ))}
    </div>
  )
}

export function MakeSeriesButton({ title, make }: { title: string; make: () => Promise<ActionResult> }) {
  const [pending, start] = useTransition()
  return (
    <div className="mt-8 border-t border-line pt-6">
      <p className="mb-2 px-1 text-sm text-ink-3">Reuse this checklist and materials next time</p>
      <button
        type="button"
        disabled={pending}
        className={buttonClass('secondary')}
        onClick={() => {
          if (!confirm(`Make “${title}” a series? Its checklist and materials become the defaults for next time, and its details become the instructions.`)) return
          start(async () => {
            const result = await make()
            if (result?.error) alert(result.error)
          })
        }}
      >
        {pending ? 'Making…' : 'Make Series'}
      </button>
    </div>
  )
}
