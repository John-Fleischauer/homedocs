/*
 * The environment, checked once at boot.
 *
 * `instrumentation.ts` calls `env()` before anything else runs, so a missing or
 * malformed setting stops the server with a message naming each variable,
 * instead of an app that boots, reports healthy, and fails at the first sign-in,
 * share link or OAuth discovery. Messages name the variable and the rule, never
 * the value.
 *
 * The readers elsewhere (`lib/auth/tokens.ts`, `lib/crypto/sealed.ts`,
 * `lib/web/urls.ts`, `lib/auth/oidc-config.ts`, …) still read `process.env` when
 * used: tests change it per case, and a memoised copy would hide that. This file
 * is where the rules live.
 */

import { z } from 'zod'

/** Shared with the readers that check their secret again at first use. */
export const MIN_SECRET_LENGTH = 32

/* What `oidc-config.ts`'s `flag()` reads with a clear meaning (it trims and
   lowercases first). Anything else (`enabled`, a typo) would quietly read as
   false there, so it is refused here. */
const flag = (name: string) =>
  z
    .string()
    .trim()
    .regex(/^(true|false|1|0|yes|no|on|off)$/i, `${name} must be one of true, false, 1, 0, yes, no, on, off`)
    .optional()

const secret = (name: string) =>
  z
    .string({ error: `${name} must be set` })
    .min(MIN_SECRET_LENGTH, `${name} must be at least ${MIN_SECRET_LENGTH} characters`)

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '[::1]']

/* An https origin (http only for a local run), with nothing after it but an
   optional slash: share links, OAuth discovery and the sign-on callback are all
   built by appending a path to it. */
function isOrigin(raw: string): boolean {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return false
  }
  const scheme =
    url.protocol === 'https:' || (url.protocol === 'http:' && LOCAL_HOSTS.includes(url.hostname))
  return scheme && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password
}

function isTimeZone(raw: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: raw })
    return true
  } catch {
    return false
  }
}

const schema = z.object({
  NODE_ENV: z.string().optional(),
  DATABASE_URL: z.url({
    protocol: /^postgres(ql)?$/,
    error: 'DATABASE_URL must be set to a postgres:// URL',
  }),
  /* Beside a password-less DATABASE_URL in production (compose); postgres-js
     and pg_dump read it themselves. A local URL may carry the password instead. */
  PGPASSWORD: z.string().optional(),
  /* Tokens (sessions, invites, share links, OAuth) are stored as HMACs under it. */
  SESSION_SECRET: secret('SESSION_SECRET'),
  /* Encrypts stored codes and integration tokens. Must differ from
     SESSION_SECRET (checked below), so signing everyone out leaves them readable. */
  INTEGRATIONS_KEY: secret('INTEGRATIONS_KEY'),
  PUBLIC_BASE_URL: z
    .string({ error: 'PUBLIC_BASE_URL must be set' })
    .refine(isOrigin, 'PUBLIC_BASE_URL must be an https origin with no path, query or credentials'),
  GIT_REVISION: z.string().default('dev'),
  DATA_DIR: z.string().optional(),
  BACKUP_DIR: z.string().optional(),
  /* How many proxies append to X-Forwarded-For (lib/web/client-ip.ts). The
     reader falls back to 1 on anything it can't read, which would quietly
     misplace "at home"; refused here instead. */
  TRUSTED_PROXY_HOPS: z
    .string()
    .trim()
    .regex(/^[1-9][0-9]*$/, 'TRUSTED_PROXY_HOPS must be a whole number, 1 or more')
    .optional(),
  /* One header the proxy in front always sets, read instead of X-Forwarded-For. */
  CLIENT_IP_HEADER: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9-]+$/, 'CLIENT_IP_HEADER must be a header name, e.g. x-real-ip')
    .optional(),
  OIDC_ISSUER: z.url({ protocol: /^https?$/, error: 'OIDC_ISSUER must be an http(s) URL' }).optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_DISPLAY_NAME: z.string().optional(),
  OIDC_ONLY: flag('OIDC_ONLY'),
  OIDC_TRUST_EMAIL: flag('OIDC_TRUST_EMAIL'),
  /* What `readRole` accepts (trimmed, any case). */
  OIDC_DEFAULT_ROLE: z
    .string()
    .trim()
    .regex(/^(viewer|member)$/i, 'OIDC_DEFAULT_ROLE must be viewer or member')
    .optional(),
  /* The scheduler checks for exactly `off`; any other value runs the jobs. */
  WORKER: z.enum(['on', 'off'], { error: 'WORKER must be on or off' }).optional(),
  TZ: z.string().refine(isTimeZone, 'TZ must be an IANA time zone, e.g. America/New_York').optional(),
})

