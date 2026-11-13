/*
 * An in-process fixed window.
 *
 * Deliberately not Redis. A single instance is the whole deployment
 * (ARCHITECTURE.md), so a shared store would be infrastructure that exists to
 * coordinate one process with itself — and the thing being protected is a
 * registration endpoint on a personal homelab, not a login form under credential
 * stuffing.
 *
 * The cost of the fixed window is the boundary burst — 2× the limit across two
 * adjacent windows. That is the right trade here, where the limiter exists to
 * keep a table from growing without bound rather than to shape traffic.
 *
 * Counters live in module state, so they reset when the container does. That is
 * fine and worth saying out loud: a restart forgives an attacker's budget, and
 * the cap on total registered clients is the backstop that does not.
 */

import { clientIp } from "../web/client-ip";

type Window = { count: number; resetAt: number };

export type Limiter = {
  /** True when the call is allowed; false when the window is spent. */
  take(key: string, now?: number): boolean;
  reset(): void;
};

export function fixedWindow(limit: number, windowMs: number): Limiter {
  const windows = new Map<string, Window>();

  return {
    take(key, now = Date.now()) {
      const current = windows.get(key);

      if (!current || current.resetAt <= now) {
        windows.set(key, { count: 1, resetAt: now + windowMs });

        /* Sweep on write rather than on a timer: an interval would keep a
           handle alive for the life of the process to tidy a map that is empty
           on all but a handful of deployments. */
        if (windows.size > 1_000) {
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

/** The client address, read the same trusted way everywhere (lib/web/client-ip.ts). */
export function clientAddress(request: Request): string {
  return clientIp(request.headers) ?? "unknown";
}
