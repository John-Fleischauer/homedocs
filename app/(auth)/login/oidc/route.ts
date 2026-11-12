/*
 * Start a single sign-on round trip.
 *
 * Not under app/api/ and not authenticated, because signing in is what it is
 * for. It sets the flow cookie and sends the browser to the provider; nothing
 * else. `next` is validated here and again on the way back — it is how the
 * OAuth consent screen survives a sign-on, exactly as it survives the password
 * form.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { oidcProvider } from '@/lib/auth/oidc'
import { OIDC_FLOW_COOKIE, encodeFlow, oidcFlowCookieOptions } from '@/lib/auth/oidc-flow'
import { safeNext } from '@/lib/auth/redirects'
import { loginUrl } from '../login-url'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const next = safeNext(request.nextUrl.searchParams.get('next'))

  const provider = await oidcProvider()
  if (!provider) return NextResponse.redirect(loginUrl('sso-unavailable', next), 303)

  const flow = await provider.begin()
  const response = NextResponse.redirect(flow.authorizationUrl, 303)
  response.cookies.set(
    OIDC_FLOW_COOKIE,
    encodeFlow({
      state: flow.state,
      codeVerifier: flow.codeVerifier,
      nonce: flow.nonce,
      next,
    }),
    oidcFlowCookieOptions,
  )
  response.headers.set('Cache-Control', 'no-store')
  return response
}
