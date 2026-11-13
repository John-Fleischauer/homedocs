/*
 * Finish a single sign-on round trip. The redirect URI registered at
 * the provider is `<PUBLIC_BASE_URL>/login/oidc/callback`.
 *
 * Every failure goes back to the login page as a refusal code, never a 500:
 * the person on the other end has a provider tab half-closed and needs to know
 * whether to try again. What actually went wrong is logged here instead.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { oidcProvider, type OidcClaims } from '@/lib/auth/oidc'
import { resolveOidcAccount } from '@/lib/auth/oidc-accounts'
import { OIDC_FLOW_COOKIE, decodeFlow, oidcFlowCookieOptions } from '@/lib/auth/oidc-flow'
import { safeNext } from '@/lib/auth/redirects'
import { SESSION_COOKIE, cookieOptions, createSession } from '@/lib/auth/sessions'
import { absoluteUrl } from '@/lib/web/urls'
import { clientIp } from '@/lib/web/client-ip'
import { collect } from '@/lib/web/fields'
import { z } from 'zod'
import { loginUrl } from '../../login-url'

export const dynamic = 'force-dynamic'

const once = z.string().max(4_096).optional()
const callbackQuery = z.object({ code: once, state: once, error: once, error_description: once, iss: once, session_state: once })

export async function GET(request: NextRequest) {
  const flow = decodeFlow(request.cookies.get(OIDC_FLOW_COOKIE)?.value)
  const next = flow?.next ?? safeNext(null)

  const respond = (location: string) => {
    const response = NextResponse.redirect(location, 303)
    // Single use, whatever happened.
    response.cookies.set(OIDC_FLOW_COOKIE, '', { ...oidcFlowCookieOptions, maxAge: 0 })
    response.headers.set('Cache-Control', 'no-store')
    return response
  }

  /* The provider's answer, parsed before anything reads it: each of these at
     most once, as text of a sane length. A repeated `state` or `code` is not a
     sign-in to finish. The library checks the values themselves. */
  const query = callbackQuery.safeParse(collect(request.nextUrl.searchParams))
  if (!query.success) {
    console.warn('[oidc] the callback query did not parse')
    return respond(loginUrl('sso-failed', next))
  }

  // Cancelled at the provider, or refused there (a group restriction, say).
  const providerError = query.data.error
  if (providerError) {
    console.warn(`[oidc] the provider answered ${providerError}`)
    return respond(loginUrl('sso-failed', next))
  }

  if (!flow) return respond(loginUrl('sso-expired', next))

  const provider = await oidcProvider()
  if (!provider) return respond(loginUrl('sso-unavailable', next))

  let claims: OidcClaims
  try {
    claims = await provider.complete(request.nextUrl.search, flow)
  } catch (error) {
    console.error(
      `[oidc] callback did not verify: ${error instanceof Error ? error.message : String(error)}`,
    )
    return respond(loginUrl('sso-failed', next))
  }

  const result = await resolveOidcAccount(claims, { trustEmail: provider.config.trustEmail })
  if (result.kind === 'refused') {
    const { reason } = result
    /* No accounts yet: the first one is made at /setup, never by a sign-on. */
    if (reason === 'setup') return respond(absoluteUrl('/setup'))
    console.warn(`[oidc] sign-in refused (${reason}) for subject ${claims.subject}`)
    return respond(loginUrl(reason, next))
  }

  const session = await createSession(result.user.id, {
    userAgent: request.headers.get('user-agent'),
    ip: clientIp(request.headers),
  })

  const response = respond(absoluteUrl(next))
  response.cookies.set(SESSION_COOKIE, session.token, {
    ...cookieOptions,
  })
  return response
}
