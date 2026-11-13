/*
 * What the authorization server is, in one file.
 *
 * homedocs is both the resource server and the authorization server,
 * so every URL below is built from one origin. That origin is PUBLIC_BASE_URL,
 * and a wrong value is the single most likely reason a connector fails to add:
 * the discovery documents advertise endpoints on it, and claude.ai compares the
 * issuer it discovers against the URL it was given. It has to be the external
 * HTTPS origin, not the container's own address.
 */

import type { Role } from "../core/types";

/* Two scopes. Deleting is not offered over MCP in v1 — it happens in the app,
   where "Recently deleted" is one tap away. */
export const SCOPES = ["homedocs:read", "homedocs:write"] as const;

export type Scope = (typeof SCOPES)[number];

export function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}

/**
 * The scopes a role can carry — the role half of scope ∩ role (MCP.md).
 *
 * This is what the authorize endpoint filters a request through, so a `viewer`
 * asking for `homedocs:write` is granted the rest and told, rather than handed a
 * token that is refused at every call. The intersection is enforced again at
 * invocation; this is the half that stops the token existing in the first place.
 */
export function scopesForRole(role: Role): Scope[] {
  return role === "viewer" ? ["homedocs:read"] : [...SCOPES];
}

/** Space-delimited, per RFC 6749 §3.3. Unknown values are reported, not ignored. */
export function parseScope(raw: string | null | undefined): {
  scopes: Scope[];
  unknown: string[];
} {
  const parts = (raw ?? "").split(/\s+/).filter(Boolean);
  const scopes: Scope[] = [];
  const unknown: string[] = [];
  for (const part of parts) {
    if (isScope(part)) {
      if (!scopes.includes(part)) scopes.push(part);
    } else {
      unknown.push(part);
    }
  }
  return { scopes, unknown };
}

export function formatScope(scopes: readonly Scope[]): string {
  return scopes.join(" ");
}

/* One origin for share links and OAuth alike (lib/web/urls.ts). */
export { absoluteUrl, baseUrl } from "../web/urls";

/** The MCP endpoint, which is also the OAuth resource (RFC 8707) callers bind to. */
export const MCP_PATH = "/mcp";

export const AUTHORIZATION_CODE_TTL_SECONDS = 5 * 60;

/** Short, because these tokens carry delete authority (MCP.md § Implementation notes). */
export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

export const REFRESH_TOKEN_TTL_SECONDS = 90 * 24 * 60 * 60;

// ─── redirect URIs ───────────────────────────────────────────────────────────

/*
 * Allowlisted at registration time, not only at authorize time. A
 * registration asking for an arbitrary URI is refused outright rather than
 * stored and refused later — the row never exists, so the endpoint stays a poor
 * DoS primitive and the table stays readable.
 */
/*
 * Both hosts, because claude.com serves the same product and the callback moved
 * with it. Which one a connector uses is not ours to choose, and a mismatch is
 * the failure that reports itself as "couldn't register" with nothing naming the
 * expected value.
 *
 * Pinned exactly — no subdomains, no suffix matching. `claude.ai.evil.example`
 * and `notclaude.ai` are different hosts and are refused as such.
 */
const CLAUDE_HOSTS = new Set(["claude.ai", "claude.com"]);

/*
 * The callback paths, anchored at both ends.
 *
 * The second one is why this is a pattern rather than a list of literals: an
 * organization-scoped connector carries the organization id in the path, so
 * there is no fixed string to enumerate. Everything that makes an allowlist
 * worth having is still here — the scheme is https, the host is one of exactly
 * two, the path is anchored, and the only free part is one path segment that
 * cannot contain a slash. This is not prefix matching, which is the thing that
 * turns a redirect allowlist into an open redirect.
 */
const CLAUDE_CALLBACK_PATHS = [
  /^\/api\/mcp\/auth_callback$/,
  /^\/api\/organizations\/[A-Za-z0-9_-]+\/mcp\/auth_callback$/,
];

/**
 * Loopback, for local MCP clients — the Inspector and anything run from a
 * terminal — which pick an ephemeral port and cannot register a fixed one
 * (RFC 8252 §7.3).
 *
 * `localhost` is accepted alongside the IP literals even though RFC 8252 names
 * only the literals, because local clients hard-code the name and refusing it
 * means they cannot connect at all. The exposure it buys is narrow: a loopback
 * redirect hands the code to whatever answers on the same machine as the
 * browser, and PKCE still stands between that and a usable token.
 */
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "[::1]", "localhost"]);

export function redirectUriAllowed(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  // No fragment, ever — RFC 6749 §3.1.2 forbids it on a redirect URI. And no
  // query: nothing here issues one, so its presence means the URI is not the
  // one that was registered.
  if (url.hash || url.search) return false;

  if (url.protocol === "https:" && CLAUDE_HOSTS.has(url.hostname)) {
    return CLAUDE_CALLBACK_PATHS.some((pattern) => pattern.test(url.pathname));
  }

  if (url.protocol === "http:") return LOOPBACK_HOSTS.has(url.hostname);

  return false;
}

/** For the error message, so a refusal names what would have been accepted. */
export function allowedRedirectUriDescription(): string {
  return (
    "an https callback on claude.ai or claude.com at /api/mcp/auth_callback or " +
    "/api/organizations/<id>/mcp/auth_callback, or an http loopback address"
  );
}
