/*
 * The authorize endpoint's decisions, without a browser.
 *
 * Two of them carry the whole design: which failures may be redirected and which
 * may not, and that the granted scope is the intersection of what was asked for
 * with what the account can carry rather than what was asked for.
 */

import { beforeEach, describe, expect, it } from "vitest";
import {
  AuthorizeFatal,
  AuthorizeRedirect,
  resolveTarget,
  validateRequest,
} from "../../lib/oauth/authorize";
import { registerClient } from "../../lib/oauth/clients";
import {
  consumeAuthorizationCode,
  issueAuthorizationCode,
  s256,
} from "../../lib/oauth/codes";
import { AUTHORIZATION_CODE_TTL_SECONDS } from "../../lib/oauth/config";
import { db, resetBetweenTests } from "../helpers/db";
import { makeUser } from "../helpers/fixtures";

resetBetweenTests();

const REDIRECT = "https://claude.ai/api/mcp/auth_callback";
const VERIFIER = "a".repeat(64);

let clientId: string;
let userId: string;

beforeEach(async () => {
  clientId = (
    await registerClient(db, { clientName: "Claude", redirectUris: [REDIRECT] })
  ).id;
  userId = (await makeUser("admin")).id;
});

function params(overrides: Record<string, string | undefined> = {}) {
  return {
    client_id: clientId,
    redirect_uri: REDIRECT,
    response_type: "code",
    scope: "homedocs:read homedocs:write",
    state: "opaque-state",
    code_challenge: s256(VERIFIER),
    code_challenge_method: "S256",
    ...overrides,
  };
}

describe("what may not be redirected", () => {
  it("refuses an unknown client without redirecting anywhere", async () => {
    // There is no proven address to send an error to, so it is rendered. An
    // error redirected to an unvalidated URI is an open redirect built by
    // accident.
    await expect(
      resolveTarget(db, params({ client_id: "hd_nope" })),
    ).rejects.toThrow(AuthorizeFatal);
  });

  it("refuses a redirect_uri the client did not register", async () => {
    await expect(
      resolveTarget(db, params({ redirect_uri: "https://evil.example/cb" })),
    ).rejects.toThrow(AuthorizeFatal);
  });

  it("accepts an omitted redirect_uri only when exactly one is registered", async () => {
    const target = await resolveTarget(db, params({ redirect_uri: undefined }));
    expect(target.redirectUri).toBe(REDIRECT);

    const twoUris = await registerClient(db, {
      clientName: "Ambiguous",
      redirectUris: [REDIRECT, "http://127.0.0.1:6274/cb"],
    });
    await expect(
      resolveTarget(
        db,
        params({ client_id: twoUris.id, redirect_uri: undefined }),
      ),
    ).rejects.toThrow(AuthorizeFatal);
  });
});

describe("what is redirected back to the client", () => {
  it("refuses a request with no PKCE challenge", async () => {
    const target = await resolveTarget(db, params());
    expect(() =>
      validateRequest(target, params({ code_challenge: undefined }), "admin"),
    ).toThrow(AuthorizeRedirect);
  });

  it("refuses a response_type other than code", async () => {
    const target = await resolveTarget(db, params());
    expect(() =>
      validateRequest(target, params({ response_type: "token" }), "admin"),
    ).toThrow(/response_type/);
  });

  it("carries state and the error code back to the client", async () => {
    const target = await resolveTarget(db, params());
    try {
      validateRequest(target, params({ scope: "library:nonsense" }), "admin");
      expect.unreachable("should have refused an unknown scope");
    } catch (err) {
      const redirect = err as AuthorizeRedirect;
      const location = new URL(redirect.location());
      expect(location.searchParams.get("error")).toBe("invalid_scope");
      // Without state the client cannot match the answer to its request, and
      // reports a generic failure instead of this one.
      expect(location.searchParams.get("state")).toBe("opaque-state");
      expect(location.origin + location.pathname).toBe(REDIRECT);
    }
  });

  it("refuses a resource this server does not serve", async () => {
    const target = await resolveTarget(db, params());
    // RFC 8707. Ignoring an unrecognized resource would mint a token the client
    // believes is bound more narrowly than it is.
    expect(() =>
      validateRequest(
        target,
        params({ resource: "https://someone-else.example/mcp" }),
        "admin",
      ),
    ).toThrow(/invalid_target|not a resource/);
  });
});

