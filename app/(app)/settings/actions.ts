'use server'

import { eq } from 'drizzle-orm'
import { z } from 'zod'
import { setDisplayName, setPassword } from '@/lib/auth/users'
import { assertAdmin, ValidationError } from '@/lib/core/types'
import { rebuildAll } from '@/lib/search/rebuild'
import { updateProperty } from '@/lib/property/property'
import { act, type ActionResult } from '@/lib/web/action'
import { int, oneOf, raw, text, withForm } from '@/lib/web/fields'
import { verifyPassword } from '@/lib/auth/password'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { revokeGrant } from '@/lib/oauth/grants'
import { removeIntegration, requirePaperlessTag, saveIntegration, unrequirePaperlessTag } from '@/lib/integrations/integrations'

const SYSTEMS = ['homebox', 'paperless'] as const

export async function nameAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(fd, z.object({ displayName: text() }), async (input, { user, actor }) => {
    await setDisplayName(user.id, input.displayName, actor)
    return { message: 'Saved.' }
  })
}

export async function passwordAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  /* Passwords keep their spacing; 1,000 is far past any password and keeps argon2's work bounded. */
  return act(fd, z.object({ current: raw(1_000), password: raw(1_000) }), async (input, { user, actor }) => {
    const [row] = await db.select({ hash: users.passwordHash }).from(users).where(eq(users.id, user.id))
    if (row?.hash && !(await verifyPassword(row.hash, input.current))) {
      throw new ValidationError('Your current password isn’t right.')
    }
    await setPassword(user.id, input.password, actor)
    // setPassword signs out every session, this one included.
    return { message: 'Password changed. Sign in again with the new one.' }
  })
}

export async function homeAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(
    fd,
    z.object({ name: text(), address: text(), homeNetworks: text(), homeHostname: text(1_000) }),
    async (input, { property, actor }) => {
      await updateProperty(property.id, input, actor)
      return { message: 'Saved.' }
    },
  )
}

export async function revokeConnectorAction(clientId: string): Promise<ActionResult> {
  /* An OAuth client id is ours but not a uuid; it only has to be a short string. */
  return act({ clientId }, z.object({ clientId: text(200) }), async (input, { user }) => {
    await revokeGrant(db, { userId: user.id, clientId: input.clientId })
  })
}

export async function saveIntegrationAction(system: 'homebox' | 'paperless', _: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(
    withForm(fd, { system }),
    z.object({ system: oneOf(SYSTEMS), baseUrl: text(2_000), token: text(10_000) }),
    async (input, { scope, actor }) => {
      const result = await saveIntegration(db, scope, actor, input.system, { baseUrl: input.baseUrl, token: input.token })
      return { message: result.warning ? `Connected: ${result.summary}. ${result.warning}` : `Connected: ${result.summary}.` }
    },
  )
}

export async function removeIntegrationAction(system: 'homebox' | 'paperless'): Promise<ActionResult> {
  return act({ system }, z.object({ system: oneOf(SYSTEMS) }), async (input, { scope, actor }) => {
    await removeIntegration(db, scope, actor, input.system)
  })
}

/** After a restore, or if search ever misses something: rebuild every search document. */
export async function rebuildSearchAction(): Promise<ActionResult> {
  return act({}, z.object({}), async (_input, { actor }) => {
    assertAdmin(actor)
    await rebuildAll(db)
    return { message: 'Search rebuilt.' }
  })
}

export async function requirePaperlessTagAction(system: string, externalId: string): Promise<ActionResult> {
  return act(
    { system, externalId },
    z.object({ system: oneOf(['paperless']), externalId: text(200) }),
    async (input, { scope, actor }) => {
      await requirePaperlessTag(db, scope, actor, input.externalId)
    },
  )
}

export async function unrequirePaperlessTagAction(tagId: number): Promise<ActionResult> {
  return act({ tagId }, z.object({ tagId: int(0, Number.MAX_SAFE_INTEGER, 'Pick a paperless tag.') }), async (input, { scope, actor }) => {
    await unrequirePaperlessTag(db, scope, actor, input.tagId)
  })
}