export type Env = z.infer<typeof schema>

type Problem = { name: string; message: string }

/*
 * Rules across variables. Run on the raw values, not inside the schema, so they
 * are reported together with every other problem instead of only once the rest
 * parses.
 */
function crossChecks(raw: Record<string, string>): Problem[] {
  const problems: Problem[] = []

  /* Single sign-on is off with none set and refused with some: somebody who set
     two of three meant to turn it on (lib/auth/oidc-config.ts). */
  const sso = ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET']
  const missing = sso.filter((name) => raw[name] === undefined)
  if (missing.length > 0 && missing.length < sso.length) {
    for (const name of missing) {
      problems.push({
        name,
        message: `Single sign-on is half configured: set ${name} too, or unset ${sso.join(', ')}`,
      })
    }
  }

  /* Compared, never printed. */
  if (raw.INTEGRATIONS_KEY !== undefined && raw.INTEGRATIONS_KEY === raw.SESSION_SECRET) {
    problems.push({
      name: 'INTEGRATIONS_KEY',
      message: 'INTEGRATIONS_KEY must differ from SESSION_SECRET, so signing everyone out does not destroy stored codes',
    })
  }

  problems.push(...databaseChecks(raw))
  return problems
}

/* Compose passes the password beside a password-less URL. */
function databaseChecks(raw: Record<string, string>): Problem[] {
  if (raw.NODE_ENV !== 'production' || raw.PGPASSWORD !== undefined || !raw.DATABASE_URL) return []
  let hasPassword = true // a URL that doesn't parse is reported on DATABASE_URL
  try {
    hasPassword = new URL(raw.DATABASE_URL).password !== ''
  } catch {}
  return hasPassword
    ? []
    : [{ name: 'PGPASSWORD', message: 'PGPASSWORD must be set when DATABASE_URL carries no password' }]
}

/* Compose passes an unset optional variable (`${VAR:-}`) as an empty string;
   a blank value counts as unset. */
function withoutBlanks(raw: Record<string, string | undefined>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(raw).filter((entry): entry is [string, string] => {
      const value = entry[1]
      return value !== undefined && value.trim() !== ''
    }),
  )
}

function refuse(error: z.ZodError | null, problems: Problem[]): void {
  const lines = error ? [z.prettifyError(error)] : []
  for (const { name, message } of problems) lines.push(`✖ ${message}\n  → at ${name}`)
  if (lines.length > 0) throw new Error(`Invalid environment:\n${lines.join('\n')}`)
}

/**
 * Only what the migrator needs (DATABASE_URL, PGPASSWORD), so a recovery run
 * with just those isn't refused over app settings that don't affect migrations.
 */
export function checkDatabaseEnv(raw: Record<string, string | undefined>): void {
  const present = withoutBlanks(raw)
  const result = schema.pick({ DATABASE_URL: true, PGPASSWORD: true }).safeParse(present)
  refuse(result.success ? null : result.error, databaseChecks(present))
}

/** Parse an environment; throws with every problem, by variable name, never a value. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const present = withoutBlanks(raw)
  const result = schema.safeParse(present)
  refuse(result.success ? null : result.error, crossChecks(present))
  if (!result.success) throw new Error('unreachable') // refuse() threw
  return result.data
}

let parsed: Env | undefined

export function env(): Env {
  return (parsed ??= parseEnv(process.env))
}
