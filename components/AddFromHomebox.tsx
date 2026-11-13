"use client";

import { useState, useTransition } from "react";
import { buttonClass } from "./ui/Button";

/* One tap: a Homebox item becomes a fixture in this place, linked back to it. */
export function AddFromHomebox({
  name,
  add,
}: {
  name: string;
  add: () => Promise<{ error?: string }>;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="flex shrink-0 flex-col items-end">
      <button
        type="button"
        disabled={pending}
        aria-label={`Add ${name} as fixture`}
        className={buttonClass("secondary", "px-3")}
        onClick={() =>
          start(async () => {
            const r = await add();
            setError(r.error ?? null);
          })
        }
      >
        {pending ? "Adding…" : "Add"}
      </button>
      {error ? (
        <span
          role="alert"
          className="mt-1 max-w-40 text-right text-xs text-danger"
        >
          {error}
        </span>
      ) : null}
    </span>
  );
}
