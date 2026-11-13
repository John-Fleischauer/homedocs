/*
 * Invite and reset links — how family members get in without anyone typing a
 * password on their behalf.
 *
 * An admin makes a link on the Family page and sends it however the family
 * already talks (text, in person). The link is single-use and expires in seven
 * days. Opening it lets the person set their own name and password (`invite`)
 * or a new password (`reset`). Only the HMAC of the token is stored, so the
 * table is useless to anyone who reads it.
 */

import { and, desc, eq, gt, isNull } from 'drizzle-orm'
import { recordAudit } from '../core/audit'
import { inTransaction } from '../core/internal'
import { assertAdmin, ValidationError, type ActorContext, type Executor, type Role } from '../core/types'
import { db } from '../db'
import { invites, users } from '../db/schema'
import { absoluteUrl } from '../web/urls'
import { hashPassword } from './password'
import { findUserByEmail, insertUser, setPassword, validateNewUser } from './users'
import { generateToken, hashToken } from './tokens'
import type { AuthUser } from './sessions'

export const INVITE_TTL_DAYS = 7

export function inviteUrl(token: string): string {
  return absoluteUrl(`/join/${token}`)
}

export async function createInvite(
  input: { role: Role; label: string },
  actor: ActorContext,
  exec: Executor = db,
): Promise<{ token: string; url: string }> {
  assertAdmin(actor)
  const token = generateToken()
  await inTransaction(exec, async (tx) => {
    await tx.insert(invites).values({
      id: hashToken(token),
      kind: 'invite',
      role: input.role,
      label: input.label.trim(),
      createdBy: actor.userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    })
    await recordAudit(tx, actor, {
      action: 'create',
      entityType: 'invite',
      entityId: crypto.randomUUID(),
      after: { role: input.role, label: input.label.trim() },
    })
  })
  return { token, url: inviteUrl(token) }
}

export async function createReset(
  userId: string,
  actor: ActorContext,
  exec: Executor = db,
): Promise<{ token: string; url: string }> {
  assertAdmin(actor)
  const [target] = await exec
    .select({ id: users.id, displayName: users.displayName, role: users.role })
    .from(users)
    /* Not for an account awaiting placement: a password would be a way in that
       skips the admin letting them in. */
    .where(and(eq(users.id, userId), isNull(users.deletedAt), eq(users.awaitingPlacement, false)))
  if (!target) throw new ValidationError('No such person.')

  const token = generateToken()
  await inTransaction(exec, async (tx) => {
    // One live reset per person: making a new one retires the old.
    await tx
      .update(invites)
      .set({ revokedAt: new Date() })
      .where(and(eq(invites.userId, userId), eq(invites.kind, 'reset'), isNull(invites.usedAt)))
    await tx.insert(invites).values({
      id: hashToken(token),
      kind: 'reset',
      role: target.role,
      userId,
      label: target.displayName,
      createdBy: actor.userId,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000),
    })
  })
  return { token, url: inviteUrl(token) }
}

export type OpenInvite = { id: string; kind: 'invite' | 'reset'; role: Role; label: string; userId: string | null }

/** The invite behind a token, if it can still be used. */
export async function findOpenInvite(token: string, exec: Executor = db): Promise<OpenInvite | null> {
  if (!token || token.length > 100) return null
  const [row] = await exec
    .select({ id: invites.id, kind: invites.kind, role: invites.role, label: invites.label, userId: invites.userId })
    .from(invites)
    .where(
      and(
        eq(invites.id, hashToken(token)),
        isNull(invites.usedAt),
        isNull(invites.revokedAt),
        gt(invites.expiresAt, new Date()),
      ),
    )
  return row ?? null
}

/**
 * Spend an invite. For `invite`, creates the account; for `reset`, sets the
 * password. The `used_at` update is conditional, so two submissions of the same
 * link cannot both succeed.
 */
export async function redeemInvite(
  token: string,
  input: { email?: string; displayName?: string; password: string },
  exec: Executor = db,
): Promise<AuthUser> {
  return inTransaction(exec, async (tx) => {
    const invite = await findOpenInvite(token, tx)
    if (!invite) throw new ValidationError('This link has expired or was already used. Ask for a new one.')

    if (invite.kind === 'reset') {
      const [user] = await tx
        .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role })
        .from(users)
        .where(and(eq(users.id, invite.userId!), isNull(users.deletedAt), eq(users.awaitingPlacement, false)))
      if (!user) throw new ValidationError('This account no longer exists.')
      await claim(tx, invite.id, user.id)
      await setPassword(user.id, input.password, { userId: user.id, role: user.role, source: 'web', requestId: crypto.randomUUID() }, tx)
      return user
    }

    const { email, displayName } = validateNewUser({
      email: input.email ?? '',
      displayName: input.displayName ?? '',
      password: input.password,
    })
    if (await findUserByEmail(email, tx)) {
      throw new ValidationError('That email address already has an account. Sign in instead.')
    }
    const passwordHash = await hashPassword(input.password)
    const user = await insertUser(tx, { email, displayName, passwordHash, role: invite.role }, null)
    await claim(tx, invite.id, user.id)
    return user
  })
}

async function claim(tx: Executor, inviteId: string, userId: string) {
  const claimed = await tx
    .update(invites)
    .set({ usedAt: new Date(), usedBy: userId })
    .where(and(eq(invites.id, inviteId), isNull(invites.usedAt)))
    .returning({ id: invites.id })
  if (claimed.length === 0) throw new ValidationError('This link was already used.')
}

export async function listOpenInvites(exec: Executor = db) {
  return exec
    .select({
      id: invites.id,
      kind: invites.kind,
      role: invites.role,
      label: invites.label,
      createdAt: invites.createdAt,
      expiresAt: invites.expiresAt,
    })
    .from(invites)
    .where(and(isNull(invites.usedAt), isNull(invites.revokedAt), gt(invites.expiresAt, new Date())))
    .orderBy(desc(invites.createdAt))
}

export async function revokeInvite(id: string, actor: ActorContext, exec: Executor = db) {
  assertAdmin(actor)
  await exec.update(invites).set({ revokedAt: new Date() }).where(eq(invites.id, id))
}
