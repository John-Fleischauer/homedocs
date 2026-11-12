/*
 * The OIDC protocol plumbing.
 *
 * Deliberately thin. Which account a claim set signs in as — the part with the
 * security decisions in it — is `resolveOidcAccount` in `oidc-accounts.ts`, a
 * plain function tested without a provider. This file discovers the issuer,
 * builds the authorization URL and exchanges a code.
 *
 * `openid-client` rather than a hand-rolled flow: verifying an ID token means
 * fetching JWKS, following key rotation, and checking the signature, issuer,
 * audience and nonce — each a place to be subtly wrong in a way that still
 * appears to work. PKCE (S256), `state` and `nonce` are all generated here and
 * all checked by `authorizationCodeGrant`.
 *
 * Server-only: never import this from a client component.
 */

import * as client from 'openid-client'
import { processMap } from '../process-state'
import { absoluteUrl } from '../web/urls'
import { passwordSignInAllowed, readOidcConfig, type OidcConfig } from './oidc-config'

/** The callback path. `<PUBLIC_BASE_URL>/login/oidc/callback` is what gets registered. */
export const OIDC_CALLBACK_PATH = '/login/oidc/callback'

export type OidcClaims = {
  /** The token's `iss`, which is what an identity is stored against. */
  issuer: string
  subject: string
  email?: string
  emailVerified: boolean
  name?: string
  preferredUsername?: string
}

/** What the callback must be checked against, carried in the flow cookie. */
export type OidcFlow = { state: string; codeVerifier: string; nonce: string }

export type OidcProvider = {
  config: Extract<OidcConfig, { enabled: true }>
  begin(): Promise<OidcFlow & { authorizationUrl: string }>
  /** Throws on anything that fails to verify. */
  complete(callbackSearch: string, flow: OidcFlow): Promise<OidcClaims>
}

/*
 * Discovery runs on first use rather than at import — `next build` evaluates
 * modules with no network worth having — and its answer is kept for the life of
 * the process. A failure is kept too, for a minute: the login page asks on every
 * render, and an issuer that is down should cost one slow page a minute rather
 * than a timeout on every visit. It is logged every time it is retried, because
 * "the sign-in button disappeared" has to be answerable from the log.
 *
 * On `globalThis` through processMap, because the login page, the start route
 * and the callback route are three layers and would otherwise discover three
 * times and disagree about whether it worked. What is shared is the provider's
 * *metadata*, a plain object, and not openid-client's `Configuration`: each
 * layer has its own copy of the library, and a `Configuration` built by one is
 * refused by the other's `instanceof` check — which is how this was found.
 */
const RETRY_AFTER_FAILURE_MS = 60_000
const DISCOVERY_TIMEOUT_SECONDS = 5

type Discovered = { result: Promise<client.ServerMetadata | null> }
const discoveries = processMap<Discovered>('oidc-discovery')

function discover(config: Extract<OidcConfig, { enabled: true }>) {
  const key = `${config.issuer}\n${config.clientId}`
  const cached = discoveries.get(key)
  if (cached) return cached

  const entry: Discovered = {
    result: client
      .discovery(new URL(config.issuer), config.clientId, config.clientSecret, undefined, {
        timeout: DISCOVERY_TIMEOUT_SECONDS,
      })
      .then((configuration) => configuration.serverMetadata())
      .catch((error: unknown) => {
        console.error(
          `[oidc] discovery of ${config.issuer} failed, so single sign-on is off and ` +
            `password sign-in stays available until it succeeds: ${
              error instanceof Error ? error.message : String(error)
            }`,
        )
        setTimeout(() => {
          if (discoveries.get(key) === entry) discoveries.delete(key)
        }, RETRY_AFTER_FAILURE_MS).unref?.()
        return null
      }),
  }
  discoveries.set(key, entry)
  return entry
}

/*
 * This layer's `Configuration` for the shared metadata. Module scope on purpose:
 * it is derived from what processMap holds, so a copy per layer is the point,
 * and keeping it lets the library reuse the JWKS it fetched across sign-ins.
 */
const configurations = new WeakMap<client.ServerMetadata, client.Configuration>()

