/*
 * Single sign-on settings, read once from the environment.
 *
 * Off unless the deployment turns it on, and "on" means all three of issuer,
 * client id and secret. Two of three is refused outright rather than read as
 * off: somebody who set two of them meant to turn it on, and a deployment that
 * silently comes up without the sign-in button its owner configured is a support
 * call with nothing in the log to answer it.
 *
 * Takes the environment as an argument for the reason `conditionTracked` does —
 * a test cannot construct Next's `process.env`, and how strings are read is the
 * only thing here worth asserting.
 */

/** What counts as "on". Lenient, because `=1` and `=yes` are both what people type. */
const TRUE = new Set(["1", "true", "yes", "on"]);

function flag(raw: string | undefined): boolean {
  return TRUE.has((raw ?? "").trim().toLowerCase());
}

export type OidcConfig =
  | { enabled: false }
  | {
      enabled: true;
      issuer: string;
      clientId: string;
      clientSecret: string;
      /** The provider's name on the sign-in button. */
      displayName: string;
      /** Hide and refuse password sign-in — but only while SSO actually works. */
      only: boolean;
      /** Accept an unverified `email` claim for linking. For a self-hosted issuer. */
      trustEmail: boolean;
      /**
       * The role the Family page suggests when an admin lets in an account a
       * sign-on made (it is created with no access, awaiting placement).
       */
      defaultRole: "admin" | "member" | "viewer";
    };

type Env = Record<string, string | undefined>;

export function readOidcConfig(env: Env = process.env): OidcConfig {
  const issuer = env.OIDC_ISSUER?.trim() || undefined;
  const clientId = env.OIDC_CLIENT_ID?.trim() || undefined;
  const clientSecret = env.OIDC_CLIENT_SECRET?.trim() || undefined;

  const present = [issuer, clientId, clientSecret].filter(Boolean).length;
  if (present === 0) return { enabled: false };
  if (present < 3) {
    const missing = [
      issuer ? null : "OIDC_ISSUER",
      clientId ? null : "OIDC_CLIENT_ID",
      clientSecret ? null : "OIDC_CLIENT_SECRET",
    ].filter(Boolean);
    throw new Error(
      `Single sign-on is partly configured: set ${missing.join(", ")} as well, ` +
        "or unset all three of OIDC_ISSUER, OIDC_CLIENT_ID and OIDC_CLIENT_SECRET.",
    );
  }

  return {
    enabled: true,
    issuer: issuer!,
    clientId: clientId!,
    clientSecret: clientSecret!,
    displayName: env.OIDC_DISPLAY_NAME?.trim() || "Pocket ID",
    only: flag(env.OIDC_ONLY),
    trustEmail: flag(env.OIDC_TRUST_EMAIL),
    /* Viewer unless told otherwise: a new face should be able to look before
       they can change anything. Only a suggestion now; the admin chooses. */
    defaultRole: readRole(env.OIDC_DEFAULT_ROLE),
  };
}

/**
 * Whether the password form is offered and accepted.
 *
 * `OIDC_ONLY` takes it away only while single sign-on is *usable* — configured
 * and discovered. An issuer that is down, or a variable that was unset, must
 * never leave an instance nobody can sign in to; the password path coming back
 * is the degraded mode, and the discovery failure is logged loudly instead.
 */
export function passwordSignInAllowed(
  config: OidcConfig,
  oidcUsable: boolean,
): boolean {
  if (!config.enabled || !config.only) return true;
  return !oidcUsable;
}

function readRole(raw: string | undefined): "admin" | "member" | "viewer" {
  const value = (raw ?? "").trim().toLowerCase();
  if (value === "" || value === "viewer") return "viewer";
  if (value === "member") return "member";
  throw new Error(`OIDC_DEFAULT_ROLE must be viewer or member, not "${raw}".`);
}
