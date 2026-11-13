/*
 * Server-side sessions.
 *
 * Opaque 256-bit token, keyed-hashed at rest, delivered as an httpOnly cookie.
 * Server-side rather than a stateless JWT so that sessions are revocable — a
 * role change or a password reset signs the person out everywhere.
 *
 * Sliding: a family member who opens the app once a month should not be asked
 * for a password they set once and forgot. Each use pushes expiry out to 30 days
 * from now (at most once a day, to keep reads cheap). The cookie itself is long
 * lived; the row's expires_at is what decides.
 */

import { and, eq, gt, lt } from 'drizzle-orm'
import { liveAccount } from './live'
import { db } from '../db'
import { sessions, users } from '../db/schema'
import type { Executor, Role } from '../core/types'
import { generateToken, hashToken } from './tokens'

export const SESSION_COOKIE = 'homedocs_session'

export const SESSION_TTL_DAYS = 30
const DAY_MS = 24 * 60 * 60 * 1000

export type AuthUser = {
  id: string
  email: string
  displayName: string
  role: Role
}

export type NewSession = { token: string; expiresAt: Date }

export async function createSession(
  userId: string,
  meta: { userAgent?: string | null; ip?: string | null } = {},
  exec: Executor = db,
): Promise<NewSession> {
  const token = generateToken()
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * DAY_MS)

  await exec.insert(sessions).values({
    id: hashToken(token),
    userId,
    expiresAt,
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  })

  // The plaintext token is returned once and never stored. Nothing logs it.
  return { token, expiresAt }
}

/**
 * Resolve a cookie value to a user, or null. Filters removed users as well as
 * expired sessions: removing somebody has to actually lock them out.
 */
export async function resolveSession(
  token: string | undefined,
  exec: Executor = db,
): Promise<AuthUser | null> {
  if (!token) return null

  const id = hashToken(token)
  const now = new Date()
  const [row] = await exec
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      expiresAt: sessions.expiresAt,
      lastUsedAt: sessions.lastUsedAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    /* Nor does an account awaiting placement resolve: it has no access until an
       admin lets it in, whatever session might exist for it (liveAccount). */
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now), liveAccount()))
    .limit(1)

  if (!row) return null

  if (now.getTime() - row.lastUsedAt.getTime() > DAY_MS) {
    await exec
      .update(sessions)
      .set({ lastUsedAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_DAYS * DAY_MS) })
      .where(eq(sessions.id, id))
  }

  return { id: row.id, email: row.email, displayName: row.displayName, role: row.role }
}

export async function revokeSession(token: string, exec: Executor = db): Promise<void> {
  await exec.delete(sessions).where(eq(sessions.id, hashToken(token)))
}

/** Everything for one user — what a role change, reset or removal does. */
export async function revokeAllSessions(userId: string, exec: Executor = db): Promise<void> {
  await exec.delete(sessions).where(eq(sessions.userId, userId))
}

export async function purgeExpiredSessions(exec: Executor = db): Promise<void> {
  await exec.delete(sessions).where(lt(sessions.expiresAt, new Date()))
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  // HTTPS is required in production (camera upload needs a secure context, and
  // OAuth redirect URIs must be HTTPS). Relaxed only for local development.
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  /* The browser keeps the cookie for a year; the session row's sliding expiry
     is what actually decides, so a stolen cookie still dies with its row. */
  maxAge: 365 * 24 * 60 * 60,
}
