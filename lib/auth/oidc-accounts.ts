/*
 * Which account a single sign-on identity signs in as.
 *
 * Kept apart from the protocol plumbing in `oidc.ts`: this is the part with the
 * security decisions in it, and it is a function of a claim set and the users
 * table, so it is tested against Postgres with no identity provider at all.
 *
 * In order:
 *
 * 1. **By identity** — the token's `(iss, sub)`. The only key that stays right
 *    when somebody changes their address at the provider. A *removed* account
 *    holding the identity refuses rather than falling through, or removing
 *    somebody would only last until their next sign-in. An account still
 *    awaiting placement refuses too: it has no access yet.
 * 2. **By email, once, to link.** An account made with a password has no
 *    identity yet; the first sign-on attaches one. Only on an address the
 *    provider says is verified, or one the deployment trusts
 *    (`OIDC_TRUST_EMAIL`, for an issuer it runs itself) — otherwise anybody who
 *    can assert an address at the provider is handed the account behind it. An
 *    account already carrying a different identity is never re-linked: two
 *    identities claiming one account is a provider reissuing subjects or a
 *    takeover attempt, and neither is for a sign-in to settle.
 * 3. **Otherwise, a new account with no access** (docs/DECISIONS.md, the
 *    standards' security.md). Never the first one: with no accounts at all the
 *    person is sent to /setup. The account is created awaiting placement and
 *    audited, no session is started, and it waits on the Family page for an
 *    admin to let it in or remove it. Who may get this far at all is the
 *    provider's to decide: a group restriction on the client is a deployment
 *    requirement (docs/DEPLOYMENT.md).
 */

import { and, eq, isNotNull, sql } from 'drizzle-orm'
import { recordAudit } from '../core/audit'
import { inTransaction } from '../core/internal'
import type { Executor } from '../core/types'
import { db } from '../db'
import { users } from '../db/schema'
import type { OidcClaims } from './oidc'
import type { AuthUser } from './sessions'
import { findUserByEmail, insertUser, lockSetup, needsSetup, selfActor } from './users'

export type OidcRefusal =
  /** The identity, or the address, belongs to an account that was removed. */
  | 'removed'
  /** The address belongs to an account linked to a different identity. */
  | 'other-identity'
  /** The address belongs to an account, and the provider has not verified it. */
  | 'unverified-email'
  /** No account matched, and there is no address to create one with. */
  | 'no-email'
  /** The account exists but an admin has not let it in yet. */
  | 'awaiting-placement'
  /** There are no accounts at all: the first one is made at /setup. */
  | 'setup'

export type OidcResolution =
  | { kind: 'signed-in'; user: AuthUser; via: 'identity' | 'linked' }
  | { kind: 'refused'; reason: OidcRefusal }

export async function resolveOidcAccount(
  claims: OidcClaims,
  options: { trustEmail: boolean },
  exec: Executor = db,
): Promise<OidcResolution> {
  return inTransaction(exec, async (tx) => {
    /* The setup lock, so two first sign-ins cannot both become the admin, and
       two tabs finishing the same first sign-in cannot both create an account. */
    await lockSetup(tx)

    const [byIdentity] = await tx
      .select()
      .from(users)
      .where(and(eq(users.oidcIssuer, claims.issuer), eq(users.oidcSubject, claims.subject)))
      .limit(1)
    if (byIdentity) {
      if (byIdentity.deletedAt) return { kind: 'refused', reason: 'removed' }
      if (byIdentity.awaitingPlacement) return { kind: 'refused', reason: 'awaiting-placement' }
      return { kind: 'signed-in', via: 'identity', user: authUser(byIdentity) }
    }

    const email = claims.email?.trim().toLowerCase()
    if (!email || !email.includes('@')) return { kind: 'refused', reason: 'no-email' }

    const byEmail = await findUserByEmail(email, tx)
    if (byEmail) {
      if (!claims.emailVerified && !options.trustEmail) {
        return { kind: 'refused', reason: 'unverified-email' }
      }
      if (byEmail.oidcSubject !== null) return { kind: 'refused', reason: 'other-identity' }
      /* Unreachable today (only sign-on makes an awaiting account, and it always
         carries an identity), but linking must never be a way past placement. */
      if (byEmail.awaitingPlacement) return { kind: 'refused', reason: 'awaiting-placement' }

      await tx
        .update(users)
        .set({ oidcIssuer: claims.issuer, oidcSubject: claims.subject, updatedAt: new Date() })
        .where(eq(users.id, byEmail.id))

      await recordAudit(tx, selfActor(byEmail.id, byEmail.role), {
        action: 'update',
        entityType: 'user',
        entityId: byEmail.id,
        after: { oidcIssuer: claims.issuer },
      })

      return { kind: 'signed-in', via: 'linked', user: authUser(byEmail) }
    }

    /* A removed account with this address and no identity of its own is the
       same person as far as anybody can tell; creating them a fresh account
       would undo the removal. */
    const [removed] = await tx
      .select({ id: users.id })
      .from(users)
      .where(and(sql`lower(${users.email}) = ${email}`, isNotNull(users.deletedAt)))
      .limit(1)
    if (removed) return { kind: 'refused', reason: 'removed' }

    /* The first account is made at /setup, never by a sign-in: the person who
       sets the house up chooses to, rather than whoever reaches the provider
       first. */
    if (await needsSetup(tx)) return { kind: 'refused', reason: 'setup' }

    /* `viewer` is only what the row needs to be valid, and the least it could
       mean: an awaiting account gets no session or token, so the role means
       nothing until an admin chooses one (`placeUser`). */
    await insertUser(
      tx,
      {
        email,
        displayName: displayNameFor(claims, email),
        passwordHash: null,
        role: 'viewer',
        awaitingPlacement: true,
        oidcIssuer: claims.issuer,
        oidcSubject: claims.subject,
      },
      null,
    )
    return { kind: 'refused', reason: 'awaiting-placement' }
  })
}

/** The name a new account starts with. Editable like any other. */
export function displayNameFor(claims: OidcClaims, email: string): string {
  return claims.name ?? claims.preferredUsername ?? email.split('@')[0] ?? email
}

function authUser(row: typeof users.$inferSelect): AuthUser {
  return { id: row.id, email: row.email, displayName: row.displayName, role: row.role }
}
