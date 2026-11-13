import Link from 'next/link'
import type { NoteRow } from '@/lib/notes/notes'
import { formatDay } from '@/lib/web/format'
import { Icon } from './ui/icons'

/* "Next time" lessons, shown prominently at the top of a record. */
export function Lessons({ rows }: { rows: NoteRow[] }) {
  if (rows.length === 0) return null
  return (
    <div className="mt-4 flex flex-col gap-2">
      {rows.map(({ note }) => (
        <Link
          key={note.id}
          href={`/notes/${note.id}`}
          className="flex gap-3 rounded-card border border-warn/30 bg-warn-soft px-4 py-3 text-warn"
        >
          <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0" />
          <span className="text-[15px]">
            <span className="font-semibold">Next Time:</span> {note.nextTime}
            <span className="block text-xs">
              From “{note.title}”, {formatDay(note.happenedOn)}
            </span>
          </span>
        </Link>
      ))}
    </div>
  )
}
