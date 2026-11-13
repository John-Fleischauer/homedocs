"use client";

import Link from "next/link";
import {
  tradeKey,
  tradeLabeler,
  type TradeGroup,
} from "@/lib/contacts/trade-labels";
import { TextInput } from "./ui/Field";

/*
 * Tick what a contact does (or who to call for a system) from the family's
 * list, or type something new, which joins the list. Values are trade keys.
 */
export function TradeChips({
  legend,
  groups,
  chosen,
  onChange,
}: {
  legend: string;
  groups: TradeGroup[];
  chosen: string[];
  onChange: (next: string[]) => void;
}) {
  const label = tradeLabeler(groups);
  const listed = new Set(groups.flatMap((g) => g.trades.map(tradeKey)));
  // Ones this record has that are no longer on the list, so they can still be unticked.
  const off = chosen.filter((k) => !listed.has(k));
  const shown = [
    ...groups.map((g) => ({ label: g.label, keys: g.trades.map(tradeKey) })),
    ...(off.length ? [{ label: "Not on List", keys: off }] : []),
  ];
  return (
    <fieldset>
      <div className="mb-1.5 flex items-center justify-between">
        <legend className="text-sm font-medium text-ink-2">{legend}</legend>
        <Link
          href="/contacts/trades"
          className="flex min-h-10 items-center px-1 text-sm text-accent"
        >
          Edit List
        </Link>
      </div>
      <div className="flex flex-col gap-3">
        {shown.map((g) => (
          <div key={g.label}>
            {shown.length > 1 ? (
              <p className="mb-1.5 text-xs font-medium uppercase tracking-wide text-ink-3">
                {g.label}
              </p>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {g.keys.map((k) => {
                const on = chosen.includes(k);
                return (
                  <label
                    key={k}
                    className={`inline-flex min-h-11 cursor-pointer items-center rounded-full border px-3 text-sm ${
                      on
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-card text-ink-2"
                    }`}
                  >
                    <input
                      type="checkbox"
                      name="trades"
                      value={k}
                      checked={on}
                      onChange={(e) =>
                        onChange(
                          e.target.checked
                            ? [...chosen, k]
                            : chosen.filter((x) => x !== k),
                        )
                      }
                      className="sr-only"
                    />
                    {label(k)}
                  </label>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <TextInput
        name="customTrades"
        className="mt-2"
        placeholder="Other, e.g. Chimney sweep"
        aria-label="Other Trade"
      />
    </fieldset>
  );
}
