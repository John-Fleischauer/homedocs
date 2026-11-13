/*
 * The route handlers themselves, called the way a client calls them.
 *
 * The lib tests cover the decisions; this file covers the wire — form encoding,
 * status codes, CORS preflight, and the discovery documents. Those are exactly
 * the all-or-nothing parts: a missing preflight header or a
 * wrong issuer breaks the connector with an error that names none of this, and
 * the handshake is manual to test end to end, so the halves that
 * can be asserted should be.
 *
 * DATABASE_URL is pointed at this file's own database before the route modules
 * are imported: they reach for `@/lib/db`, which connects on first use.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { registerClient } from "../../lib/oauth/clients";
import { issueAuthorizationCode, s256 } from "../../lib/oauth/codes";
import { issueTokenPair, resolveBearer } from "../../lib/oauth/grants";
import { databaseUrl, db, resetBetweenTests } from "../helpers/db";
import { makeUser } from "../helpers/fixtures";

process.env.DATABASE_URL = databaseUrl;
process.env.PUBLIC_BASE_URL = "https://homedocs.example.test";

const { GET: protectedResource, OPTIONS: protectedResourcePreflight } =
  await import("../../app/.well-known/oauth-protected-resource/[[...resource]]/route");
const { GET: authorizationServer } =
  await import("../../app/.well-known/oauth-authorization-server/[[...resource]]/route");
const { POST: register } = await import("../../app/oauth/register/route");
const { POST: token } = await import("../../app/oauth/token/route");
const { POST: revoke } = await import("../../app/oauth/revoke/route");

resetBetweenTests();

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "a".repeat(64);

function form(fields: Record<string, string>): Request {
  return new Request("https://homedocs.example.test/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString(),
  });
}

function registration(body: unknown, ip = "203.0.113.10"): Request {
  return new Request("https://homedocs.example.test/oauth/register", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });
}

describe("discovery", () => {
  it("describes the protected resource and points at the authorization server", async () => {
    const body = await (await protectedResource()).json();

    expect(body).toMatchObject({
      resource: "https://homedocs.example.test/mcp",
      authorization_servers: ["https://homedocs.example.test"],
      scopes_supported: ["homedocs:read", "homedocs:write"],
    });
  });

  it("advertises S256, public clients, and both grants", async () => {
    const body = await (await authorizationServer()).json();

    expect(body).toMatchObject({
      // Must be exactly the origin the document was discovered at, or the
      // client rejects it as a mismatch.
      issuer: "https://homedocs.example.test",
      authorization_endpoint: "https://homedocs.example.test/oauth/authorize",
      token_endpoint: "https://homedocs.example.test/oauth/token",
      registration_endpoint: "https://homedocs.example.test/oauth/register",
      revocation_endpoint: "https://homedocs.example.test/oauth/revoke",
      code_challenge_methods_supported: ["S256"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
    });
    // `plain` alongside S256 would make PKCE optional in practice, since the
    // client picks.
    expect(body.code_challenge_methods_supported).not.toContain("plain");
  });

  it("answers a preflight, without which the connector cannot fetch it", async () => {
    const response = await protectedResourcePreflight();

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("access-control-allow-headers")).toContain(
      "authorization",
    );
  });

  it("is served fresh, so a PUBLIC_BASE_URL change is not cached over", async () => {
    expect((await protectedResource()).headers.get("cache-control")).toBe(
      "no-store",
    );
  });
});

describe("registration over HTTP", () => {
  it("registers and returns 201 with a client_id", async () => {
    const response = await register(
      registration({ client_name: "Claude", redirect_uris: [REDIRECT] }),
    );

    expect(response.status).toBe(201);
    const body = await response.json();
    expect(body.client_id).toMatch(/^hd_/);
    expect(body.token_endpoint_auth_method).toBe("none");
  });

  it("answers an unacceptable redirect_uri with invalid_redirect_uri", async () => {
    const response = await register(
      registration({
        client_name: "Nope",
        redirect_uris: ["https://evil.example/cb"],
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_redirect_uri");
  });

  it("answers a body that is not JSON rather than throwing", async () => {
    const response = await register(
      new Request("https://homedocs.example.test/oauth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "not json",
      }),
    );
    expect(response.status).toBe(400);
  });

  it("rate-limits by address", async () => {
    const ip = "198.51.100.7";
    const attempts = [];
    for (let i = 0; i < 12; i += 1) {
      attempts.push(
        await register(
          registration({ client_name: `C${i}`, redirect_uris: [REDIRECT] }, ip),
        ),
      );
    }

    // Ten an hour: generous for a person connecting a connector, useless as a
    // way to fill a table.
    expect(attempts.filter((r) => r.status === 201)).toHaveLength(10);
    const limited = attempts.at(-1)!;
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("3600");
  });
});

describe("the token endpoint", () => {
  let clientId: string;
  let userId: string;

  beforeEach(async () => {
    clientId = (
      await registerClient(db, {
        clientName: "Claude",
        redirectUris: [REDIRECT],
      })
    ).id;
    userId = (await makeUser("admin")).id;
  });

  async function freshCode() {
    const { code } = await issueAuthorizationCode(db, {
      clientId,
      userId,
      redirectUri: REDIRECT,
      scopes: ["homedocs:read", "homedocs:write"],
      resource: "https://homedocs.example.test/mcp",
      codeChallenge: s256(VERIFIER),
    });
    return code;
  }

  it("exchanges a code for a usable bearer token", async () => {
    const response = await token(
      form({
        grant_type: "authorization_code",
        client_id: clientId,
        code: await freshCode(),
        redirect_uri: REDIRECT,
        code_verifier: VERIFIER,
      }),
    );

    expect(response.status).toBe(200);
    // Never cached by anything, ever — RFC 6749 §5.1.
    expect(response.headers.get("cache-control")).toBe("no-store");

    const body = await response.json();
    expect(body.token_type).toBe("Bearer");
    expect(body.scope).toBe("homedocs:read homedocs:write");
    expect(body.expires_in).toBe(3600);
    expect((await resolveBearer(db, body.access_token))!.userId).toBe(userId);
  });

  it("refuses the exchange with no code_verifier", async () => {
    const response = await token(
      form({
        grant_type: "authorization_code",
        client_id: clientId,
        code: await freshCode(),
        redirect_uri: REDIRECT,
      }),
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("invalid_request");
  });

  it("leaves the code spendable when the exchange fails", async () => {
    const code = await freshCode();

    const failed = await token(
      form({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        redirect_uri: REDIRECT,
        code_verifier: "b".repeat(64),
      }),
    );
    expect(failed.status).toBe(400);

    /* One transaction: the code is spent and the tokens are minted together or
       neither happens. A failure that consumed the code anyway would leave the
       user with a connector that cannot be retried and nothing saying why. */
    const retried = await token(
      form({
        grant_type: "authorization_code",
        client_id: clientId,
        code,
        redirect_uri: REDIRECT,
        code_verifier: VERIFIER,
      }),
    );
    expect(retried.status).toBe(200);
  });

  it("revokes the grant when a code is replayed", async () => {
    const code = await freshCode();
    const exchange = () =>
      token(
        form({
          grant_type: "authorization_code",
          client_id: clientId,
          code,
          redirect_uri: REDIRECT,
          code_verifier: VERIFIER,
        }),
      );

    const first = await (await exchange()).json();
    const replay = await exchange();

    expect(replay.status).toBe(400);
    expect((await replay.json()).error).toBe("invalid_grant");
    // The tokens the first exchange produced go down with it: by now either the
    // client is broken or someone else has the code.
    expect(await resolveBearer(db, first.access_token)).toBeNull();
  });

  it("refuses an unknown client_id with 401 invalid_client", async () => {
    const response = await token(
      form({
        grant_type: "authorization_code",
        client_id: "hd_never_registered",
        code: "x",
        redirect_uri: REDIRECT,
        code_verifier: VERIFIER,
      }),
    );

    expect(response.status).toBe(401);
    expect((await response.json()).error).toBe("invalid_client");
  });

  it("names an unsupported grant_type instead of failing generically", async () => {
    const response = await token(
      form({ grant_type: "password", client_id: clientId }),
    );
    expect((await response.json()).error).toBe("unsupported_grant_type");
  });

  it("rotates a refresh token", async () => {
    const pair = await issueTokenPair(db, {
      clientId,
      userId,
      scopes: ["homedocs:read"],
      resource: null,
    });

    const response = await token(
      form({
        grant_type: "refresh_token",
        client_id: clientId,
        refresh_token: pair.refreshToken,
      }),
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.refresh_token).not.toBe(pair.refreshToken);
    expect(body.scope).toBe("homedocs:read");
  });
});

describe("revocation over HTTP", () => {
  it("answers 200 and takes the grant down", async () => {
    const clientId = (
      await registerClient(db, {
        clientName: "Claude",
        redirectUris: [REDIRECT],
      })
    ).id;
    const userId = (await makeUser()).id;
    const pair = await issueTokenPair(db, {
      clientId,
      userId,
      scopes: ["homedocs:read"],
      resource: null,
    });

    const response = await revoke(form({ token: pair.refreshToken }));

    expect(response.status).toBe(200);
    expect(await resolveBearer(db, pair.accessToken)).toBeNull();
  });

  it("answers 200 for a token that never existed", async () => {
    // §2.2. Distinguishing the two would be an oracle for testing guesses.
    expect((await revoke(form({ token: "never-existed" }))).status).toBe(200);
  });

  it("requires a token parameter", async () => {
    expect((await revoke(form({}))).status).toBe(400);
  });
});
