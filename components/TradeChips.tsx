"use client";

import Link from "next/link";
import { useState } from "react";
import {
  tradeKey,
  tradeLabeler,
  type TradeGroup,
} from "@/lib/contacts/trade-labels";
import { TextInput } from "./ui/Field";
import { Icon } from "./ui/icons";

/*
 * Tick what a contact does (or who to call for a system) from the family's
 * list, or type something new, which joins the list. Values are trade keys.
 *
 * Twenty-odd chips push the rest of a form off a phone screen, so each group
 * folds to one row naming what is ticked in it. A group opens with the page
 * when it holds a ticked trade, or is the first and nothing is ticked yet. A
 * folded group's checkboxes are still in the form, so they still post.
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
  // Decided once, as the form opens: ticking a chip never folds or unfolds a group.
  const [openAtFirst] = useState(() =>
    shown.map(
      (g, i) =>
        g.keys.some((k) => chosen.includes(k)) ||
        (i === 0 && chosen.length === 0),
    ),
  );
  const chips = (keys: string[]) => (
    <div className="flex flex-wrap gap-2">
      {keys.map((k) => {
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
  );
  return (
    <fieldset>
      <div className="mb-1.5 flex items-center justify-between">
        <legend className="text-sm font-medium text-ink-2">{legend}</legend>
        <Link
          href="/contacts/trades"
          className="flex min-h-11 items-center px-1 text-sm text-accent"
        >
          Edit List
        </Link>
      </div>
      {shown.length > 1 ? (
        <div className="divide-y divide-line rounded-card border border-line bg-card">
          {shown.map((g, i) => {
            const ticked = g.keys.filter((k) => chosen.includes(k)).map(label);
            return (
              <details key={g.label} open={openAtFirst[i]} className="group">
                <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-ink">
                      {g.label}
                    </span>
                    {ticked.length ? (
                      <span className="block wrap-anywhere text-sm text-accent group-open:hidden">
                        {ticked.join(", ")}
                      </span>
                    ) : null}
                  </span>
                  <Icon
                    name="chevron"
                    className="h-4 w-4 shrink-0 text-ink-3 group-open:rotate-90"
                  />
                </summary>
                <div className="px-3 pb-3">{chips(g.keys)}</div>
              </details>
            );
          })}
        </div>
      ) : (
        chips(shown[0]?.keys ?? [])
      )}
      <TextInput
        name="customTrades"
        className="mt-2"
        placeholder="Add another trade"
        aria-label="Other Trade"
      />
    </fieldset>
  );
}
