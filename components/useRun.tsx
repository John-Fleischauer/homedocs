"use client";

import { useState, useTransition } from "react";
import type { ActionResult } from "@/lib/web/action";

export type Run = (
  fn: () => Promise<ActionResult | unknown>,
  at?: string,
) => void;

/**
 * Runs a server action from a button. A refusal comes back as `error`, with
 * `at` set to the key the caller passed (a row's id), so it can be shown on the
 * row that was pressed rather than at the end of the list. Never a browser
 * dialog (standards design.md).
 */
export function useRun(): {
  pending: boolean;
  run: Run;
  error: string | null;
  at: string | undefined;
} {
  const [pending, start] = useTransition();
  const [failed, setFailed] = useState<{ error: string; at?: string } | null>(
    null,
  );
  const run: Run = (fn, at) =>
    start(async () => {
      setFailed(null);
      const result = (await fn()) as ActionResult | undefined;
      if (result?.error) setFailed({ error: result.error, at });
    });
  return { pending, run, error: failed?.error ?? null, at: failed?.at };
}

/** A refusal shown beside what was pressed. */
export function InlineError({
  children,
  className = "",
}: {
  children?: string | null;
  className?: string;
}) {
  if (!children) return null;
  return (
    <span role="alert" className={`block text-sm text-danger ${className}`}>
      {children}
    </span>
  );
}
