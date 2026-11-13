/*
 * The pure parts of the authorization server: what a role may carry, what a
 * redirect URI may be, and what PKCE will accept.
 *
 * No database, because none of these decisions touch one — and they are the
 * decisions that fail closed or fail open, which is exactly the kind worth
 * pinning down without a container in the way.
 */

import { createHash, randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { safeNext } from "../../lib/auth/redirects";
import { assertUsableChallenge, s256 } from "../../lib/oauth/codes";
import {
  parseScope,
  redirectUriAllowed,
  scopesForRole,
} from "../../lib/oauth/config";
import { OAuthError } from "../../lib/oauth/errors";

describe("scope ∩ role", () => {
  it("gives admins and members read and write, and a viewer read only", () => {
    expect(scopesForRole("admin")).toEqual(["homedocs:read", "homedocs:write"]);
    expect(scopesForRole("member")).toEqual([
      "homedocs:read",
      "homedocs:write",
    ]);
    expect(scopesForRole("viewer")).toEqual(["homedocs:read"]);
  });

  it("reports unknown scopes rather than dropping them", () => {
    const { scopes, unknown } = parseScope("homedocs:read library:everything");
    expect(scopes).toEqual(["homedocs:read"]);
    // Silently ignoring one would mint a token narrower than the client thinks
    // it holds, and the mismatch would surface as a tool that mysteriously fails.
    expect(unknown).toEqual(["library:everything"]);
  });

  it("deduplicates and tolerates ragged whitespace", () => {
    expect(
      parseScope("  homedocs:read   homedocs:read homedocs:write ").scopes,
    ).toEqual(["homedocs:read", "homedocs:write"]);
    expect(parseScope(null).scopes).toEqual([]);
  });
});

describe("redirect URI allowlist", () => {
  it("accepts the claude.ai and claude.com callbacks", () => {
    expect(redirectUriAllowed("https://claude.ai/api/mcp/auth_callback")).toBe(
      true,
    );
    expect(redirectUriAllowed("https://claude.com/api/mcp/auth_callback")).toBe(
      true,
    );
  });

  it("accepts an organization-scoped callback, which carries an id in the path", () => {
    /* There is no fixed string to enumerate for these — the organization id is
       in the path — which is why the allowlist is an anchored pattern rather
       than a list of literals. Refusing them is what made the first real
       connection attempt fail with "couldn't register". */
    expect(
      redirectUriAllowed(
        "https://claude.ai/api/organizations/01998d31-3d18-7bc9-9c11-5a0f13fbf1ff/mcp/auth_callback",
      ),
    ).toBe(true);
    expect(
      redirectUriAllowed(
        "https://claude.com/api/organizations/abc123/mcp/auth_callback",
      ),
    ).toBe(true);
  });

  it("anchors the path pattern at both ends", () => {
    // The free segment is one path component and cannot contain a slash, so it
    // cannot be used to walk anywhere else.
    expect(
      redirectUriAllowed(
        "https://claude.ai/api/organizations/a/mcp/auth_callback/extra",
      ),
    ).toBe(false);
    expect(
      redirectUriAllowed("https://claude.ai/prefix/api/mcp/auth_callback"),
    ).toBe(false);
    expect(
      redirectUriAllowed(
        "https://claude.ai/api/organizations//mcp/auth_callback",
      ),
    ).toBe(false);
  });

  it("accepts loopback on any port, for local MCP clients", () => {
    expect(redirectUriAllowed("http://127.0.0.1:6274/oauth/callback")).toBe(
      true,
    );
    expect(redirectUriAllowed("http://localhost:33418/callback")).toBe(true);
    expect(redirectUriAllowed("http://[::1]:8080/cb")).toBe(true);
  });

  it("refuses anything else, including near misses", () => {
    // The near misses are the point. Each of these is what a prefix match or a
    // sloppy hostname check would let through.
    expect(
      redirectUriAllowed(
        "https://claude.ai.evil.example/api/mcp/auth_callback",
      ),
    ).toBe(false);
    expect(
      redirectUriAllowed("https://notclaude.ai/api/mcp/auth_callback"),
    ).toBe(false);
    expect(redirectUriAllowed("https://evil.example/cb")).toBe(false);
    expect(redirectUriAllowed("http://127.0.0.1.evil.example/cb")).toBe(false);
    expect(redirectUriAllowed("javascript:alert(1)")).toBe(false);
    expect(redirectUriAllowed("not a url")).toBe(false);
  });

  it("refuses the claude hosts over plain http", () => {
    // An authorization code is not going anywhere in the clear.
    expect(redirectUriAllowed("http://claude.ai/api/mcp/auth_callback")).toBe(
      false,
    );
  });

  it("refuses a query string, since nothing here registers one", () => {
    expect(
      redirectUriAllowed("https://claude.ai/api/mcp/auth_callback?next=evil"),
    ).toBe(false);
  });

  it("refuses a fragment, which RFC 6749 §3.1.2 forbids on a redirect URI", () => {
    expect(redirectUriAllowed("http://127.0.0.1:6274/cb#fragment")).toBe(false);
  });
});

describe("PKCE", () => {
  it("computes the S256 challenge as base64url, unpadded", () => {
    const verifier = randomBytes(32).toString("base64url");
    const expected = createHash("sha256").update(verifier).digest("base64url");

    expect(s256(verifier)).toBe(expected);
    expect(s256(verifier)).not.toContain("=");
    expect(s256(verifier)).toHaveLength(43);
  });

  it("refuses an authorize request with no challenge", () => {
    // Mandatory, not negotiated: without this there is a downgrade path a client
    // takes simply by omitting the parameter.
    expect(() => assertUsableChallenge(null, "S256")).toThrow(OAuthError);
  });

  it("refuses the plain method", () => {
    expect(() => assertUsableChallenge(s256("x".repeat(43)), "plain")).toThrow(
      /S256/,
    );
  });

  it("refuses a challenge that is not a base64url digest", () => {
    expect(() => assertUsableChallenge("short", "S256")).toThrow(/base64url/);
    expect(() => assertUsableChallenge("!".repeat(43), "S256")).toThrow(
      /base64url/,
    );
  });

  it("accepts a well-formed challenge with the method omitted", () => {
    // RFC 7636 defaults the method to plain when absent, but a client that omits
    // it while sending an S256 digest is the common case and S256 is the only
    // thing advertised — so absence means S256 here rather than a downgrade.
    expect(() =>
      assertUsableChallenge(s256("v".repeat(43)), null),
    ).not.toThrow();
  });
});

describe("post-login redirect", () => {
  it("keeps a path on this origin", () => {
    expect(safeNext("/oauth/authorize?client_id=abc&state=xyz")).toBe(
      "/oauth/authorize?client_id=abc&state=xyz",
    );
  });

  it("refuses every shape of open redirect", () => {
    expect(safeNext("https://evil.example")).toBe("/");
    // Protocol-relative: a browser resolves this against the current scheme and
    // leaves the site, which is the one that looks like a path at a glance.
    expect(safeNext("//evil.example")).toBe("/");
    expect(safeNext("/\\evil.example")).toBe("/");
    expect(safeNext("javascript:alert(1)")).toBe("/");
    expect(safeNext(undefined)).toBe("/");
  });

  it("refuses a control character, which is a header-splitting attempt", () => {
    expect(safeNext("/library\r\nSet-Cookie: a=b")).toBe("/");
  });
});
