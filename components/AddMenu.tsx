'use client'

/*
 * The "+" in the top bar: a menu of what can be added, right where the thumb
 * is, instead of a page in between. On a place or a fixture, the choices fill
 * in where. Without JavaScript the button is a link to /add.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState } from 'react'
import { addItems } from '@/lib/web/add-items'
import { Icon } from './ui/icons'

export function AddMenu() {
  const pathname = usePathname() ?? '/'
  // Remembering where it was opened closes it on any navigation, Back included.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === pathname
  const setOpen = (next: boolean | ((was: boolean) => boolean)) =>
    setOpenAt((typeof next === 'function' ? next(open) : next) ? pathname : null)
  const root = useRef<HTMLDivElement>(null)
  const menuId = useId()

  // Close on a tap outside, or Escape.
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpenAt(null)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenAt(null)
    }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    root.current?.querySelector<HTMLElement>('[role=menuitem]')?.focus()
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    /* Not positioned on a phone, so the menu hangs from the (sticky) header
       across the screen, below however many lines the home name takes. */
    <div ref={root} className="sm:relative">
      <a
        href="/add"
        role="button"
        aria-label="Add something"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.preventDefault()
          setOpen((o) => !o)
        }}
        className="flex h-10 w-10 items-center justify-center rounded-full bg-accent text-accent-ink"
      >
        <Icon name={open ? 'close' : 'plus'} />
      </a>
      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label="Add something"
          className="absolute inset-x-4 top-full z-40 mt-1 overflow-hidden rounded-card border border-line bg-card shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:w-80"
        >
          <ul className="divide-y divide-line">
            {addItems(pathname).map((item) => (
              <li key={item.title} role="none">
                <Link
                  role="menuitem"
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-sunk focus:bg-sunk focus:outline-none"
                >
                  <Icon name={item.icon} className="h-5 w-5 shrink-0 text-accent" />
                  <span className="min-w-0">
                    <span className="block text-[15px] font-medium text-ink">{item.title}</span>
                    <span className="block text-xs text-ink-3">{item.detail}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
