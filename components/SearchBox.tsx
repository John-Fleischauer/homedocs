'use client'

/* A plain GET form: works before hydration, and the results page is linkable. */
import { Icon } from './ui/icons'
import { focusUnlessTouch } from './ui/focus'

export function SearchBox({ defaultValue = '', focus = false }: { defaultValue?: string; focus?: boolean }) {
  return (
    <form action="/search" method="get" role="search" className="relative">
      <Icon name="search" className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-3" />
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        ref={focus ? focusUnlessTouch : undefined}
        placeholder="Bulb, paint, plumber, shutoff…"
        aria-label="Search Everything"
        className="h-12 w-full rounded-full border border-line bg-card pl-11 pr-4 text-[16px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/30"
      />
    </form>
  )
}
