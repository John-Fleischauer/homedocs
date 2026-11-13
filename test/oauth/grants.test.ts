/*
 * Tokens: what they authorize, how they rotate, and what happens when one is
 * used twice.
 *
 * The two properties worth the most here are the ones a token cannot carry on
 * its own — that a demotion takes effect immediately rather than when the access
 * token expires, and that a replayed refresh token takes the whole grant down
 * with it.
 */

import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { ACCESS_TOKEN_TTL_SECONDS } from "../../lib/oauth/config";
import { OAuthError } from "../../lib/oauth/errors";
import {
  issueTokenPair,
  listGrants,
  resolveBearer,
  revokeGrant,
  revokeToken,
  rotateRefreshToken,
  purgeExpiredTokens,
} from "../../lib/oauth/grants";
import { oauthClients, users } from "../../lib/db/schema";
import { db, resetBetweenTests } from "../helpers/db";
import { makeUser } from "../helpers/fixtures";

resetBetweenTests();

const CLIENT = "hd_test_client";
const RESOURCE = "https://homedocs.example.test/mcp";

let userId: string;

beforeEach(async () => {
  userId = (await makeUser("admin")).id;
  await db.insert(oauthClients).values({
    id: CLIENT,
    clientName: "Claude",
    redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
  });
});

function issue(
  scopes: ("homedocs:read" | "homedocs:write")[] = [
    "homedocs:read",
    "homedocs:write",
  ],
) {
  return issueTokenPair(db, {
    clientId: CLIENT,
    userId,
    scopes,
    resource: RESOURCE,
  });
}

describe("bearer resolution", () => {
  it("resolves an access token to the caller, the client, and the scopes", async () => {
    const pair = await issue();
    const identity = await resolveBearer(db, pair.accessToken);

    expect(identity).toMatchObject({
      userId,
      role: "admin",
      clientId: CLIENT,
      clientName: "Claude",
      scopes: ["homedocs:read", "homedocs:write"],
      resource: RESOURCE,
    });
  });

  it("refuses a refresh token presented as a bearer", async () => {
    const pair = await issue();
    // Different kinds with different lifetimes and different powers. Accepting
    // one where the other belongs turns a ninety-day credential into an API key.
    expect(await resolveBearer(db, pair.refreshToken)).toBeNull();
  });

  it("refuses garbage, an empty string, and undefined", async () => {
    expect(await resolveBearer(db, "not-a-token")).toBeNull();
    expect(await resolveBearer(db, "")).toBeNull();
    expect(await resolveBearer(db, undefined)).toBeNull();
  });

  it("refuses an expired token", async () => {
    const pair = await issue();
    const later = new Date(Date.now() + (ACCESS_TOKEN_TTL_SECONDS + 60) * 1000);
    expect(await resolveBearer(db, pair.accessToken, later)).toBeNull();
  });

  it("narrows scopes the moment the role can no longer carry them", async () => {
    const pair = await issue(["homedocs:read", "homedocs:write"]);
    expect((await resolveBearer(db, pair.accessToken))!.scopes).toContain(
      "homedocs:write",
    );

    await db.update(users).set({ role: "viewer" }).where(eq(users.id, userId));

    /* The token's own scope string still says homedocs:write — it was minted
       while they were a member. The role is read live on every call precisely so
       the demotion takes effect now rather than in an hour. */
    const identity = await resolveBearer(db, pair.accessToken);
    expect(identity!.scopes).toEqual(["homedocs:read"]);
  });

  it("stops working the instant the user is soft-deleted", async () => {
    const pair = await issue();
    await db
      .update(users)
      .set({ deletedAt: new Date() })
      .where(eq(users.id, userId));

    // Their sessions stop working; their connectors have to stop with them.
    expect(await resolveBearer(db, pair.accessToken)).toBeNull();
  });

  it("records last use, so the Settings screen can say when", async () => {
    const pair = await issue();
    await resolveBearer(db, pair.accessToken);

    const [grant] = await listGrants(db, userId);
    expect(grant!.lastUsedAt).toBeInstanceOf(Date);
  });
});

