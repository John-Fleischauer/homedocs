'use server'

/*
 * Unlock a shared guide with its PIN. A public endpoint by nature: the only
 * credential is the link token, checked here, plus the PIN. Attempts are rate
 * limited per address in memory and counted per link in the database, where
 * ten failures lock the link for good.
 */

import { cookies, headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import {
  MAX_PIN_FAILURES,
  checkPin,
  findShareLink,
  recordView,
  unlockCookie,
  unlockCookieName,
} from '@/lib/guide/share-links'
import { clientIp } from '@/lib/web/client-ip'
import { pinLimiter } from '@/lib/web/limits'
import { formValues, text } from '@/lib/web/fields'
import { z } from 'zod'

export type UnlockState = { error?: string }

/* The link token as findShareLink accepts it, and a PIN of no more than a few digits' worth. */
const unlockForm = z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), pin: text(100) })

export async function unlockAction(token: string, _: UnlockState, fd: FormData): Promise<UnlockState> {
  const parsed = unlockForm.safeParse({ ...formValues(fd), token })
  if (!parsed.success) return { error: 'That PIN isn’t right.' }
  const h = await headers()
  const ip = clientIp(h)
  if (!pinLimiter.take(ip ?? 'unknown')) return { error: 'Too many tries. Wait ten minutes and try again.' }

  const state = await findShareLink(db, parsed.data.token)
  if (!state.ok) redirect(`/g/${parsed.data.token}`)
  const link = state.link
  const result = await checkPin(db, link, parsed.data.pin)
  const meta = { ip, userAgent: h.get('user-agent'), atHome: false }

  if (result === 'locked') {
    await recordView(db, link, { ...meta, event: 'locked' })
    return { error: 'This link is locked after too many wrong PINs. Ask the homeowner for a new link.' }
  }
  if (result === 'no-pin') return { error: 'This link has no PIN. Codes show when you’re at the house.' }
  if (result === 'wrong') {
    await recordView(db, link, { ...meta, event: 'pin_failed' })
    const left = MAX_PIN_FAILURES - link.pinFailures - 1
    return { error: `That PIN isn’t right.${left <= 3 ? ` ${left} tries left before the link locks.` : ''}` }
  }

  await recordView(db, link, { ...meta, event: 'unlock' })
  const cookie = unlockCookie(link.id)
  ;(await cookies()).set(unlockCookieName(link.id), cookie.value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: `/g/${token}`,
    maxAge: cookie.maxAge,
  })
  redirect(`/g/${parsed.data.token}`)
}
