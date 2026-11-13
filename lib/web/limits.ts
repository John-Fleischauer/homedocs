/*
 * Rate limits, in process. One container is the whole deployment, so a shared
 * store would coordinate one process with itself. Counters reset on restart,
 * which forgives an attacker's budget — acceptable for a family app; the share
 * link PIN has a persistent lockout as well (lib/guide/share-links.ts).
 */

import { processMap } from "../process-state";

type Window = { count: number; resetAt: number };

export type Limiter = {
  take(key: string, now?: number): boolean;
  reset(): void;
};

export function fixedWindow(
  name: string,
  limit: number,
  windowMs: number,
): Limiter {
  const windows = processMap<Window>(`limit:${name}`);
  return {
    take(key, now = Date.now()) {
      const current = windows.get(key);
      if (!current || current.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + windowMs });
        if (windows.size > 5_000) {
          for (const [k, w] of windows) if (w.resetAt <= now) windows.delete(k);
        }
        return true;
      }
      if (current.count >= limit) return false;
      current.count += 1;
      return true;
    },
    reset() {
      windows.clear();
    },
  };
}

/** Ten password attempts per 15 minutes, per address and per account. */
export const loginLimiter = fixedWindow("login", 10, 15 * 60 * 1000);
/** Guide page loads per address — generous for a person, tight for a scraper. */
export const guideLimiter = fixedWindow("guide", 120, 10 * 60 * 1000);
/** PIN attempts per address. The link itself also locks after 10 failures. */
export const pinLimiter = fixedWindow("pin", 5, 10 * 60 * 1000);
