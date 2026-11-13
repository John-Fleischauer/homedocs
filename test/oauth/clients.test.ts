/*
 * Dynamic Client Registration — the only unauthenticated write endpoint in the
 * app, so what it refuses matters more than what it accepts.
 */

import { describe, expect, it } from "vitest";
import {
  MAX_CLIENTS,
  UNCONSENTED_CLIENT_TTL_MS,
  countClients,
  findClient,
  pruneUnconsentedClients,
  redirectUriRegistered,
  registerClient,
  registrationResponse,
} from "../../lib/oauth/clients";
import { issueAuthorizationCode } from "../../lib/oauth/codes";
import { OAuthError } from "../../lib/oauth/errors";
import { oauthClients } from "../../lib/db/schema";
import { db, resetBetweenTests } from "../helpers/db";
import { makeUser } from "../helpers/fixtures";

resetBetweenTests();

const claudeCallback = "https://claude.ai/api/mcp/auth_callback";

describe("registration", () => {
  it("registers a client and issues a public-client response", async () => {
    const client = await registerClient(db, {
      clientName: "Claude",
      redirectUris: [claudeCallback],
    });

    expect(client.id).toMatch(/^hd_/);
    const response = registrationResponse(client);
    // No secret is issued, so none can be presented — PKCE is what proves the
    // caller is the software that started the flow.
    expect(response.token_endpoint_auth_method).toBe("none");
    expect(response).not.toHaveProperty("client_secret");
    expect(response.grant_types).toEqual([
      "authorization_code",
      "refresh_token",
    ]);
  });

  it("refuses a redirect_uri outside the allowlist, and stores nothing", async () => {
    await expect(
      registerClient(db, {
        clientName: "Nope",
        redirectUris: ["https://evil.example/cb"],
      }),
    ).rejects.toThrow(OAuthError);

    /* The row never exists. Storing it and refusing later at authorize time
       would make registration a database-growth primitive for anyone who finds
       the URL, so the refusal happens here. */
    expect(await countClients(db)).toBe(0);
  });

  it("refuses a registration with no redirect_uris at all", async () => {
    await expect(registerClient(db, { clientName: "Nope" })).rejects.toThrow(
      /redirect_uris/,
    );
    await expect(registerClient(db, { redirectUris: [] })).rejects.toThrow(
      /redirect_uris/,
    );
  });

  it("drops a logo_uri that is not https", async () => {
    // It is rendered as an <img> on the consent screen, which makes a
    // javascript: or data: URI the one way a registration payload could become
    // script on the page where a human approves access.
    const client = await registerClient(db, {
      clientName: "Sneaky",
      redirectUris: [claudeCallback],
      logoUri: "javascript:alert(document.cookie)",
    });
    expect(client.logoUri).toBeNull();
  });

  it("names the client when the registration does not", async () => {
    const client = await registerClient(db, { redirectUris: [claudeCallback] });
    expect(client.clientName).toBe("Unnamed client");
  });

  it("matches redirect URIs exactly, never by prefix", async () => {
    const client = await registerClient(db, {
      clientName: "Claude",
      redirectUris: [claudeCallback],
    });

    expect(redirectUriRegistered(client, claudeCallback)).toBe(true);
    // Each of these is what a prefix or "starts with" check would let through,
    // and each would hand an authorization code to somewhere it should not go.
    expect(redirectUriRegistered(client, `${claudeCallback}/../../evil`)).toBe(
      false,
    );
    expect(redirectUriRegistered(client, `${claudeCallback}?x=1`)).toBe(false);
    expect(redirectUriRegistered(client, claudeCallback.toUpperCase())).toBe(
      false,
    );
  });

  it("caps the number of registered clients", async () => {
    const now = new Date();
    await db.insert(oauthClients).values(
      Array.from({ length: MAX_CLIENTS }, (_, i) => ({
        id: `hd_filler_${i}`,
        clientName: `Filler ${i}`,
        redirectUris: [claudeCallback],
        createdAt: now,
        // Consented, so the prune cannot clear them and the cap is what answers.
        lastUsedAt: now,
      })),
    );

    await expect(
      registerClient(
        db,
        { clientName: "One too many", redirectUris: [claudeCallback] },
        now,
      ),
    ).rejects.toThrow(OAuthError);
  });
});

describe("pruning", () => {
  const dayOld = (now: Date) =>
    new Date(now.getTime() - UNCONSENTED_CLIENT_TTL_MS - 1000);

  it("drops a client registered a day ago that nobody ever approved", async () => {
    const now = new Date();
    await db.insert(oauthClients).values({
      id: "hd_stale",
      clientName: "Never approved",
      redirectUris: [claudeCallback],
      createdAt: dayOld(now),
    });

    expect(await pruneUnconsentedClients(db, now)).toBe(1);
    expect(await findClient(db, "hd_stale")).toBeNull();
  });

  it("keeps a stale client that was consented to", async () => {
    const now = new Date();
    const user = await makeUser();
    await db.insert(oauthClients).values({
      id: "hd_granted",
      clientName: "Approved once",
      redirectUris: [claudeCallback],
      createdAt: dayOld(now),
    });
    /* A code was issued against it, which is the trace of a human having
       approved something. Pruning it would revoke a working connector for the
       crime of being quiet. */
    await issueAuthorizationCode(db, {
      clientId: "hd_granted",
      userId: user.id,
      redirectUri: claudeCallback,
      scopes: ["homedocs:read"],
      resource: null,
      codeChallenge: "x".repeat(43),
      now,
    });

    expect(await pruneUnconsentedClients(db, now)).toBe(0);
    expect(await findClient(db, "hd_granted")).not.toBeNull();
  });

  it("keeps a young unconsented client", async () => {
    const now = new Date();
    await registerClient(
      db,
      { clientName: "Just registered", redirectUris: [claudeCallback] },
      now,
    );
    expect(await pruneUnconsentedClients(db, now)).toBe(0);
  });

  it("runs before the cap, so garbage cannot wedge registration permanently", async () => {
    const now = new Date();
    await db.insert(oauthClients).values(
      Array.from({ length: MAX_CLIENTS }, (_, i) => ({
        id: `hd_junk_${i}`,
        clientName: `Junk ${i}`,
        redirectUris: [claudeCallback],
        createdAt: dayOld(now),
      })),
    );

    // A deployment that hit the ceiling on registrations nobody approved should
    // come back on its own rather than needing someone with a psql prompt.
    const client = await registerClient(
      db,
      { clientName: "Real", redirectUris: [claudeCallback] },
      now,
    );
    expect(client.id).toMatch(/^hd_/);
    expect(await countClients(db)).toBe(1);
  });
});
