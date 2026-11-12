/*
 * What runs once per server process, before any request is served: the
 * environment check, single sign-on discovery, and the background jobs.
 * Node runtime only (imported from instrumentation.ts).
 */

export async function boot(): Promise<void> {
  try {
    const { checkEnv } = await import('./env')
    /* Every required variable, INTEGRATIONS_KEY apart from SESSION_SECRET, and
       half-set single sign-on: refused here with each variable named. */
    checkEnv()

    /* Starts discovery, so an unreachable issuer is in the log at boot. */
    const { checkOidcAtBoot } = await import('./auth/oidc')
    checkOidcAtBoot()

    const { startJobs } = await import('./jobs')
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
