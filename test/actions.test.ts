/*
 * Server actions as a browser (or anyone else) calls them, on the real
 * database: `act()` (lib/web/action.ts) and a few actions through it.
 *
 * test/action-guards.test.ts proves every action goes through `act()`. This
 * file proves what going through it means: the session comes before the parse,
 * a malformed or tampered input is refused before anything is written, an
 * `AppError` comes back in the domain's words, a fault is logged and shown as a
 * generic failure, and `redirect()` still gets out.
 */

import { eq, sql } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { properties, spaces, users } from '../lib/db/schema'
import { db, databaseUrl, resetBetweenTests } from './helpers/db'
import { household, makeUser } from './helpers/fixtures'

const jar = vi.hoisted(() => new Map<string, string>())

/* `viewer()` reads the session and home cookies, and `next/headers` only
   answers inside a request. The token in the jar is a real session against the
   real users table, so everything under the mock is the shipped code path. */
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
  }),
}))

/* Revalidation needs Next's request store; the writes are what is under test. */
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

process.env.DATABASE_URL = databaseUrl

const { SESSION_COOKIE, createSession } = await import('../lib/auth/sessions')
const { act, FAILED } = await import('../lib/web/action')
const { GONE, RELOAD, id, text } = await import('../lib/web/fields')
const { createPlaceAction, updatePlaceAction, deletePlaceAction } = await import('../app/(app)/places/actions')
const { deleteFixtureAction } = await import('../app/(app)/fixtures/actions')
const { setRoleAction } = await import('../app/(app)/family/actions')
const { restoreAction } = await import('../app/(app)/deleted/actions')
const { saveTradesAction } = await import('../app/(app)/contacts/actions')
const { createFixture } = await import('../lib/fixtures/fixtures')

resetBetweenTests()

beforeEach(() => jar.clear())

async function signIn(role: 'admin' | 'member' | 'viewer' = 'admin') {
  const home = await household()
  const user = home.users[role]
  const { token } = await createSession(user.id, {}, db)
  jar.set(SESSION_COOKIE, token)
  return { ...home, user }
}

function form(fields: Record<string, string | string[] | File>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    for (const one of Array.isArray(value) ? value : [value]) data.append(name, one)
  }
  return data
}

/* What `redirect()` throws: Next's digest names the target. */
async function redirectedTo(promise: Promise<unknown>): Promise<string> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  const digest = (err as { digest?: string } | null)?.digest ?? ''
  expect(digest).toMatch(/^NEXT_REDIRECT/)
  return digest.split(';')[2] ?? ''
}

const allPlaces = () => db.select().from(spaces)

describe('the session comes first', () => {
  it('sends a signed-out caller to sign in, and writes nothing', async () => {
    await household() // a house with accounts, so the target is /login
    expect(await redirectedTo(createPlaceAction({}, form({ name: 'Attic' })))).toBe('/login')
    expect(await allPlaces()).toEqual([])
  })

  it('checks the session before it looks at the input', async () => {
    await household()
    // Input that would be refused, sent signed out: the answer is still the
    // sign-in redirect, so a stranger learns nothing about what parses.
    expect(await redirectedTo(updatePlaceAction('nope', {}, form({ name: 'x' })))).toBe('/login')
    const work = vi.fn()
    await redirectedTo(act({ id: 'nope' }, z.object({ id: id() }), work))
    expect(work).not.toHaveBeenCalled()
  })

  it('a session for a removed account is no session', async () => {
    const { user } = await signIn()
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, user.id))
    expect(await redirectedTo(createPlaceAction({}, form({ name: 'Attic' })))).toMatch(/^\/(login|setup)$/)
    expect(await allPlaces()).toEqual([])
  })

  it('a viewer is refused a write in the domain’s words, and nothing is written', async () => {
    await signIn('viewer')
    const result = await createPlaceAction({}, form({ name: 'Attic' }))
    expect(result.error).toBeTruthy()
    expect(result.ok).toBeUndefined()
    expect(await allPlaces()).toEqual([])
  })

  it('a member is refused an admin action', async () => {
    const { users: people } = await signIn('member')
    const result = await setRoleAction(people.viewer.id, 'admin')
    expect(result.error).toBeTruthy()
    const [row] = await db.select().from(users).where(eq(users.id, people.viewer.id))
    expect(row!.role).toBe('viewer')
  })
})

