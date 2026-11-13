import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/*
 * No alpha under text (standards design.md, Tokens): the contrast check
 * measures token pairs, so a translucent fill, or a filled button that fades
 * on hover, or faded text, goes unchecked. A filled button's hover is its `-strong` fill
 * (`hover:bg-accent-strong`). Rings and borders may use alpha: no text sits on
 * them.
 */
const RULES: [string, RegExp][] = [
  ['a translucent surface fill', /(?:^|['"`\s:])bg-(?:page|card|sunk|line|ink(?:-[23])?|accent|ok|warn|danger|white|black)(?:-[\w]+)?\/(?:\d+|\[)/],
  /* Opacity on anything but a disabled control (exempt from contrast). */
  ['a faded element', /(?:^|['"`\s])(?:[\w-]+:)*opacity-(?:\d+|\[)/],
  /* Browser dialogs (standards design.md, Actions): confirm in place
     (ConfirmInline), show a refusal in place. */
  ['confirm() or alert()', /(?<![\w.$])(?:window\.)?(?:confirm|alert)\(/],
]

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(path) ? [path] : []
  })
}

describe('token classes', () => {
  const lines = [...sources('app'), ...sources('components')].flatMap((path) =>
    readFileSync(path, 'utf8')
      .split('\n')
      .map((line, i) => ({ line, where: `${path}:${i + 1}` })),
  )

  it.each(RULES)('no component uses %s', (_, pattern) => {
    const offending = lines.filter(({ line }) => pattern.test(line.replace(/(?:^|\s)disabled:opacity-\d+/g, ' ')))
    expect(offending.map(({ where }) => where)).toEqual([])
  })
})
