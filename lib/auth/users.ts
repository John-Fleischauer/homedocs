/*
 * User accounts and the Family page's operations.
 *
 * Account changes are audited, because "who made someone an admin" is exactly
 * the question an audit log exists to answer.
 */

import { and, asc, count, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { recordAudit } from '../core/audit'
import { inTransaction } from '../core/internal'
import {
  assertAdmin,
  ValidationError,
  type ActorContext,
  type Executor,
  type Role,
} from '../core/types'
import { db } from '../db'
import { properties, users } from '../db/schema'
import { seedSystems } from '../systems/systems'
import { hashPassword } from './password'
import { passwordProblem } from './password-policy'
import { revokeAllSessions, type AuthUser } from './sessions'
import { liveAccount } from './live'

export type CreateUserInput = {
  email: string
  displayName: string
  password: string
  role?: Role
}

export async function userCount(exec: Executor = db): Promise<number> {
  const [row] = await exec.select({ n: count() }).from(users).where(isNull(users.deletedAt))
  return Number(row?.n ?? 0)
}

/** With zero users every route redirects to /setup, which disables itself once one exists. */
export async function needsSetup(exec: Executor = db): Promise<boolean> {
  return (await userCount(exec)) === 0
}

export async function findUserByEmail(email: string, exec: Executor = db) {
  const [row] = await exec
    .select()
    .from(users)
    .where(and(sql`lower(${users.email}) = lower(${email.trim()})`, isNull(users.deletedAt)))
    .limit(1)
  return row
}

export async function getUser(id: string, exec: Executor = db): Promise<AuthUser | undefined> {
  const [row] = await exec
    .select({ id: users.id, email: users.email, displayName: users.displayName, role: users.role })
    .from(users)
    .where(and(eq(users.id, id), liveAccount()))
    .limit(1)
  return row
}

export async function listUsers(exec: Executor = db) {
  return exec
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
      role: users.role,
      sso: sql<boolean>`${users.oidcSubject} is not null`,
      hasPassword: sql<boolean>`${users.passwordHash} is not null`,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(liveAccount())
    .orderBy(asc(users.displayName))
}

export function validateNewUser(input: { email: string; displayName: string; password: string }) {
  const email = input.email.trim().toLowerCase()
  if (!email.includes('@')) throw new ValidationError('Enter a valid email address.')
  if (input.displayName.trim() === '') throw new ValidationError('Enter a name.')
  const problem = passwordProblem(input.password)
  if (problem) throw new ValidationError(problem)
  return { email, displayName: input.displayName.trim() }
}

export async function createUser(
  input: CreateUserInput,
  actor: ActorContext | null,
  exec: Executor = db,
): Promise<AuthUser> {
  const { email, displayName } = validateNewUser(input)
  const passwordHash = await hashPassword(input.password)

  return inTransaction(exec, async (tx) => {
    if (await findUserByEmail(email, tx)) {
      throw new ValidationError('That email address is already in use.')
    }
    return insertUser(tx, { email, displayName, passwordHash, role: input.role ?? 'member' }, actor)
  })
}

/**
 * An admin adds someone directly, without an invite link. Most often for
 * single sign-on: the account has no password, and their first Pocket ID
 * sign-in with this address links to it (see `oidc-accounts.ts`). A password
 * is optional; without one, a password link from the Family page sets it.
 */
export async function addFamilyMember(
  input: { email: string; displayName: string; role: Role; password?: string },
  actor: ActorContext,
  exec: Executor = db,
): Promise<AuthUser> {
  assertAdmin(actor)
  const email = input.email.trim().toLowerCase()
  const displayName = input.displayName.trim()
  if (displayName === '') throw new ValidationError('Enter their name.')
  if (!/^[^\s@]+@[^\s@]+$/.test(email)) throw new ValidationError('Enter a valid email address.')
  const password = input.password ?? ''
  if (password) {
    const problem = passwordProblem(password)
    if (problem) throw new ValidationError(problem)
  }
  const passwordHash = password ? await hashPassword(password) : null

  return inTransaction(exec, async (tx) => {
    const holder = await findUserByEmail(email, tx)
    if (holder?.awaitingPlacement) {
      throw new ValidationError('They’re already waiting under Awaiting Placement. Let them in from there.')
    }
    if (holder) throw new ValidationError('Someone already signs in with that email address.')
    /* A removed account keeps its address: re-adding them is a restore, not a second account. */
    const [removed] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${email}`, isNotNull(users.deletedAt)))
      .limit(1)
    if (removed) {
      await tx
        .update(users)
        .set({
          deletedAt: null,
          displayName,
          role: input.role,
          passwordHash,
          oidcIssuer: null,
          oidcSubject: null,
          /* An admin adding them is the placement. */
          awaitingPlacement: false,
          updatedAt: new Date(),
        })
        .where(eq(users.id, removed.id))
      await recordAudit(tx, actor, { action: 'restore', entityType: 'user', entityId: removed.id, after: { email, role: input.role } })
      return { id: removed.id, email, displayName, role: input.role }
    }
    return insertUser(tx, { email, displayName, passwordHash, role: input.role }, actor)
  })
}

/**
 * The insert and its audit row, shared by passwords, invites and single
 * sign-on. Validation and the email check are the caller's.
 */
export async function insertUser(
  tx: Executor,
  values: {
    email: string
    displayName: string
    passwordHash: string | null
    role: Role
    oidcIssuer?: string
    oidcSubject?: string
    awaitingPlacement?: boolean
  },
  actor: ActorContext | null,
): Promise<AuthUser> {
  const [user] = await tx.insert(users).values(values).returning()

  await recordAudit(tx, actor ?? selfActor(user!.id, user!.role), {
    action: 'create',
    entityType: 'user',
    entityId: user!.id,
    after: {
      email: user!.email,
      role: user!.role,
      ...(values.oidcIssuer ? { sso: true } : {}),
      ...(values.awaitingPlacement ? { awaitingPlacement: true } : {}),
    },
  })

  return { id: user!.id, email: user!.email, displayName: user!.displayName, role: user!.role }
}

export function selfActor(userId: string, role: Role = 'admin'): ActorContext {
  return { userId, role, source: 'web', requestId: crypto.randomUUID() }
}

/** The lock that serializes first-run account creation, by either route. */
export async function lockSetup(tx: Executor): Promise<void> {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('homedocs:setup'))`)
}

/**
 * Make sure there is a property. The first admin's setup names it; a sign-on
 * bootstrap gets a placeholder they can rename in Settings.
 */
export async function ensureProperty(tx: Executor, name: string, actorId: string) {
  const [existing] = await tx.select({ id: properties.id }).from(properties).limit(1)
  if (existing) return existing.id
  const [created] = await tx
    .insert(properties)
    .values({ name: name.trim() || 'Our home', createdBy: actorId, updatedBy: actorId })
    .returning({ id: properties.id })
  await seedSystems(tx, created!.id, actorId)
  return created!.id
}

/**
 * Create the first account and the home it describes. Refuses once any user
 * exists, which is what makes /setup self-disabling rather than merely hidden.
 */
export async function createFirstAdmin(
  input: Omit<CreateUserInput, 'role'> & { homeName: string },
  exec: Executor = db,
): Promise<AuthUser> {
  return inTransaction(exec, async (tx) => {
    await lockSetup(tx)
    if (!(await needsSetup(tx))) throw new ValidationError('Setup has already been completed.')
    const user = await createUser({ ...input, role: 'admin' }, null, tx)
    await ensureProperty(tx, input.homeName, user.id)
    return user
  })
}

async function adminCount(tx: Executor): Promise<number> {
  const [row] = await tx
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.role, 'admin'), isNull(users.deletedAt)))
  return Number(row?.n ?? 0)
}

