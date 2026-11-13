'use client'

import { useEffect } from 'react'
import { applyTheme, PAGE_COLOR, readTheme } from '@/lib/design/theme'

/**
 * Runs `applyTheme` once more after hydration, when React has placed the
 * <head> metas, so the theme-color meta for an explicit choice is first again.
 * Renders nothing.
 */
export function ThemeSync() {
  useEffect(() => {
    applyTheme(readTheme(), PAGE_COLOR.light, PAGE_COLOR.dark)
  }, [])
  return null
}