describe('refused before anything is written', () => {
  beforeEach(async () => {
    await signIn()
  })

  it('a file where text goes', async () => {
    const result = await createPlaceAction({}, form({ name: new File(['x'], 'x.txt') }))
    expect(result).toEqual({ error: RELOAD })
    expect(await allPlaces()).toEqual([])
  })

  it('overlong text', async () => {
    const result = await createPlaceAction({}, form({ name: 'x'.repeat(100_001) }))
    expect(result.error).toMatch(/too long/)
    expect(await allPlaces()).toEqual([])
  })

  it('a malformed id, bound or in the form', async () => {
    expect(await updatePlaceAction('not-a-uuid', {}, form({ name: 'Attic' }))).toEqual({ error: GONE })
    expect(await createPlaceAction({}, form({ name: 'Attic', parentId: 'not-a-uuid' }))).toEqual({ error: GONE })
    expect(await allPlaces()).toEqual([])
  })

  it('a value outside its set', async () => {
    const { users: people } = await signIn()
    expect(await setRoleAction(people.viewer.id, 'owner')).toEqual({ error: 'Pick what they can do.' })
    expect(await restoreAction('toString', crypto.randomUUID())).toEqual({ error: 'That can’t be restored.' })
    const [row] = await db.select().from(users).where(eq(users.id, people.viewer.id))
    expect(row!.role).toBe('viewer')
  })

  it('a stale-write stamp that is not a date', async () => {
    const [place] = await db.insert(spaces).values({ propertyId: (await db.select().from(properties))[0]!.id, name: 'Attic' }).returning()
    const result = await updatePlaceAction(place!.id, {}, form({ name: 'Loft', updatedAt: 'yesterday-ish' }))
    expect(result).toEqual({ error: RELOAD })
    const [after] = await db.select().from(spaces).where(eq(spaces.id, place!.id))
    expect(after!.name).toBe('Attic')
  })

  it('JSON that does not parse, or is not the shape', async () => {
    expect(await saveTradesAction({}, form({ groups: '{not json' }))).toEqual({ error: RELOAD })
    expect(await saveTradesAction({}, form({ groups: '{"label":"x"}' }))).toEqual({ error: RELOAD })
  })

  it('a way back that leaves the app', async () => {
    const [home] = await db.select().from(properties)
    const { user } = await signInAgain()
    const fixture = await createFixture(db, { propertyId: home!.id }, { userId: user.id, role: 'admin', source: 'web', requestId: crypto.randomUUID() }, { name: 'Sink' })
    for (const back of ['https://elsewhere.example', '//elsewhere.example', '/\\elsewhere.example', '']) {
      expect(await deleteFixtureAction(fixture.id, back)).toEqual({ error: RELOAD })
    }
    expect(await redirectedTo(deleteFixtureAction(fixture.id, '/fixtures'))).toBe('/fixtures')
  })
})

/* The signed-in admin of the house `beforeEach` made. */
async function signInAgain() {
  const [user] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1)
  const { token } = await createSession(user!.id, {}, db)
  jar.set(SESSION_COOKIE, token)
  return { user: user! }
}

describe('what a form sends', () => {
  beforeEach(async () => {
    await signIn()
  })

  it('a field sent twice reads the first value, as formData.get did', async () => {
    const to = await redirectedTo(createPlaceAction({}, form({ name: ['Attic', 'Cellar'], kind: 'room' })))
    const [row] = await allPlaces()
    expect(row!.name).toBe('Attic')
    expect(to).toBe(`/places/${row!.id}`)
  })

  it('a field named __proto__ is just a name', async () => {
    const work = vi.fn(async () => {})
    const data = form({ name: 'Attic' })
    data.append('__proto__', 'x')
    data.append('constructor', 'y')
    const result = await act(data, z.object({ name: text() }), work)
    expect(result.ok).toBe(true)
    expect(work).toHaveBeenCalledWith({ name: 'Attic' }, expect.anything())
    expect(({} as Record<string, unknown>).name).toBeUndefined()
  })

  it('a bound id wins over a form field of the same name', async () => {
    const [home] = await db.select().from(properties)
    const [a] = await db.insert(spaces).values({ propertyId: home!.id, name: 'A' }).returning()
    const [b] = await db.insert(spaces).values({ propertyId: home!.id, name: 'B' }).returning()
    await redirectedTo(updatePlaceAction(a!.id, {}, form({ id: b!.id, name: 'A2', kind: 'room' })))
    const rows = await db.select().from(spaces)
    expect(rows.find((r) => r.id === a!.id)!.name).toBe('A2')
    expect(rows.find((r) => r.id === b!.id)!.name).toBe('B')
  })
})

describe('what comes back', () => {
  beforeEach(async () => {
    await signIn()
  })

  it('an AppError in the domain’s own words', async () => {
    expect(await createPlaceAction({}, form({ name: '' }))).toEqual({ error: 'Give the place a name.' })
  })

  it('a record that is gone', async () => {
    expect(await deletePlaceAction(crypto.randomUUID())).toEqual({ error: expect.stringMatching(/no longer exists/) })
  })

  it('a fault is logged and shown as the generic failure', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await act({}, z.object({}), async () => {
      throw new Error('connection reset: secret detail')
    })
    expect(result).toEqual({ error: FAILED })
    expect(log).toHaveBeenCalled()
    log.mockRestore()
  })

  it('a uuid Postgres refuses reads as gone', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const result = await act({}, z.object({}), async () => {
      await db.execute(sql`select 1 from spaces where id = ${'not-a-uuid'}`)
    })
    expect(result).toEqual({ error: GONE })
    warn.mockRestore()
  })

  it('the normal path writes, and the redirect gets out', async () => {
    const to = await redirectedTo(createPlaceAction({}, form({ name: 'Attic', kind: 'room', notes: 'Hatch in the hall' })))
    const [row] = await allPlaces()
    expect(row).toMatchObject({ name: 'Attic', kind: 'room', notes: 'Hatch in the hall' })
    expect(to).toBe(`/places/${row!.id}`)
  })
})

describe('the user it acts as', () => {
  it('is the session’s, not one the input names', async () => {
    const { user } = await signIn('member')
    const other = await makeUser('admin')
    const work = vi.fn(async () => {})
    await act({ userId: other.id }, z.object({ userId: id() }), work)
    expect(work).toHaveBeenCalledWith({ userId: other.id }, expect.objectContaining({ user: expect.objectContaining({ id: user.id }) }))
  })
})
