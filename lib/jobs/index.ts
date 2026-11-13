/*
 * The in-process scheduler: a few housekeeping jobs on timers. One container is
 * the whole deployment, so there is no queue to coordinate. WORKER=off keeps a
 * container (a debugging copy, say) from running them.
 */

import { sql } from 'drizzle-orm'
import { db } from '../db'
import { processMap } from '../process-state'

type Job = { name: string; everyMs: number; run: () => Promise<void> }

const started = processMap<boolean>('jobs')

export function startJobs(): boolean {
  if (process.env.WORKER === 'off' || started.get('started')) return false
  started.set('started', true)

  void import('./all').then(({ jobs }) => {
    for (const job of jobs) {
      const tick = () =>
        withJobLock(job.name, job.run).catch((err) =>
          console.error(`[jobs] ${job.name} failed: ${err instanceof Error ? err.message : err}`),
        )
      // A first run shortly after boot, then on the interval.
      setTimeout(tick, 30_000).unref?.()
      setInterval(tick, job.everyMs).unref?.()
    }
  })
  return true
}

/**
 * Run a job only if no other process is running it. One container is the
 * deployment today, but a second one (a debugging copy started without
 * WORKER=off, or an overlap during a redeploy) would otherwise run the same
 * housekeeping twice at once. A transaction-scoped advisory lock: released
 * when the run ends, whatever happened, and skipped (not queued) when taken.
 */
export async function withJobLock(name: string, run: () => Promise<void>): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx.execute<{ locked: boolean }>(sql`select pg_try_advisory_xact_lock(hashtext(${`homedocs:job:${name}`})) as locked`)
    if (!row?.locked) return false
    await run()
    return true
  })
}

export type { Job }
