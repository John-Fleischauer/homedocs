/*
 * The sign-on round trip's own state: what the callback is checked against,
 * and where to go afterwards.
 *
 * In a cookie rather than a table because it lives for one redirect and belongs
 * to one browser. httpOnly, Secure in production, SameSite=Lax — Lax is what
 * lets it ride the provider's top-level redirect back, and Strict would drop it
 * there. Scoped to the two sign-on routes and gone in ten minutes.
 *
 * Not signed, deliberately: every value in it is either checked against the
 * provider (state, verifier, nonce) or re-validated on the way out (`next`,
 * through safeNext). Somebody editing their own cookie can only break their own
 * sign-in.
 */

import { safeNext } from "./redirects";
import { cookieOptions } from "./sessions";
import type { OidcFlow } from "./oidc";

export const OIDC_FLOW_COOKIE = "homedocs_oidc";

export const oidcFlowCookieOptions = {
  ...cookieOptions,
  path: "/login/oidc",
  maxAge: 10 * 60,
};

export type StoredFlow = OidcFlow & { next: string };

export function encodeFlow(flow: StoredFlow): string {
  return Buffer.from(JSON.stringify(flow)).toString("base64url");
}

export function decodeFlow(raw: string | undefined): StoredFlow | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(
      Buffer.from(raw, "base64url").toString("utf8"),
    );
    if (typeof value !== "object" || value === null) return null;
    const { state, codeVerifier, nonce, next } = value as Record<
      string,
      unknown
    >;
    if (
      typeof state !== "string" ||
      typeof codeVerifier !== "string" ||
      typeof nonce !== "string"
    ) {
      return null;
    }
    return {
      state,
      codeVerifier,
      nonce,
      // The cookie carried it; that is not what makes it trusted.
      next: safeNext(typeof next === "string" ? next : null),
    };
  } catch {
    return null;
  }
}

/** Refusal codes the login page knows how to say. Never free text in a URL. */
export const SIGN_IN_ERRORS = [
  "sso-unavailable",
  "sso-expired",
  "sso-failed",
  "removed",
  "other-identity",
  "unverified-email",
  "no-email",
  "awaiting-placement",
  "unverified-new-email",
] as const;

export type SignInError = (typeof SIGN_IN_ERRORS)[number];

export function isSignInError(value: string | undefined): value is SignInError {
  return (SIGN_IN_ERRORS as readonly string[]).includes(value ?? "");
}

/** The login page's message for a code, naming the provider where it helps. */
export function signInErrorMessage(
  code: SignInError,
  provider: string,
): string {
  switch (code) {
    case "sso-unavailable":
      return `${provider} is unavailable.`;
    case "sso-expired":
      return "Sign-in timed out. Try again.";
    case "sso-failed":
      return "Sign-in did not complete. Try again.";
    case "removed":
      return "This account has been removed.";
    case "other-identity":
      return `That email address is linked to a different ${provider} account.`;
    case "unverified-email":
      return `An account uses that email address, and ${provider} has not verified it.`;
    case "no-email":
      return `${provider} did not share an email address.`;
    case "unverified-new-email":
      return `${provider} has not verified your email address, so you can’t be added from here. Ask a family admin to add you.`;
    case "awaiting-placement":
      return "Your account is waiting for an admin to let you in. Ask them to look at Family.";
  }
}
