/*
 * POST /mcp over HTTP.
 *
 * The one thing here that nothing else can check is the 401. A bare 401 stalls
 * OAuth discovery — the client has no way to find the metadata document and
 * gives up with an error that names nothing — the connection is all-or-nothing. It is also invisible in a unit test of the tool
 * layer, because by then a caller is already authenticated.
 *
 * The rest is the stateless property: a fresh server per request, so a second
 * call does not depend on reaching the container that served the first.
 */

import { beforeEach, describe, expect, it } from 'vitest'
import { createSpace } from '../../lib/places/places'
import { makeProperty } from '../helpers/fixtures'
import { registerClient } from '../../lib/oauth/clients'
import { issueTokenPair } from '../../lib/oauth/grants'
import { databaseUrl, db, resetBetweenTests } from '../helpers/db'
import { actorFor, makeUser } from '../helpers/fixtures'

process.env.DATABASE_URL = databaseUrl
process.env.PUBLIC_BASE_URL = 'https://homedocs.example.test'

const { POST, GET, OPTIONS } = await import('../../app/mcp/route')

resetBetweenTests()

let accessToken: string
let userId: string

beforeEach(async () => {
  const client = await registerClient(db, {
    clientName: 'Claude',
    redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
  })
  const user = await makeUser('admin')
  userId = user.id
  const pair = await issueTokenPair(db, {
    clientId: client.id,
    userId: user.id,
    scopes: ['homedocs:read'],
    resource: 'https://homedocs.example.test/mcp',
  })
  accessToken = pair.accessToken
})

let nextId = 1

function rpc(method: string, params: Record<string, unknown> = {}, token = accessToken): Request {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    // Both, because Streamable HTTP lets the server answer either way.
    accept: 'application/json, text/event-stream',
  }
  if (token) headers.authorization = `Bearer ${token}`

  return new Request('https://homedocs.example.test/mcp', {
    method: 'POST',
    headers,
    body: JSON.stringify({ jsonrpc: '2.0', id: nextId++, method, params }),
  })
}

async function call(request: Request) {
  const response = await POST(request)
  return { response, body: await response.json() }
}

describe('the 401', () => {
  it('names the metadata document, without which discovery cannot start', async () => {
    const response = await POST(rpc('tools/list', {}, ''))

    expect(response.status).toBe(401)
    const challenge = response.headers.get('www-authenticate')!
    expect(challenge).toMatch(/^Bearer /)
    /* Step 1 of the handshake in MCP.md. This exact string is what the client
       fetches next; without it there is no step 2. */
    expect(challenge).toContain(
      'resource_metadata="https://homedocs.example.test/.well-known/oauth-protected-resource/mcp"',
    )
  })

  it('answers a GET the same way, since an unauthenticated GET is a probe', async () => {
    const response = await GET(
      new Request('https://homedocs.example.test/mcp', { method: 'GET' }),
    )
    // 401 before 405: telling a client the endpoint is broken when it merely
    // needs to log in is how discovery dead-ends.
    expect(response.status).toBe(401)
    expect(response.headers.get('www-authenticate')).toContain('resource_metadata=')
  })

  it('refuses a revoked, expired, or invented token alike', async () => {
    expect((await POST(rpc('tools/list', {}, 'made-up'))).status).toBe(401)
  })

  it('is JSON-RPC shaped, so a client that reads the body gets something parseable', async () => {
    const response = await POST(rpc('tools/list', {}, ''))
    const body = await response.json()
    expect(body).toMatchObject({ jsonrpc: '2.0', error: { code: -32001 } })
  })

  it('answers a preflight so a browser client can reach it at all', async () => {
    const response = await OPTIONS()
    expect(response.status).toBe(204)
    expect(response.headers.get('access-control-allow-headers')).toContain('authorization')
    // The client has to be able to *read* the challenge, not just receive it.
    expect(response.headers.get('access-control-expose-headers')).toContain('www-authenticate')
  })
})

describe('the methods this server does not offer', () => {
  it('refuses an authenticated GET rather than holding a stream open for nothing', async () => {
    const response = await GET(
      new Request('https://homedocs.example.test/mcp', {
        method: 'GET',
        headers: { authorization: `Bearer ${accessToken}`, accept: 'text/event-stream' },
      }),
    )

    /* The transport would happily open an SSE stream and wait forever for a
       message this server never sends. One idle connection per client, to
       deliver nothing. */
    expect(response.status).toBe(405)
    expect(response.headers.get('allow')).toContain('POST')
  })
})

describe('the handshake', () => {
  it('initializes and reports the tools capability', async () => {
    const { response, body } = await call(
      rpc('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      }),
    )

    expect(response.status).toBe(200)
    expect(body.result.serverInfo).toMatchObject({ name: 'homedocs' })
    expect(body.result.capabilities).toHaveProperty('tools')
  })

  it('issues no session id, so no request depends on reaching the same container', async () => {
    const { response } = await call(
      rpc('initialize', {
        protocolVersion: '2025-06-18',
        capabilities: {},
        clientInfo: { name: 'test', version: '0' },
      }),
    )

    // Stateless transport (docs/ARCHITECTURE.md, MCP). A session id here would mean sticky routing
    // and a restart mid-conversation that is anything but invisible.
    expect(response.headers.get('mcp-session-id')).toBeNull()
  })

  it('serves tools/list on a fresh request with no prior initialize', async () => {
    /* The stateless property, stated as a test: every request carries its own
       credentials and builds its own server, so there is no handshake to have
       missed. */
    const { body } = await call(rpc('tools/list'))
    expect(body.result.tools.map((t: { name: string }) => t.name)).toContain('find_part_for')
  })
})

describe('calling a tool over HTTP', () => {
  it('reads homedocs as the user the token belongs to', async () => {
    const scope = await makeProperty()
    await createSpace(db, scope, actorFor({ id: userId, role: 'admin' }), { name: 'Living room' })

    const { body } = await call(rpc('tools/call', { name: 'search', arguments: { query: 'living' } }))

    expect(body.result.structuredContent.hits[0].title).toBe('Living room')
  })

  it('refuses a tool outside the token scopes with content, not a protocol error', async () => {
    const client = await registerClient(db, {
      clientName: 'Narrow',
      redirectUris: ['https://claude.ai/api/mcp/auth_callback'],
    })
    const narrow = await issueTokenPair(db, {
      clientId: client.id,
      userId,
      scopes: [],
      resource: null,
    })

    const { response, body } = await call(
      rpc('tools/call', { name: 'search', arguments: { query: 'x' } }, narrow.accessToken),
    )

    /* 200 at the HTTP layer with isError on the result: the call was understood
       and refused, which is a different thing from the request being malformed.
       And the refusal names the scope — "insufficient" on its own leaves a model
       retrying the same call. */
    expect(response.status).toBe(200)
    expect(body.result.isError).toBe(true)
    expect(body.result.content[0].text).toContain('homedocs:read')
  })
})
