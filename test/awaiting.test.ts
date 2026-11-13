/*
 * A single sign-on that matches nobody: an account with no access, waiting on
 * the Family page for an admin to place it (docs/DECISIONS.md).
 *
 * What it must never reach before then is everything a family member can: the
 * house guide's codes most of all. So each way in is tried with an awaiting
 * account's credentials, real ones minted against the real tables: a session
 * cookie, an MCP bearer token, a refresh token, a password reset, and the
 * share-link screen. And existing accounts, including ones an earlier sign-on
 * created with access, are unaffected.
 */

import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { auditLog, users } from '../lib/db/schema'
import { db, databaseUrl, resetBetweenTests } from './helpers/db'
import { household, makeProperty, makeUser } from './helpers/fixtures'

const jar = vi.hoisted(() => new Map<string, string>())
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (jar.has(name) ? { name, value: jar.get(name) } : undefined),
  }),
  headers: async () => new Headers(),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

process.env.DATABASE_URL = databaseUrl
process.env.PUBLIC_BASE_URL = 'https://homedocs.example.test'

const { resolveOidcAccount } = await import('../lib/auth/oidc-accounts')
const { SESSION_COOKIE, createSession, resolveSession } = await import('../lib/auth/sessions')
const users_ = await import('../lib/auth/users')
const { createReset } = await import('../lib/auth/invites')
const { registerClient } = await import('../lib/oauth/clients')
const { issueTokenPair, resolveBearer, rotateRefreshToken } = await import('../lib/oauth/grants')
const { POST: mcp } = await import('../app/mcp/route')
const { createShareAction } = await import('../app/(app)/share/actions')
const { placeAction, removeAwaitingAction, setRoleAction, addMemberAction } = await import('../app/(app)/family/actions')

resetBetweenTests()
beforeEach(() => jar.clear())

const ISSUER = 'https://id.example.test'
const claims = (email: string, subject = `sub-${email}`) => ({
  issuer: ISSUER,
  subject,
  email,
  emailVerified: true,
  name: 'Someone New',
})
const options = { trustEmail: false }

async function awaitingAccount(email = 'new@example.test') {
  expect(await resolveOidcAccount(claims(email), options, db)).toEqual({ kind: 'refused', reason: 'awaiting-placement' })
  const [row] = await db.select().from(users).where(eq(users.email, email))
  return row!
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData()
  for (const [name, value] of Object.entries(fields)) data.append(name, value)
  return data
}

async function redirectedTo(promise: Promise<unknown>): Promise<string> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  )
  const digest = (err as { digest?: string } | null)?.digest ?? ''
  expect(digest).toMatch(/^NEXT_REDIRECT/)
  return digest.split(';')[2] ?? ''
}

async function signInAs(userId: string) {
  const { token } = await createSession(userId, {}, db)
  jar.set(SESSION_COOKIE, token)
  return token
}

describe('a sign-on that matches nobody', () => {
  it('makes an account with no access, audited, and starts no session', async () => {
    await household()
    const row = await awaitingAccount()
    expect(row).toMatchObject({ awaitingPlacement: true, role: 'viewer', oidcIssuer: ISSUER, passwordHash: null })
    const audit = await db.select().from(auditLog).where(eq(auditLog.entityId, row.id))
    expect(audit).toHaveLength(1)
    expect(audit[0]!.after).toMatchObject({ awaitingPlacement: true, sso: true })

    // Signing on again finds them by identity, still waiting.
    expect(await resolveOidcAccount(claims('new@example.test'), options, db)).toEqual({ kind: 'refused', reason: 'awaiting-placement' })
    expect(await db.select().from(users).where(eq(users.email, 'new@example.test'))).toHaveLength(1)
  })

  it('is never the first account: an empty house is set up at /setup', async () => {
    expect(await resolveOidcAccount(claims('first@example.test'), options, db)).toEqual({ kind: 'refused', reason: 'setup' })
    expect(await db.select().from(users)).toEqual([])
  })

  it('stays off the family list and on the awaiting one', async () => {
    await household()
    const row = await awaitingAccount()
    expect((await users_.listUsers()).map((u) => u.id)).not.toContain(row.id)
    expect((await users_.listAwaitingPlacement()).map((u) => u.id)).toEqual([row.id])
  })
})

describe('existing accounts are unaffected', () => {
  it('one an earlier sign-on created with access still signs in, with its role', async () => {
    await household()
    // As the old code made them: a row with an identity and a role, and the new column at its default.
    const [old] = await db
      .insert(users)
      .values({ email: 'old@example.test', displayName: 'Old', passwordHash: null, role: 'member', oidcIssuer: ISSUER, oidcSubject: 'sub-old' })
      .returning()
    expect(old!.awaitingPlacement).toBe(false)
    expect(await resolveOidcAccount(claims('old@example.test', 'sub-old'), options, db)).toMatchObject({
      kind: 'signed-in',
      via: 'identity',
      user: { id: old!.id, role: 'member' },
    })
    const token = await signInAs(old!.id)
    expect(await resolveSession(token, db)).toMatchObject({ id: old!.id, role: 'member' })
  })

  it('a password account still links on its first sign-on', async () => {
    const { users: u } = await household()
    expect(await resolveOidcAccount(claims(u.member.email, 'sub-member'), options, db)).toMatchObject({
      kind: 'signed-in',
      via: 'linked',
      user: { id: u.member.id, role: 'member' },
    })
  })
})

