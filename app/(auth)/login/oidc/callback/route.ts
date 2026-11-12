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
import { loginUrl } from '../../login-url'

export const dynamic = 'force-dynamic'

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

  // Cancelled at the provider, or refused there (a group restriction, say).
  const providerError = request.nextUrl.searchParams.get('error')
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

  const result = await resolveOidcAccount(claims, { trustEmail: provider.config.trustEmail, defaultRole: provider.config.defaultRole })
  if (result.kind === 'refused') {
    console.warn(`[oidc] sign-in refused (${result.reason}) for subject ${claims.subject}`)
    return respond(loginUrl(result.reason, next))
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
