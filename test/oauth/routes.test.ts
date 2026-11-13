/*
 * The OAuth endpoints as a client calls them, for what they refuse: bodies
 * over the cap, registrations that are not one, parameters sent twice, and
 * failures nobody planned for. endpoints.test.ts covers the normal handshake;
 * this file also replays what claude.ai sends today, extra fields included,
 * so the connector keeps working through the parsing.
 *
 * The registration limiter keys on the client address (lib/web/client-ip.ts):
 * here X-Forwarded-For read from the right, one proxy hop.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerClient } from '../../lib/oauth/clients'
import { issueAuthorizationCode, s256 } from '../../lib/oauth/codes'
import { issueTokenPair, resolveBearer } from '../../lib/oauth/grants'
import { databaseUrl, db, resetBetweenTests } from '../helpers/db'
import { makeUser } from '../helpers/fixtures'

process.env.DATABASE_URL = databaseUrl
process.env.PUBLIC_BASE_URL = 'https://homedocs.example.test'

const { POST: register } = await import('../../app/oauth/register/route')
const { POST: token } = await import('../../app/oauth/token/route')
const { POST: revoke } = await import('../../app/oauth/revoke/route')

const BASE = 'https://homedocs.example.test'
const REDIRECT = 'https://claude.ai/api/mcp/auth_callback'
const VERIFIER = 'v'.repeat(64)

resetBetweenTests()
beforeEach(() => {
  // One proxy appending the client address; no single-header mode.
  vi.stubEnv('CLIENT_IP_HEADER', '')
  vi.stubEnv('TRUSTED_PROXY_HOPS', '1')
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

/** A POST as a client sends it: with the Content-Length its HTTP client sets, unless told otherwise. */
function post(path: string, body: string, headers: Record<string, string> = {}): Request {
  return new Request(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'content-length': String(Buffer.byteLength(body)), ...headers },
    body,
  })
}

/** A body sent chunked: no Content-Length, so only the read itself can hold it to the cap. */
function chunked(path: string, body: string, headers: Record<string, string> = {}): Request {
  const bytes = new TextEncoder().encode(body)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += 8192) controller.enqueue(bytes.slice(i, i + 8192))
      controller.close()
    },
  })
  return new Request(`${BASE}${path}`, { method: 'POST', headers, body: stream, duplex: 'half' } as RequestInit)
}

const form = (fields: [string, string][]) => new URLSearchParams(fields).toString()
const FORM = { 'content-type': 'application/x-www-form-urlencoded' }
const quiet = () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
}

/* A new client address per registration unless one is given, so the limiter only bites where a test means it to. */
let clients = 0
function registration(body: unknown, client = `198.51.${Math.floor(++clients / 250)}.${clients % 250}`) {
  return register(
    post('/oauth/register', JSON.stringify(body), {
      'content-type': 'application/json',
      'x-forwarded-for': `10.9.9.9, ${client}`,
    }),
  )
}

/* What claude.ai sends today: the fields this server reads, and more it ignores. */
const CLAUDE_REGISTRATION = {
  client_name: 'Claude',
  redirect_uris: [REDIRECT],
  grant_types: ['authorization_code', 'refresh_token'],
  response_types: ['code'],
  token_endpoint_auth_method: 'none',
  scope: 'homedocs:read homedocs:write',
}