describe("scope ∩ role at consent time", () => {
  it("drops homedocs:write for a viewer and reports it as dropped", async () => {
    const target = await resolveTarget(db, params());
    const request = validateRequest(
      target,
      params({ scope: "homedocs:read homedocs:write" }),
      "viewer",
    );
    /* Not a refusal: the connector still works for everything the account can
       do, and the consent screen names what was dropped. */
    expect(request.scopes).toEqual(["homedocs:read"]);
    expect(request.dropped).toEqual(["homedocs:write"]);
  });

  it("refuses outright when nothing requested survives the intersection", async () => {
    const target = await resolveTarget(db, params());
    expect(() =>
      validateRequest(target, params({ scope: "homedocs:write" }), "viewer"),
    ).toThrow(AuthorizeRedirect);
  });

  it("defaults to read and write", async () => {
    const target = await resolveTarget(db, params());
    const request = validateRequest(
      target,
      params({ scope: undefined }),
      "member",
    );
    expect(request.scopes).toEqual(["homedocs:read", "homedocs:write"]);
  });
});

describe("the code itself", () => {
  it("exchanges once, with the right verifier", async () => {
    const { code } = await issueAuthorizationCode(db, {
      clientId,
      userId,
      redirectUri: REDIRECT,
      scopes: ["homedocs:read"],
      resource: null,
      codeChallenge: s256(VERIFIER),
    });

    const grant = await consumeAuthorizationCode(db, {
      code,
      clientId,
      redirectUri: REDIRECT,
      codeVerifier: VERIFIER,
    });
    expect(grant).toMatchObject({
      clientId,
      userId,
      scopes: ["homedocs:read"],
    });
  });

  it("refuses the wrong verifier", async () => {
    const { code } = await issueAuthorizationCode(db, {
      clientId,
      userId,
      redirectUri: REDIRECT,
      scopes: ["homedocs:read"],
      resource: null,
      codeChallenge: s256(VERIFIER),
    });

    // The whole point of PKCE: a code lifted out of a redirect is worthless
    // without the verifier that never left the client.
    await expect(
      consumeAuthorizationCode(db, {
        code,
        clientId,
        redirectUri: REDIRECT,
        codeVerifier: "b".repeat(64),
      }),
    ).rejects.toThrow(/code_verifier/);
  });

  it("refuses a redirect_uri that differs from the one it was issued against", async () => {
    const other = await registerClient(db, {
      clientName: "Two addresses",
      redirectUris: [REDIRECT, "http://127.0.0.1:6274/cb"],
    });
    const { code } = await issueAuthorizationCode(db, {
      clientId: other.id,
      userId,
      redirectUri: REDIRECT,
      scopes: ["homedocs:read"],
      resource: null,
      codeChallenge: s256(VERIFIER),
    });

    await expect(
      consumeAuthorizationCode(db, {
        code,
        clientId: other.id,
        redirectUri: "http://127.0.0.1:6274/cb",
        codeVerifier: VERIFIER,
      }),
    ).rejects.toThrow(/redirect_uri/);
  });

  it("refuses a code presented by a different client", async () => {
    const other = await registerClient(db, {
      clientName: "Other",
      redirectUris: [REDIRECT],
    });
    const { code } = await issueAuthorizationCode(db, {
      clientId,
      userId,
      redirectUri: REDIRECT,
      scopes: ["homedocs:read"],
      resource: null,
      codeChallenge: s256(VERIFIER),
    });

    await expect(
      consumeAuthorizationCode(db, {
        code,
        clientId: other.id,
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
      }),
    ).rejects.toThrow(/another client/);
  });

  it("refuses an expired code", async () => {
    const now = new Date();
    const { code } = await issueAuthorizationCode(db, {
      clientId,
      userId,
      redirectUri: REDIRECT,
      scopes: ["homedocs:read"],
      resource: null,
      codeChallenge: s256(VERIFIER),
      now,
    });

    await expect(
      consumeAuthorizationCode(db, {
        code,
        clientId,
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
        now: new Date(
          now.getTime() + (AUTHORIZATION_CODE_TTL_SECONDS + 1) * 1000,
        ),
      }),
    ).rejects.toThrow(/expired/);
  });

  it("reports a replay with enough to revoke the grant it produced", async () => {
    const { code } = await issueAuthorizationCode(db, {
      clientId,
      userId,
      redirectUri: REDIRECT,
      scopes: ["homedocs:read"],
      resource: null,
      codeChallenge: s256(VERIFIER),
    });
    const exchange = () =>
      consumeAuthorizationCode(db, {
        code,
        clientId,
        redirectUri: REDIRECT,
        codeVerifier: VERIFIER,
      });

    await exchange();

    /* A code presented twice means either a broken client or someone racing the
       legitimate exchange, and the two are indistinguishable from here. The
       error carries who to revoke rather than merely reporting a failure — RFC
       6749 §4.1.2 wants the grant taken down, not just the call refused. */
    await expect(exchange()).rejects.toMatchObject({ clientId, userId });
  });
});
