/*
 * The guards on server actions and their forms, read from the source.
 *
 * A server action is a public endpoint: the (app) layout's session check covers
 * the page, not a POST to the action's id. So every action authenticates and
 * parses its own input, through `act()` (lib/web/action.ts), before anything
 * else runs. That is one line per action that a refactor can lose without any
 * behaviour test noticing, which is why it is checked here, for all of them.
 *
 * The forms half: React 19 resets a `<form action={fn}>` after every action,
 * so a refusal would clear what was typed. Every form that posts to an action
 * says what it does on reset (`keepFormValues`, `useClearOnSuccess`, or
 * `ActionForm`, which does it for its children).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

const ROOT = new URL('../', import.meta.url).pathname

/* Sign-in, setup, joining, sign-out, the OAuth consent screen and the share
   link's PIN start or end a session (or stand in for one), so they can't take
   one first. They are the trust-boundary work of the next change. */
const NOT_ACT = new Set(['app/(auth)/actions.ts', 'app/oauth/authorize/actions.ts', 'app/g/[token]/actions.ts'])

function files(dir: string, ext: RegExp): string[] {
  const out: string[] = []
  for (const name of readdirSync(join(ROOT, dir))) {
    const path = join(dir, name)
    if (statSync(join(ROOT, path)).isDirectory()) out.push(...files(path, ext))
    else if (ext.test(name)) out.push(path)
  }
  return out
}

function parse(path: string): ts.SourceFile {
  const text = readFileSync(join(ROOT, path), 'utf8')
  const kind = path.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  return ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, kind)
}

/* A module whose first statement is the 'use server' directive. */
function isServerModule(source: ts.SourceFile): boolean {
  const first = source.statements[0]
  return (
    first !== undefined &&
    ts.isExpressionStatement(first) &&
    ts.isStringLiteral(first.expression) &&
    first.expression.text === 'use server'
  )
}

const serverModules = [...files('app', /\.tsx?$/), ...files('components', /\.tsx?$/), ...files('lib', /\.tsx?$/)].filter(
  (path) => isServerModule(parse(path)),
)

type Action = { file: string; name: string; body: ts.Block }

function isExported(statement: ts.Statement): boolean {
  return ts.canHaveModifiers(statement)
    ? (ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) ?? false)
    : false
}

function exportedFunctions(file: string): Action[] {
  const out: Action[] = []
  for (const statement of parse(file).statements) {
    if (!isExported(statement)) continue
    if (ts.isFunctionDeclaration(statement) && statement.body && statement.name) {
      out.push({ file, name: statement.name.text, body: statement.body })
    }
  }
  return out
}

/* The first statement that does anything hands the input to act():
   `return act(...)`, `await act(...)` or `const r = await act(...)`. A plain
   `let to = ''` before it (where to go afterwards) runs nothing. */
function startsWithAct(body: ts.Block): boolean {
  const statements = body.statements.filter(
    (s) =>
      !(
        ts.isVariableStatement(s) &&
        s.declarationList.declarations.every((d) => !d.initializer || ts.isStringLiteral(d.initializer))
      ),
  )
  const first = statements[0]
  if (!first) return false
  let expression: ts.Expression | undefined
  if (ts.isReturnStatement(first)) expression = first.expression
  else if (ts.isExpressionStatement(first)) expression = first.expression
  else if (ts.isVariableStatement(first)) expression = first.declarationList.declarations[0]?.initializer
  if (expression && ts.isAwaitExpression(expression)) expression = expression.expression
  return (
    expression !== undefined &&
    ts.isCallExpression(expression) &&
    ts.isIdentifier(expression.expression) &&
    expression.expression.text === 'act'
  )
}

describe('server actions', () => {
  it('finds the action modules', () => {
    expect(serverModules.length).toBeGreaterThan(10)
    for (const file of NOT_ACT) expect(serverModules).toContain(file)
  })

  it('every exported action starts by handing its input to act()', () => {
    const offenders = serverModules
      .filter((file) => !NOT_ACT.has(file))
      .flatMap(exportedFunctions)
      .filter((action) => !startsWithAct(action.body))
      .map((action) => `${action.file}: ${action.name}`)
    expect(offenders).toEqual([])
  })

  it('no action reads FormData itself', () => {
    const offenders = serverModules
      .filter((file) => !NOT_ACT.has(file))
      .filter((file) => /\b(fd|form|formData|data)\.(get|getAll|has|entries)\(/.test(readFileSync(join(ROOT, file), 'utf8')))
    expect(offenders).toEqual([])
  })

  it('exports only async functions and types', () => {
    const offenders: string[] = []
    for (const file of serverModules) {
      const source = parse(file)
      for (const statement of source.statements) {
        if (!isExported(statement)) continue
        if (ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement)) continue
        const isAsync =
          ts.isFunctionDeclaration(statement) &&
          ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
        if (!isAsync) offenders.push(`${file}: line ${source.getLineAndCharacterOfPosition(statement.getStart()).line + 1}`)
      }
    }
    expect(offenders).toEqual([])
  })
})

describe('forms', () => {
  /* A field a person types or picks into: what a reset would throw away. */
  function typedFields(node: ts.Node, source: ts.SourceFile): number {
    let count = 0
    const visit = (child: ts.Node) => {
      if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) {
        const tag = child.tagName.getText(source)
        const type = child.attributes.properties
          .filter(ts.isJsxAttribute)
          .find((a) => a.name.getText(source) === 'type')
          ?.initializer?.getText(source)
        if (['textarea', 'select', 'TextInput', 'TextArea', 'Select', 'Checkbox'].includes(tag)) count++
        else if (tag === 'input' && type !== '"hidden"') count++
      }
      ts.forEachChild(child, visit)
    }
    ts.forEachChild(node, visit)
    return count
  }

  it('every form that posts to an action says what happens on reset', () => {
    const offenders: string[] = []
    for (const file of [...files('app', /\.tsx$/), ...files('components', /\.tsx$/)]) {
      const source = parse(file)
      const client = source.text.trimStart().startsWith("'use client'")
      const visit = (node: ts.Node) => {
        const opening = ts.isJsxElement(node) ? node.openingElement : ts.isJsxSelfClosingElement(node) ? node : null
        if (opening && opening.tagName.getText(source) === 'form') {
          const attributes = opening.attributes.properties.filter(ts.isJsxAttribute)
          const attr = (name: string) => attributes.find((a) => a.name.getText(source) === name)
          /* `method="get"` is a search form: the browser navigates, nothing is
             reset. Only a form with an action expression posts to an action. */
          const get = attr('method')?.initializer?.getText(source) === '"get"'
          const action = attr('action')
          const posts = !get && action?.initializer !== undefined && ts.isJsxExpression(action.initializer)
          /* A server component can't take an event handler; its forms must be
             buttons over hidden fields, with nothing typed to lose. */
          const covered = client ? attr('onReset') !== undefined : typedFields(node, source) === 0
          if (posts && !covered) {
            const line = source.getLineAndCharacterOfPosition(node.getStart()).line + 1
            offenders.push(`${file}:${line}`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(source)
    }
    expect(offenders).toEqual([])
  })
})