describe('POST /oauth/register', () => {
  it("registers what claude.ai sends, and a client that sends null for what it doesn't have", async () => {
    const response = await registration(CLAUDE_REGISTRATION)
    expect(response.status).toBe(201)
    expect(await response.json()).toMatchObject({ client_name: 'Claude', redirect_uris: [REDIRECT] })

    expect((await registration({ redirect_uris: [REDIRECT], client_name: null, logo_uri: null })).status).toBe(201)
  })

  it('refuses a body that is not a registration, in the words RFC 7591 gives', async () => {
    quiet()
    const cases: [unknown, string, string][] = [
      [[REDIRECT], 'invalid_client_metadata', 'the request body must be a JSON object'],
      [null, 'invalid_client_metadata', 'the request body must be a JSON object'],
      [{ client_name: 'X' }, 'invalid_redirect_uri', 'redirect_uris is required and must be an array'],
      [{ redirect_uris: REDIRECT }, 'invalid_redirect_uri', 'redirect_uris is required and must be an array'],
      [{ redirect_uris: [] }, 'invalid_redirect_uri', 'redirect_uris is required and must be an array'],
      [{ redirect_uris: [42] }, 'invalid_redirect_uri', 'each redirect_uri must be text'],
      [{ redirect_uris: [REDIRECT], client_name: 7 }, 'invalid_client_metadata', 'client_name must be text'],
      [{ redirect_uris: [REDIRECT], logo_uri: {} }, 'invalid_client_metadata', 'logo_uri must be text'],
      [{ redirect_uris: Array(6).fill(REDIRECT) }, 'invalid_redirect_uri', 'at most 5 redirect_uris may be registered'],
      [{ redirect_uris: ['https://evil.example/cb'] }, 'invalid_redirect_uri', ''],
    ]
    for (const [body, error, description] of cases) {
      const response = await registration(body)
      expect(response.status, JSON.stringify(body)).toBe(400)
      const answer = await response.json()
      expect(answer.error, JSON.stringify(body)).toBe(error)
      if (description) expect(answer.error_description, JSON.stringify(body)).toBe(description)
    }
  })

  it('refuses a body over 64 KB, declared or chunked, before registering anything', async () => {
    quiet()
    const huge = JSON.stringify({ ...CLAUDE_REGISTRATION, padding: 'x'.repeat(70_000) })

    const declared = await register(
      post('/oauth/register', huge, { 'x-forwarded-for': '198.18.0.1' }),
    )
    expect(declared.status).toBe(413)
    expect(await declared.json()).toMatchObject({ error: 'invalid_client_metadata' })

    const streamed = await register(
      chunked('/oauth/register', huge, { 'x-forwarded-for': '198.18.0.2' }),
    )
    expect(streamed.status).toBe(413)

    // A Content-Length that lies low is still held to what arrives.
    const lying = await register(
      post('/oauth/register', huge, { 'content-length': '10', 'x-forwarded-for': '198.18.0.3' }),
    )
    expect([400, 413]).toContain(lying.status)
  })

  it('limits by the address the proxy appended, not by whatever a client writes to its left', async () => {
    quiet()
    const answers = []
    for (let i = 0; i < 11; i++) {
      answers.push(
        (
          await register(
            post('/oauth/register', JSON.stringify(CLAUDE_REGISTRATION), {
              'x-forwarded-for': `10.1.1.${i}, 203.0.113.50`,
            }),
          )
        ).status,
      )
    }
    expect(answers.filter((status) => status === 201)).toHaveLength(10)
    expect(answers.at(-1)).toBe(429)
    expect((await registration(CLAUDE_REGISTRATION, '203.0.113.51')).status).toBe(201)
  })

  it('answers an unexpected failure as server_error JSON, not an HTML 500', async () => {
    quiet()
    const clients = await import('../../lib/oauth/clients')
    vi.spyOn(clients, 'registerClient').mockRejectedValueOnce(new Error('connection reset at 10.0.0.5'))
    const response = await registration(CLAUDE_REGISTRATION)
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.error).toBe('server_error')
    expect(JSON.stringify(body)).not.toContain('10.0.0.5')
  })
})

