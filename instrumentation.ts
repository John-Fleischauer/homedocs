/*
 * What runs once per server process, before any request is served: the
 * environment check, single sign-on discovery, and the background jobs.
 */

export async function register() {
  /* The Edge runtime evaluates this file too and can load none of what follows. */
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  try {
    /* Imported inside the function: `next build` evaluates this file, and a
       top-level import would pull the database driver into a build with no
       DATABASE_URL. */
    const { env } = await import('./lib/env')
    /* Every required variable, INTEGRATIONS_KEY apart from SESSION_SECRET, and
       half-set single sign-on: refused here with each variable named. */
    env()

    /* Starts discovery, so an unreachable issuer is in the log at boot. */
    const { checkOidcAtBoot } = await import('./lib/auth/oidc')
    checkOidcAtBoot()

    const { startJobs } = await import('./lib/jobs')
    if (startJobs()) console.log('[jobs] scheduler started')
  } catch (err) {
    /* Next only logs a throw from register() and keeps the process alive without
       serving, so the container would look up until the healthcheck gave out.
       Exit instead, with the reason in the log. */
    const refusal = err instanceof Error && err.message.startsWith('Invalid environment')
    /* The env refusal is the whole message; anything else keeps its stack. */
    console.error(refusal ? err.message : err)
    process.exit(1)
  }
}