describe('nothing reaches the house through an awaiting account', () => {
  it('a session for it does not resolve, so no page, action or code is reachable', async () => {
    const { scope } = await household()
    const row = await awaitingAccount()
    const token = await signInAs(row.id)
    expect(await resolveSession(token, db)).toBeNull()
    // A share link (the way codes leave the house) can't be made with it: sent to sign in.
    expect(await redirectedTo(createShareAction({}, form({ label: 'Sitter', days: '7' })))).toBe('/login')
    void scope
  })

  it('an MCP bearer token for it is refused (401), and a refresh does not mint another', async () => {
    await makeProperty()
    await makeUser('admin')
    const row = await awaitingAccount()
    const client = await registerClient(db, { clientName: 'Claude', redirectUris: ['https://claude.ai/api/mcp/auth_callback'] })
    const pair = await issueTokenPair(db, {
      clientId: client.id,
      userId: row.id,
      scopes: ['homedocs:read'],
      resource: 'https://homedocs.example.test/mcp',
    })
    expect(await resolveBearer(db, pair.accessToken)).toBeNull()

    const response = await mcp(
      new Request('https://homedocs.example.test/mcp', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${pair.accessToken}`,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
      }),
    )
    expect(response.status).toBe(401)

    await expect(rotateRefreshToken(db, { refreshToken: pair.refreshToken, clientId: client.id })).rejects.toMatchObject({
      code: 'invalid_grant',
    })
  })

  it('no password reset link can be made for it', async () => {
    const { admin } = await household()
    const row = await awaitingAccount()
    await expect(createReset(row.id, admin, db)).rejects.toThrow(/No such person/)
  })

  it('its role can’t be changed around placement', async () => {
    const { users: u } = await household()
    const row = await awaitingAccount()
    await signInAs(u.admin.id)
    expect(await setRoleAction(row.id, 'admin')).toEqual({ error: expect.stringMatching(/waiting/) })
    const [after] = await db.select().from(users).where(eq(users.id, row.id))
    expect(after).toMatchObject({ awaitingPlacement: true, role: 'viewer' })
  })
})

describe('placing it', () => {
  it('an admin lets it in with a role; then a session works', async () => {
    const { users: u } = await household()
    const row = await awaitingAccount()
    await signInAs(u.admin.id)
    expect(await placeAction(row.id, {}, form({ role: 'member' }))).toMatchObject({ ok: true })
    const [after] = await db.select().from(users).where(eq(users.id, row.id))
    expect(after).toMatchObject({ awaitingPlacement: false, role: 'member' })
    const audit = await db.select().from(auditLog).where(eq(auditLog.entityId, row.id))
    expect(audit.at(-1)!.after).toEqual({ awaitingPlacement: false, role: 'member' })

    expect(await resolveOidcAccount(claims('new@example.test'), options, db)).toMatchObject({ kind: 'signed-in', via: 'identity' })
    const token = await signInAs(row.id)
    expect(await resolveSession(token, db)).toMatchObject({ id: row.id, role: 'member' })

    // Placed once; a second click finds nothing waiting.
    await signInAs(u.admin.id)
    expect(await placeAction(row.id, {}, form({ role: 'admin' }))).toEqual({ error: expect.stringMatching(/no longer waiting/) })
  })

  it('a member can’t let anyone in', async () => {
    const { users: u } = await household()
    const row = await awaitingAccount()
    await signInAs(u.member.id)
    expect((await placeAction(row.id, {}, form({ role: 'admin' }))).error).toBeTruthy()
    const [after] = await db.select().from(users).where(eq(users.id, row.id))
    expect(after!.awaitingPlacement).toBe(true)
  })

  it('removing it turns the next sign-on away, and Add Person can still bring them in', async () => {
    const { users: u } = await household()
    const row = await awaitingAccount()
    await signInAs(u.admin.id)
    expect(await removeAwaitingAction(row.id)).toMatchObject({ ok: true })
    expect(await resolveOidcAccount(claims('new@example.test'), options, db)).toEqual({ kind: 'refused', reason: 'removed' })

    expect(await addMemberAction({}, form({ displayName: 'New', email: 'new@example.test', role: 'viewer' }))).toMatchObject({ ok: true })
    const [back] = await db.select().from(users).where(eq(users.id, row.id))
    expect(back).toMatchObject({ awaitingPlacement: false, deletedAt: null, role: 'viewer' })
  })

  it('Add Person points at the awaiting list rather than making a second account', async () => {
    const { users: u } = await household()
    await awaitingAccount()
    await signInAs(u.admin.id)
    expect(await addMemberAction({}, form({ displayName: 'New', email: 'new@example.test', role: 'member' }))).toEqual({
      error: expect.stringMatching(/Awaiting Placement/),
    })
  })
})
