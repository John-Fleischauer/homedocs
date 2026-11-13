'use server'

import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth/guards'
import {
  AuthorizeFatal,
  AuthorizeRedirect,
  type RawAuthorizeParams,
  parseAuthorizeParams,
  resolveTarget,
  validateRequest,
} from '@/lib/oauth/authorize'
import { issueAuthorizationCode } from '@/lib/oauth/codes'
import { touchClient } from '@/lib/oauth/clients'
import { db } from '@/lib/db'
import { formValues } from '@/lib/web/fields'

/*
 * Approve and deny.
 *
 * Both re-derive the request from the submitted form rather than trusting it —
 * the same resolveTarget/validateRequest the page ran, against the same
 * database. A tampered client_id or redirect_uri fails the registered-set check;
 * a tampered scope is re-intersected with the user's role. The hidden fields
 * carry the request across the round trip, they do not carry authority.
 *
 * Cross-origin submission is handled by the framework: Server Actions are POSTs
 * that Next refuses when the Origin and Host disagree, so a page elsewhere
 * cannot drive this form on a logged-in user's behalf.
 */

/*
 * The hidden fields, parsed with zod before anything else is read
 * (parseAuthorizeParams, the same parse the page runs on its query). A form
 * that doesn't parse goes back to the consent screen, which refuses it there:
 * there is no proven address to send an error to.
 */
function params(form: FormData): RawAuthorizeParams {
  const parsed = parseAuthorizeParams(formValues(form))
  if (parsed) return parsed
  redirect('/oauth/authorize')
}

export async function approveAction(form: FormData): Promise<void> {
  const raw = params(form)
  const user = await getCurrentUser()

  /* The session can expire while the consent screen sits open. Sending them
     back through the login form to this same request is the only answer that
     does not lose the connection attempt. */
  if (!user) redirect(`/login?next=${encodeURIComponent(authorizeUrl(raw))}`)

  let location: string
  try {
    const target = await resolveTarget(db, raw)
    const request = validateRequest(target, raw, user.role)

    const { code } = await db.transaction(async (tx) => {
      await touchClient(tx, request.client.id)
      return issueAuthorizationCode(tx, {
        clientId: request.client.id,
        userId: user.id,
        redirectUri: request.redirectUri,
        scopes: request.scopes,
        resource: request.resource,
        codeChallenge: request.codeChallenge,
      })
    })

    const url = new URL(request.redirectUri)
    url.searchParams.set('code', code)
    if (request.state) url.searchParams.set('state', request.state)
    location = url.toString()
  } catch (err) {
    if (err instanceof AuthorizeRedirect) location = err.location()
    else if (err instanceof AuthorizeFatal) {
      // No proven address to send an error to, so the screen says it instead.
      location = `/oauth/authorize?${new URLSearchParams(compact(raw)).toString()}`
    } else throw err
  }

  redirect(location)
}

export async function denyAction(form: FormData): Promise<void> {
  const raw = params(form)

  /*
   * Denial is an answer, not an error page. RFC 6749 §4.1.2.1 gives it a code,
   * and returning it means claude.ai says "you declined" rather than timing out
   * on a window that never came back.
   */
  /* Back to the app's home when there's nowhere provable to send the refusal. */
  let location = '/'
  try {
    const target = await resolveTarget(db, raw)
    location = new AuthorizeRedirect(
      target.redirectUri,
      'access_denied',
      'the request was declined',
      target.state,
    ).location()
  } catch {
    /* Nowhere provable to send the refusal. Nothing was granted, which is the
       part that matters; the user lands back in the app. */
  }

  redirect(location)
}

function compact(raw: RawAuthorizeParams): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => entry[1] !== undefined),
  )
}

function authorizeUrl(raw: RawAuthorizeParams): string {
  return `/oauth/authorize?${new URLSearchParams(compact(raw)).toString()}`
}
