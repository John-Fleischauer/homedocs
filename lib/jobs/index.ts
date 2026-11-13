/*
 * The in-process scheduler: a few housekeeping jobs on timers. One container is
 * the whole deployment, so there is no queue to coordinate. WORKER=off keeps a
 * container (a debugging copy, say) from running them.
 */

import { sqlClient } from "../db";
import { processMap } from "../process-state";

type Job = { name: string; everyMs: number; run: () => Promise<void> };

const started = processMap<boolean>("jobs");

export function startJobs(): boolean {
  if (process.env.WORKER === "off" || started.get("started")) return false;
  started.set("started", true);

  void import("./all").then(({ jobs }) => {
    for (const job of jobs) {
      const tick = () =>
        withJobLock(job.name, job.run).catch((err) =>
          console.error(
            `[jobs] ${job.name} failed: ${err instanceof Error ? err.message : err}`,
          ),
        );
      // A first run shortly after boot, then on the interval.
      setTimeout(tick, 30_000).unref?.();
      setInterval(tick, job.everyMs).unref?.();
    }
  });
  return true;
}

/**
 * Run a job only if no other process is running it. One container is the
 * deployment today, but a second one (a debugging copy started without
 * WORKER=off, or an overlap during a redeploy) would otherwise run the same
 * housekeeping twice at once. A session-level advisory lock on one reserved
 * connection: no transaction is held open while the job runs, the lock is
 * released when it ends whatever happened, and a run that finds it taken is
 * skipped, not queued.
 */
export async function withJobLock(
  name: string,
  run: () => Promise<void>,
): Promise<boolean> {
  const conn = await sqlClient().reserve();
  const key = `homedocs:job:${name}`;
  try {
    const [row] = await conn<
      { locked: boolean }[]
    >`select pg_try_advisory_lock(hashtext(${key})) as locked`;
    if (!row?.locked) return false;
    try {
      await run();
    } finally {
      await conn`select pg_advisory_unlock(hashtext(${key}))`;
    }
    return true;
  } finally {
    conn.release();
  }
}

export type { Job };