describe('POST /oauth/token', () => {
  let clientId: string
  let userId: string

  beforeEach(async () => {
    clientId = (await registerClient(db, { clientName: 'Claude', redirectUris: [REDIRECT] })).id
    userId = (await makeUser('admin')).id
  })

  async function freshCode() {
    const { code } = await issueAuthorizationCode(db, {
      clientId,
      userId,
      redirectUri: REDIRECT,
      scopes: ['homedocs:read', 'homedocs:write'],
      resource: `${BASE}/mcp`,
      codeChallenge: s256(VERIFIER),
    })
    return code
  }

  it('exchanges a code and refreshes, as claude.ai sends them (resource included)', async () => {
    const exchanged = await token(
      post(
        '/oauth/token',
        form([
          ['grant_type', 'authorization_code'],
          ['code', await freshCode()],
          ['redirect_uri', REDIRECT],
          ['code_verifier', VERIFIER],
          ['client_id', clientId],
          ['resource', `${BASE}/mcp`],
        ]),
        FORM,
      ),
    )
    expect(exchanged.status).toBe(200)
    const pair = await exchanged.json()
    expect((await resolveBearer(db, pair.access_token))?.userId).toBe(userId)

    const refreshed = await token(
      post(
        '/oauth/token',
        form([
          ['grant_type', 'refresh_token'],
          ['refresh_token', pair.refresh_token],
          ['client_id', clientId],
          ['resource', `${BASE}/mcp`],
        ]),
        FORM,
      ),
    )
    expect(refreshed.status).toBe(200)
    const next = await refreshed.json()
    expect(next.refresh_token).not.toBe(pair.refresh_token)
    expect((await resolveBearer(db, next.access_token))?.userId).toBe(userId)
  })

  it('refuses a parameter sent twice (RFC 6749 §3.2), before spending the code', async () => {
    const code = await freshCode()
    const twice = await token(
      post(
        '/oauth/token',
        form([
          ['grant_type', 'authorization_code'],
          ['code', code],
          ['code', 'another'],
          ['redirect_uri', REDIRECT],
          ['code_verifier', VERIFIER],
          ['client_id', clientId],
        ]),
        FORM,
      ),
    )
    expect(twice.status).toBe(400)
    expect(await twice.json()).toMatchObject({ error: 'invalid_request', error_description: 'code must be sent once, as text' })

    // The code was never looked at, so it still works.
    const once = await token(
      post(
        '/oauth/token',
        form([
          ['grant_type', 'authorization_code'],
          ['code', code],
          ['redirect_uri', REDIRECT],
          ['code_verifier', VERIFIER],
          ['client_id', clientId],
        ]),
        FORM,
      ),
    )
    expect(once.status).toBe(200)
  })

  it('refuses an overlong parameter and a body over 64 KB', async () => {
    const long = await token(post('/oauth/token', form([['grant_type', 'x'.repeat(5_000)]]), FORM))
    expect(long.status).toBe(400)
    expect(await long.json()).toMatchObject({ error: 'invalid_request', error_description: 'grant_type is too long' })

    const huge = form([['grant_type', 'refresh_token'], ['padding', 'x'.repeat(70_000)]])
    expect((await token(post('/oauth/token', huge, FORM))).status).toBe(413)
    expect((await token(chunked('/oauth/token', huge, FORM))).status).toBe(413)
  })

  it('keeps the messages a client already acts on', async () => {
    const answer = async (fields: [string, string][]) => (await token(post('/oauth/token', form(fields), FORM))).json()

    expect(await answer([['grant_type', 'authorization_code'], ['client_id', 'hd_nobody']])).toMatchObject({
      error: 'invalid_client',
    })
    expect(
      await answer([['grant_type', 'authorization_code'], ['client_id', clientId], ['code', 'c'], ['code_verifier', VERIFIER]]),
    ).toMatchObject({ error: 'invalid_request', error_description: 'redirect_uri is required' })
    expect(
      await answer([['grant_type', 'authorization_code'], ['client_id', clientId], ['code', 'c'], ['redirect_uri', REDIRECT]]),
    ).toMatchObject({ error: 'invalid_request', error_description: 'code_verifier is required — this server requires PKCE' })
    expect(await answer([['grant_type', 'refresh_token'], ['client_id', clientId]])).toMatchObject({
      error: 'invalid_request',
      error_description: 'refresh_token is required',
    })
    expect(await answer([['grant_type', 'password'], ['client_id', clientId]])).toMatchObject({
      error: 'unsupported_grant_type',
    })
  })

  it('answers an unexpected failure as server_error JSON', async () => {
    quiet()
    const grants = await import('../../lib/oauth/grants')
    vi.spyOn(grants, 'rotateRefreshToken').mockRejectedValueOnce(new Error('the pool is gone'))
    const response = await token(
      post('/oauth/token', form([['grant_type', 'refresh_token'], ['client_id', clientId], ['refresh_token', 'r']]), FORM),
    )
    expect(response.status).toBe(500)
    expect(await response.json()).toMatchObject({ error: 'server_error' })
  })
})

describe('POST /oauth/revoke', () => {
  it('revokes as claude.ai sends it, hint and client_id included', async () => {
    const clientId = (await registerClient(db, { clientName: 'Claude', redirectUris: [REDIRECT] })).id
    const userId = (await makeUser()).id
    const pair = await issueTokenPair(db, { clientId, userId, scopes: ['homedocs:read'], resource: null })

    const response = await revoke(
      post(
        '/oauth/revoke',
        form([
          ['token', pair.refreshToken],
          ['token_type_hint', 'refresh_token'],
          ['client_id', clientId],
        ]),
        FORM,
      ),
    )
    expect(response.status).toBe(200)
    expect(await resolveBearer(db, pair.accessToken)).toBeNull()
  })

  it('refuses a token sent twice, and a body over 64 KB', async () => {
    const twice = await revoke(post('/oauth/revoke', form([['token', 'a'], ['token', 'b']]), FORM))
    expect(twice.status).toBe(400)
    expect(await twice.json()).toMatchObject({ error: 'invalid_request' })

    const huge = form([['token', 'x'.repeat(70_000)]])
    expect((await revoke(post('/oauth/revoke', huge, FORM))).status).toBe(413)
  })
})
