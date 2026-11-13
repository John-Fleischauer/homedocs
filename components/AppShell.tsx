'use client'

/*
 * The signed-in frame. Phone first: a bottom tab bar within thumb reach, and a
 * top bar with the search box. On a wide screen the same tabs sit in the top bar.
 */

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'
import { AddMenu } from './AddMenu'
import { Icon, type IconName } from './ui/icons'

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/places', label: 'Places', icon: 'place' },
  { href: '/projects', label: 'Projects', icon: 'project' },
  { href: '/contacts', label: 'Contacts', icon: 'contact' },
  { href: '/more', label: 'More', icon: 'more' },
]

/* Pages reached from "More" light up the More tab. */
const UNDER_MORE = ['/more', '/parts', '/fixtures', '/notes', '/guide', '/settings', '/family', '/deleted', '/share']

function activeTab(pathname: string): string {
  if (pathname === '/') return '/'
  if (UNDER_MORE.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return '/more'
  const hit = TABS.find((t) => t.href !== '/' && (pathname === t.href || pathname.startsWith(`${t.href}/`)))
  return hit?.href ?? ''
}

export function AppShell({
  homeName,
  canEdit,
  children,
}: {
  homeName: string
  canEdit: boolean
  children: ReactNode
}) {
  const pathname = usePathname() ?? '/'
  const active = activeTab(pathname)

  return (
    <div className="min-h-dvh">
      <header className="no-print sticky top-0 z-30 border-b border-line bg-card/95 backdrop-blur">
        <div className="mx-auto flex min-h-14 max-w-3xl items-center gap-3 px-4 py-2">
          <Link href="/" className="min-w-0 wrap-anywhere text-[17px] leading-snug font-semibold text-ink">
            {homeName}
          </Link>
          <nav className="ml-4 hidden shrink-0 items-center gap-1 md:flex" aria-label="Main">
            {TABS.map((tab) => (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active === tab.href ? 'page' : undefined}
                className={`rounded-control px-3 py-2 text-sm font-medium ${
                  active === tab.href ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-sunk'
                }`}
              >
                {tab.label}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Link
              href="/search"
              aria-label="Search"
              className="flex h-10 w-10 items-center justify-center rounded-full text-ink-2 hover:bg-sunk"
            >
              <Icon name="search" />
            </Link>
            {canEdit ? <AddMenu /> : null}
          </div>
        </div>
      </header>

      <main className="pb-tabs mx-auto max-w-3xl px-4 pt-4 md:pb-10">{children}</main>

      <nav
        aria-label="Main"
        className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/95 backdrop-blur md:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {TABS.map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={active === tab.href ? 'page' : undefined}
                className={`flex h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  active === tab.href ? 'text-accent' : 'text-ink-3'
                }`}
              >
                <Icon name={tab.icon} className="h-6 w-6" />
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}
