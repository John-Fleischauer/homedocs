import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { PAGE_COLOR } from '@/lib/design/theme'

/*
 * Every text/background token pair meets WCAG AA (4.5:1) in both themes
 * (standards design.md, Contrast), read from app/globals.css itself, so a
 * changed value is checked by the next `pnpm test`. A new pair a component
 * uses (text on a fill) gets a line in PAIRS.
 */

const css = readFileSync('app/globals.css', 'utf8')

/** The `--color-*` values declared directly in the block that opens with `opener`. */
function block(opener: string): Record<string, string> {
  const start = css.indexOf(opener)
  if (start < 0) throw new Error(`no ${opener} in app/globals.css`)
  const open = css.indexOf('{', start)
  const close = css.indexOf('}', open)
  const values: Record<string, string> = {}
  for (const m of css.slice(open + 1, close).matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) {
    values[m[1]!] = m[2]!.toLowerCase()
  }
  return values
}

const light = block('@theme')
const dark = block(':root[data-theme="dark"]')
const darkBySystem = block(':root:not([data-theme="light"])')

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi! + 0.05) / (lo! + 0.05)
}

const SURFACES = ['page', 'card', 'sunk']
const PAIRS: [fg: string, bg: string][] = [
  ...['ink', 'ink-2', 'ink-3', 'accent', 'warn', 'danger', 'ok'].flatMap((fg) => SURFACES.map((bg): [string, string] => [fg, bg])),
  ['ink', 'accent-soft'],
  ['ink-3', 'accent-soft'],
  ['accent', 'accent-soft'],
  ['accent-ink', 'accent'],
  ['accent-ink', 'accent-strong'],
  ['ok', 'ok-soft'],
  ['ok-ink', 'ok'],
  ['warn', 'warn-soft'],
  ['warn-ink', 'warn'],
  ['danger', 'danger-soft'],
  ['danger-ink', 'danger'],
]

const STANDARD = [
  'page', 'card', 'sunk', 'line', 'ink', 'ink-2', 'ink-3',
  'accent', 'accent-ink', 'accent-soft', 'ok', 'ok-ink', 'ok-soft',
  'warn', 'warn-ink', 'warn-soft', 'danger', 'danger-ink', 'danger-soft',
]

describe('colour tokens', () => {
  it('both themes set every standard token', () => {
    for (const theme of [light, dark]) expect(STANDARD.filter((t) => !theme[t])).toEqual([])
  })

  it('the two dark blocks are the same', () => {
    expect(darkBySystem).toEqual(dark)
  })

  it('the browser-bar colours are the page colour', () => {
    expect(PAGE_COLOR.light).toBe(light.page)
    expect(PAGE_COLOR.dark).toBe(dark.page)
  })

  it.each([
    ['light', light],
    ['dark', dark],
  ])('every text pair meets AA in %s', (_, theme) => {
    const failing = PAIRS.map(([fg, bg]) => ({ pair: `${fg} on ${bg}`, ratio: contrast(theme[fg]!, theme[bg]!) }))
      .filter(({ ratio }) => !(ratio >= 4.5))
      .map(({ pair, ratio }) => `${pair}: ${ratio.toFixed(2)}`)
    expect(failing).toEqual([])
  })
})
