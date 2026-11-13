import Link from 'next/link'
import type { SystemSummary } from '@/lib/systems/systems'
import { systemIcon } from '@/lib/systems/seeds'
import { Icon } from './ui/icons'

export function systemDetail(s: { fixtures: number; guide: number }) {
  if (s.fixtures === 0) return 'Nothing yet'
  const n = `${s.fixtures} fixture${s.fixtures === 1 ? '' : 's'}`
  return s.guide ? `${n} · ${s.guide} on the guide` : n
}

/* Home's second way in, beside places: one tile per system that has something in it. */
export function SystemTiles({ systems }: { systems: SystemSummary[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2">
      {systems.map((s) => (
        <li key={s.id} className="min-w-0">
          <Link
            href={`/systems/${s.id}`}
            className="flex min-h-18 items-center gap-2.5 rounded-card border border-line bg-card px-3 py-3 hover:bg-sunk"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent">
              <Icon name={systemIcon(s.icon)} className="h-[18px] w-[18px]" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="wrap-anywhere text-[15px] font-medium leading-tight text-ink">{s.name}</span>
              <span className="text-xs text-ink-3">{systemDetail(s)}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
