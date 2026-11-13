'use client'

import { usePathname, useServerInsertedHTML } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { applyTheme, PAGE_COLOR, readTheme, themeInitScript } from '@/lib/design/theme'

/**
 * The theme's two moments on the page.
 *
 * Server: the head script (`themeInitScript`), inserted into the first HTML
 * Next sends through `useServerInsertedHTML`, so a stored Light or Dark is on
 * <html> before first paint. That way the root layout needs no hand-written
 * <head>, and React doesn't warn about a <script> it rendered; the attribute
 * it sets outlives client navigations (Next's guide, preventing flash before
 * hydration).
 *
 * Client: `applyTheme` again after hydration and after each navigation, when
 * React may have placed Next's media-query theme-color metas, so the meta for
 * an explicit choice is first again. Renders nothing.
 */
export function ThemeSync() {
  const inserted = useRef(false)
  useServerInsertedHTML(() => {
    if (inserted.current) return null
    inserted.current = true
    return <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
  })

  const pathname = usePathname()
  useEffect(() => {
    applyTheme(readTheme(), PAGE_COLOR.light, PAGE_COLOR.dark)
  }, [pathname])
  return null
}