export async function setUserRole(
  userId: string,
  role: Role,
  actor: ActorContext,
  exec: Executor = db,
): Promise<void> {
  assertAdmin(actor)
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1)
    if (!current) throw new ValidationError('No such person.')
    if (current.awaitingPlacement) throw new ValidationError('They’re waiting to be let in. Use Let In under Awaiting Placement.')
    if (current.role === role) return

    // Demoting the last admin would lock everyone out of the Family page.
    if (current.role === 'admin' && (await adminCount(tx)) <= 1) {
      throw new ValidationError('This is the only admin. Make someone else an admin first.')
    }

    await tx.update(users).set({ role, updatedAt: new Date() }).where(eq(users.id, userId))
    // A role change takes effect now, not at their next sign-in.
    await revokeAllSessions(userId, tx)
    await recordAudit(tx, actor, {
      action: 'update',
      entityType: 'user',
      entityId: userId,
      before: { role: current.role },
      after: { role },
    })
  })
}

/** Remove a family member's account. Their past edits keep their name. */
export async function removeUser(userId: string, actor: ActorContext, exec: Executor = db) {
  assertAdmin(actor)
  if (userId === actor.userId) throw new ValidationError('You cannot remove your own account.')
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(users)
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
      .limit(1)
    if (!current) throw new ValidationError('No such person.')
    if (current.role === 'admin' && (await adminCount(tx)) <= 1) {
      throw new ValidationError('This is the only admin.')
    }
    await tx.update(users).set({ deletedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, userId))
    await revokeAllSessions(userId, tx)
    await recordAudit(tx, actor, { action: 'delete', entityType: 'user', entityId: userId })
  })
}

