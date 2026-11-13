'use server'

import { z } from 'zod'
import { createInvite, createReset, revokeInvite } from '@/lib/auth/invites'
import { addFamilyMember, removeUser, setUserRole } from '@/lib/auth/users'
import { act, type ActionResult } from '@/lib/web/action'
import { GONE, id, oneOf, raw, text } from '@/lib/web/fields'

const role = () => oneOf(['admin', 'member', 'viewer'], 'Pick what they can do.')
const byUser = z.object({ userId: id() })

export async function inviteAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(fd, z.object({ role: role(), label: text() }), async (input, { actor }) => {
    const { url } = await createInvite(input, actor)
    return { message: url }
  })
}

export async function addMemberAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  return act(
    fd,
    z.object({ displayName: text(), email: text(1_000), role: role(), password: raw(1_000) }),
    async (input, { actor }) => {
      const user = await addFamilyMember(input, actor)
      return { message: `${user.displayName} can sign in now.` }
    },
  )
}

export async function resetAction(userId: string): Promise<ActionResult> {
  return act({ userId }, byUser, async (input, { actor }) => {
    const { url } = await createReset(input.userId, actor)
    return { message: url }
  })
}

export async function setRoleAction(userId: string, next: string): Promise<ActionResult> {
  return act({ userId, role: next }, z.object({ userId: id(), role: role() }), async (input, { actor }) => {
    await setUserRole(input.userId, input.role, actor)
  })
}

export async function removeUserAction(userId: string): Promise<ActionResult> {
  return act({ userId }, byUser, async (input, { actor }) => {
    await removeUser(input.userId, actor)
  })
}

/* An invite's id is the HMAC of its link token (base64url), not a uuid. */
const inviteId = text(200).refine((value) => /^[A-Za-z0-9_-]+$/.test(value), { error: GONE })

export async function revokeInviteAction(invite: string): Promise<ActionResult> {
  return act({ id: invite }, z.object({ id: inviteId }), async (input, { actor }) => {
    await revokeInvite(input.id, actor)
  })
}