function configurationFor(
  metadata: client.ServerMetadata,
  config: Extract<OidcConfig, { enabled: true }>,
): client.Configuration {
  let configuration = configurations.get(metadata)
  if (!configuration) {
    configuration = new client.Configuration(metadata, config.clientId, config.clientSecret)
    configuration.timeout = DISCOVERY_TIMEOUT_SECONDS * 2
    configurations.set(metadata, configuration)
  }
  return configuration
}

/*
 * A partial configuration stops the server at boot (instrumentation.ts). If one
 * is somehow live anyway, sign-on is off and the password form stays: a login
 * page that throws is a lockout.
 */
function configOrOff(): OidcConfig {
  try {
    return readOidcConfig()
  } catch (error) {
    console.error(`[oidc] ${error instanceof Error ? error.message : String(error)}`)
    return { enabled: false }
  }
}

/**
 * Called once from instrumentation.ts, after lib/env.ts has refused a partial
 * configuration with the variables named. A complete one is discovered now, so
 * an unreachable issuer is in the log at boot rather than at the first visit to
 * the login page — not awaited, since it is no reason to delay serving.
 */
export function checkOidcAtBoot(): void {
  const config = configOrOff()
  if (config.enabled) void discover(config).result
}

export type SignInOptions = {
  /** Set when the sign-on button is offered. */
  sso: { name: string } | null
  /** Whether the password form is offered — and accepted, in the action. */
  password: boolean
}

/** What the login page offers, and what the login action accepts. */
export async function signInOptions(): Promise<SignInOptions> {
  const config = configOrOff()
  if (!config.enabled) return { sso: null, password: true }

  const usable = (await discover(config).result) !== null
  return {
    sso: usable ? { name: config.displayName } : null,
    password: passwordSignInAllowed(config, usable),
  }
}

/**
 * For the Family page: whether a pre-made account links on first sign-on only
 * when the provider says the address is verified (see `oidc-accounts.ts`).
 */
export function ssoLinkNeedsVerifiedEmail(): boolean {
  const config = configOrOff()
  return config.enabled && !config.trustEmail
}

/**
 * A driver for the configured issuer, or null when single sign-on is off or the
 * issuer could not be discovered.
 */
export async function oidcProvider(): Promise<OidcProvider | null> {
  const config = configOrOff()
  if (!config.enabled) return null

  const metadata = await discover(config).result
  if (!metadata) return null
  const discovered = configurationFor(metadata, config)

  return {
    config,

    async begin() {
      const codeVerifier = client.randomPKCECodeVerifier()
      const state = client.randomState()
      const nonce = client.randomNonce()

      const authorizationUrl = client.buildAuthorizationUrl(discovered, {
        redirect_uri: absoluteUrl(OIDC_CALLBACK_PATH),
        scope: 'openid profile email',
        code_challenge: await client.calculatePKCECodeChallenge(codeVerifier),
        code_challenge_method: 'S256',
        state,
        nonce,
      })

      return { authorizationUrl: authorizationUrl.href, state, codeVerifier, nonce }
    },

    async complete(callbackSearch, flow) {
      /* Rebuilt on the public origin rather than taken from the request: behind
         the proxy the request URL is the container's own address, and the
         library derives the `redirect_uri` it sends to the token endpoint from
         this URL, which has to equal the one the flow started with. */
      const currentUrl = new URL(absoluteUrl(OIDC_CALLBACK_PATH))
      currentUrl.search = callbackSearch

      const tokens = await client.authorizationCodeGrant(discovered, currentUrl, {
        pkceCodeVerifier: flow.codeVerifier,
        expectedState: flow.state,
        expectedNonce: flow.nonce,
        idTokenExpected: true,
      })

      const claims = tokens.claims()
      if (!claims?.sub) throw new Error('The identity provider returned no subject.')

      const text = (value: unknown) =>
        typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined

      return {
        issuer: claims.iss,
        subject: claims.sub,
        email: text(claims.email),
        /* Some providers send the string "true". Anything else is unverified —
           the safe direction, since unverified is what linking refuses on. */
        emailVerified: claims.email_verified === true || claims.email_verified === 'true',
        name: text(claims.name),
        preferredUsername: text(claims.preferred_username),
      }
    },
  }
}