export async function setPassword(
  userId: string,
  newPassword: string,
  actor: ActorContext,
  exec: Executor = db,
): Promise<void> {
  const problem = passwordProblem(newPassword)
  if (problem) throw new ValidationError(problem)
  const passwordHash = await hashPassword(newPassword)

  return inTransaction(exec, async (tx) => {
    await tx
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(and(eq(users.id, userId), isNull(users.deletedAt)))
    // A password change is how you respond to a compromise; end every session.
    await revokeAllSessions(userId, tx)
    await recordAudit(tx, actor, {
      action: 'update',
      entityType: 'user',
      entityId: userId,
      after: { passwordChanged: true },
    })
  })
}

export async function setDisplayName(userId: string, name: string, actor: ActorContext, exec: Executor = db) {
  const displayName = name.trim()
  if (!displayName) throw new ValidationError('Enter a name.')
  await inTransaction(exec, async (tx) => {
    await tx.update(users).set({ displayName, updatedAt: new Date() }).where(eq(users.id, userId))
    await recordAudit(tx, actor, { action: 'update', entityType: 'user', entityId: userId, after: { displayName } })
  })
}

// ─── placement ──────────────────────────────────────────────────────────────
//
// A single sign-on that matched nobody makes an account awaiting placement
// (oidc-accounts.ts, docs/DECISIONS.md). It has no session, token or access
// until an admin lets it in here, from the Family page.

export type AwaitingAccount = { id: string; email: string; displayName: string; createdAt: Date }

/** Accounts single sign-on created, waiting for an admin; oldest first. */
export async function listAwaitingPlacement(exec: Executor = db): Promise<AwaitingAccount[]> {
  return exec
    .select({ id: users.id, email: users.email, displayName: users.displayName, createdAt: users.createdAt })
    .from(users)
    .where(and(eq(users.awaitingPlacement, true), isNull(users.deletedAt)))
    .orderBy(asc(users.createdAt))
}

/** How many are waiting, for the More page. */
export async function countAwaitingPlacement(exec: Executor = db): Promise<number> {
  const [row] = await exec
    .select({ n: count() })
    .from(users)
    .where(and(eq(users.awaitingPlacement, true), isNull(users.deletedAt)))
  return Number(row?.n ?? 0)
}

/* Locked until the transaction ends, so two admins acting on one account at
   once can't both pass this check: the second waits, then finds it placed or
   removed. */
async function awaitingRow(tx: Executor, userId: string) {
  const [row] = await tx
    .select()
    .from(users)
    .where(and(eq(users.id, userId), isNull(users.deletedAt), eq(users.awaitingPlacement, true)))
    .limit(1)
    .for('update')
  if (!row) throw new ValidationError('They’re no longer waiting. Reload the page.')
  return row
}

/**
 * Let an awaiting account in, with the role the admin chose. Their next
 * sign-on starts a session; until then nothing changes for them.
 */
export async function placeUser(userId: string, role: Role, actor: ActorContext, exec: Executor = db): Promise<void> {
  assertAdmin(actor)
  return inTransaction(exec, async (tx) => {
    const row = await awaitingRow(tx, userId)
    await tx.update(users).set({ role, awaitingPlacement: false, updatedAt: new Date() }).where(eq(users.id, userId))
    await recordAudit(tx, actor, {
      action: 'update',
      entityType: 'user',
      entityId: userId,
      before: { awaitingPlacement: true, role: row.role },
      after: { awaitingPlacement: false, role },
    })
  })
}

/**
 * Turn an awaiting account away. A soft delete, so the identity and address
 * stay on the removed row and the next sign-on is refused as removed instead of
 * making the account again. An admin can still add them later (Add Person),
 * which restores the row.
 */
export async function removeAwaitingUser(userId: string, actor: ActorContext, exec: Executor = db): Promise<void> {
  assertAdmin(actor)
  return inTransaction(exec, async (tx) => {
    await awaitingRow(tx, userId)
    const now = new Date()
    await tx.update(users).set({ deletedAt: now, updatedAt: now }).where(eq(users.id, userId))
    await revokeAllSessions(userId, tx)
    await recordAudit(tx, actor, { action: 'delete', entityType: 'user', entityId: userId, before: { awaitingPlacement: true } })
  })
}