describe("refresh rotation", () => {
  it("issues a new pair and retires the presented token", async () => {
    const first = await issue();
    const second = await rotateRefreshToken(db, {
      refreshToken: first.refreshToken,
      clientId: CLIENT,
    });

    expect(second.accessToken).not.toBe(first.accessToken);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect(await resolveBearer(db, second.accessToken)).not.toBeNull();
  });

  it("treats a second use of the same refresh token as theft", async () => {
    const first = await issue();
    const second = await rotateRefreshToken(db, {
      refreshToken: first.refreshToken,
      clientId: CLIENT,
    });

    /* Whoever arrives second is presenting a token that has already been spent.
       From here the client being broken and someone else holding a copy are
       indistinguishable, so OAuth 2.1 §4.3.1 says to revoke the authorization —
       and the access token minted a moment ago goes with it. */
    await expect(
      rotateRefreshToken(db, {
        refreshToken: first.refreshToken,
        clientId: CLIENT,
      }),
    ).rejects.toThrow(/already been used/);

    expect(await resolveBearer(db, second.accessToken)).toBeNull();
    await expect(
      rotateRefreshToken(db, {
        refreshToken: second.refreshToken,
        clientId: CLIENT,
      }),
    ).rejects.toThrow(OAuthError);
  });

  it("refuses a refresh token belonging to another client", async () => {
    await db.insert(oauthClients).values({
      id: "hd_other",
      clientName: "Someone else",
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
    });
    const pair = await issue();

    await expect(
      rotateRefreshToken(db, {
        refreshToken: pair.refreshToken,
        clientId: "hd_other",
      }),
    ).rejects.toThrow(/another client/);
  });

  it("lets scope narrow but never widen", async () => {
    const pair = await issue(["homedocs:read", "homedocs:write"]);

    const narrowed = await rotateRefreshToken(db, {
      refreshToken: pair.refreshToken,
      clientId: CLIENT,
      scopes: ["homedocs:read"],
    });
    expect(narrowed.scopes).toEqual(["homedocs:read"]);

    // Asking for more than the grant ever held gets the intersection, not the
    // request — a refresh is not a second consent screen.
    const widened = await rotateRefreshToken(db, {
      refreshToken: narrowed.refreshToken,
      clientId: CLIENT,
      scopes: ["homedocs:read", "homedocs:write"],
    });
    expect(widened.scopes).toEqual(["homedocs:read"]);
  });

  it("drops a scope the role can no longer carry", async () => {
    const pair = await issue(["homedocs:read", "homedocs:write"]);
    await db.update(users).set({ role: "viewer" }).where(eq(users.id, userId));

    const rotated = await rotateRefreshToken(db, {
      refreshToken: pair.refreshToken,
      clientId: CLIENT,
    });
    // A grant minted while they were a member must not survive their demotion by
    // refreshing itself.
    expect(rotated.scopes).toEqual(["homedocs:read"]);
  });
});

describe("revocation", () => {
  it("revoking a refresh token takes the whole grant, access tokens included", async () => {
    const pair = await issue();

    expect(await revokeToken(db, pair.refreshToken)).toBe(true);

    /* RFC 7009 §2.1 and intent agree here: "disconnect this connector" should
       not leave an access token live for another hour. */
    expect(await resolveBearer(db, pair.accessToken)).toBeNull();
    await expect(
      rotateRefreshToken(db, {
        refreshToken: pair.refreshToken,
        clientId: CLIENT,
      }),
    ).rejects.toThrow(OAuthError);
  });

  it("revoking an access token leaves the refresh token alone", async () => {
    const pair = await issue();
    await revokeToken(db, pair.accessToken);

    expect(await resolveBearer(db, pair.accessToken)).toBeNull();
    const rotated = await rotateRefreshToken(db, {
      refreshToken: pair.refreshToken,
      clientId: CLIENT,
    });
    expect(rotated.accessToken).toBeTruthy();
  });

  it("reports an unknown token as not found rather than failing", async () => {
    // The endpoint answers 200 either way (§2.2) — a revocation that
    // distinguishes the two is an oracle for guessing tokens.
    expect(await revokeToken(db, "never-existed")).toBe(false);
  });

  it("revokes every token one client holds for one user", async () => {
    const first = await issue();
    const second = await issue(["homedocs:read"]);

    expect(await revokeGrant(db, { userId, clientId: CLIENT })).toBe(4);
    expect(await resolveBearer(db, first.accessToken)).toBeNull();
    expect(await resolveBearer(db, second.accessToken)).toBeNull();
  });
});

describe("the Settings read", () => {
  it("lists one row per client with the union of live scopes", async () => {
    const pair = await issue(["homedocs:read", "homedocs:write"]);
    await rotateRefreshToken(db, {
      refreshToken: pair.refreshToken,
      clientId: CLIENT,
      scopes: ["homedocs:read"],
    });

    const grants = await listGrants(db, userId);
    // Two scope strings underneath, one connector as far as a person is
    // concerned.
    expect(grants).toHaveLength(1);
    expect(grants[0]!.clientName).toBe("Claude");
    expect(grants[0]!.scopes.sort()).toEqual([
      "homedocs:read",
      "homedocs:write",
    ]);
  });

  it("does not list a revoked grant", async () => {
    const pair = await issue();
    await revokeToken(db, pair.refreshToken);
    expect(await listGrants(db, userId)).toEqual([]);
  });
});

describe("housekeeping", () => {
  it("purges expired rows and leaves live ones", async () => {
    const pair = await issue();
    const wayLater = new Date(Date.now() + 200 * 24 * 60 * 60 * 1000);

    expect(await purgeExpiredTokens(db, wayLater)).toBe(2);
    expect(await resolveBearer(db, pair.accessToken)).toBeNull();
  });
});
