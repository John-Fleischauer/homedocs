/*
 * RFC 6749 §4.1.3 and §6 — the token endpoint.
 *
 * Two grants: an authorization code exchanged with its PKCE verifier, and a
 * refresh token exchanged for a rotated pair. No client authentication, because
 * no client secret is ever issued — possession of the verifier is what proves
 * the caller is the software that started the flow.
 *
 * The body is form-encoded, not JSON. That is the specification and it is also
 * what clients actually send; accepting only JSON here produces a token endpoint
 * that every conforming client fails against.
 */

import { CodeReplayError, consumeAuthorizationCode } from '@/lib/oauth/codes'
import { findClient } from '@/lib/oauth/clients'
import { parseScope } from '@/lib/oauth/config'
import { OAuthError } from '@/lib/oauth/errors'
import { issueTokenPair, revokeGrant, rotateRefreshToken } from '@/lib/oauth/grants'
import { corsHeaders, firstIssue, oauthError, formFields, oauthJson, oauthParam, preflight, readOAuthBody, serverError } from '@/lib/oauth/http'
import { z } from 'zod'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'

/* Every parameter either grant reads; anything else a client sends (claude.ai
   adds `resource`) is ignored, as before: the resource a token is for is the one
   the authorization code carried. Which ones a grant needs is checked below, in
   the words a client already acts on. */
const tokenRequest = z.object({
  grant_type: oauthParam('grant_type'),
  client_id: oauthParam('client_id'),
  code: oauthParam('code'),
  redirect_uri: oauthParam('redirect_uri'),
  code_verifier: oauthParam('code_verifier'),
  refresh_token: oauthParam('refresh_token'),
  scope: oauthParam('scope'),
})

type TokenRequest = z.output<typeof tokenRequest>

export async function POST(request: Request) {
  /* Capped: a route handler gets no body limit from Next, and this one is
     reachable by anyone. */
  const body = await readOAuthBody(request, 'invalid_request')
  if ('error' in body) return fail(body.error)

  const parsed = tokenRequest.safeParse(formFields(body.text))
  if (!parsed.success) return fail(new OAuthError('invalid_request', firstIssue(parsed.error)))
  const form = parsed.data

  const grantType = form.grant_type ?? ''
  const clientId = form.client_id ?? ''

  try {
    /*
     * The client must exist even though it cannot authenticate. An unknown
     * client_id here means either a client registered against a database that
     * has since been reset, or someone guessing — and both want the same
     * answer, which is one the client can act on by registering again.
     */
    const client = await findClient(db, clientId)
    if (!client) {
      throw new OAuthError('invalid_client', 'unknown client_id — register again', 401)
    }

    if (grantType === 'authorization_code') return await exchangeCode(form, clientId)
    if (grantType === 'refresh_token') return await exchangeRefresh(form, clientId)

    throw new OAuthError(
      'unsupported_grant_type',
      `${grantType || 'that grant_type'} is not supported — use authorization_code or refresh_token`,
    )
  } catch (err) {
    if (err instanceof CodeReplayError) {
      /* A code presented twice is treated as compromise, not as a retry: by now
         either the client is broken or someone else has a copy of the code, and
         RFC 6749 §4.1.2 says to revoke everything it produced. */
      await revokeGrant(db, { userId: err.userId, clientId: err.clientId })
      return fail(err)
    }
    if (err instanceof OAuthError) return fail(err)
    return serverError('token', err)
  }
}

async function exchangeCode(form: TokenRequest, clientId: string): Promise<Response> {
  const code = form.code ?? ''
  const redirectUri = form.redirect_uri ?? ''
  const codeVerifier = form.code_verifier ?? ''

  if (!redirectUri) {
    throw new OAuthError('invalid_request', 'redirect_uri is required')
  }
  if (!codeVerifier) {
    throw new OAuthError('invalid_request', 'code_verifier is required — this server requires PKCE')
  }

  /*
   * One transaction: the code is spent and the tokens are minted together, or
   * neither happens. Split across two statements, a failure between them leaves
   * a consumed code with nothing issued against it — which presents to the user
   * as a connector that fails to add and cannot be retried, because authorizing
   * again is the only way out and nothing says so.
   */
  const pair = await db.transaction(async (tx) => {
    const grant = await consumeAuthorizationCode(tx, {
      code,
      clientId,
      redirectUri,
      codeVerifier,
    })

    return issueTokenPair(tx, {
      clientId: grant.clientId,
      userId: grant.userId,
      scopes: grant.scopes,
      resource: grant.resource,
    })
  })

  return tokenResponse(pair)
}

async function exchangeRefresh(form: TokenRequest, clientId: string): Promise<Response> {
  const refreshToken = form.refresh_token ?? ''
  if (!refreshToken) throw new OAuthError('invalid_request', 'refresh_token is required')

  const requested = form.scope ?? null
  const { scopes, unknown } = parseScope(requested)
  if (requested && unknown.length > 0) {
    throw new OAuthError('invalid_scope', `unknown scope: ${unknown.join(', ')}`)
  }

  const pair = await db.transaction((tx) =>
    rotateRefreshToken(tx, {
      refreshToken,
      clientId,
      scopes: requested ? scopes : undefined,
    }),
  )

  return tokenResponse(pair)
}

function tokenResponse(pair: {
  accessToken: string
  refreshToken: string
  expiresIn: number
  scopes: readonly string[]
}): Response {
  return oauthJson({
    access_token: pair.accessToken,
    token_type: 'Bearer',
    expires_in: pair.expiresIn,
    refresh_token: pair.refreshToken,
    scope: pair.scopes.join(' '),
  })
}

const fail = oauthError

export async function OPTIONS() {
  return preflight()
}

export async function GET() {
  return oauthJson(
    { error: 'invalid_request', error_description: 'the token endpoint is a POST' },
    { status: 405, headers: { ...corsHeaders(), allow: 'POST, OPTIONS' } },
  )
}
