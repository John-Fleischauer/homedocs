"use client";

import { useState } from "react";
import { StoreBadge } from "@/components/StoreBadge";
import { StorePicker } from "@/components/StorePicker";
import { Button } from "@/components/ui/Button";
import { TextInput } from "@/components/ui/Field";
import { Icon } from "@/components/ui/icons";
import {
  HOW,
  HOW_BUTTON,
  MAX_STORES,
  knownRetailer,
  type How,
  type StoreLink,
} from "@/lib/parts/retailers";

type Row = { key: number; retailer: string; url: string; how: How };

const BLANK = { retailer: "", url: "", how: "either" as How };

/*
 * The stores a part is bought at, one row each. Sent as `storeRetailer`,
 * `storeUrl` and `storeHow` in step (each() in actions.ts); a blank row is
 * dropped by the domain, so the spare row on the end is harmless.
 */
export function StoreFields({ initial }: { initial?: StoreLink[] }) {
  const [rows, setRows] = useState<Row[]>(() =>
    [...(initial ?? []), BLANK]
      .slice(0, MAX_STORES)
      .map((s, key) => ({ ...s, key })),
  );
  /* A new row's key: past every key so far, so React never reuses a removed row's inputs. */
  const blank = (all: Row[]): Row => ({
    ...BLANK,
    key: Math.max(-1, ...all.map((r) => r.key)) + 1,
  });
  const set = (key: number, patch: Partial<Row>) =>
    setRows((all) => all.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const remove = (key: number) =>
    setRows((all) => {
      const rest = all.filter((r) => r.key !== key);
      return rest.length ? rest : [blank(all)];
    });

  return (
    <fieldset id="stores" className="flex scroll-mt-20 flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-ink-2">
        Where to Buy
      </legend>
      {rows.map((r, i) => (
        <div
          key={r.key}
          className="flex flex-col gap-2 rounded-card border border-line bg-card p-3"
        >
          <div className="flex items-center gap-2">
            <StoreBadge store={r} />
            <StorePicker
              name="storeRetailer"
              value={r.retailer}
              onChange={(retailer) => set(r.key, { retailer })}
              // Named from the link when it's a store the app knows.
              placeholder={
                knownRetailer({ retailer: "", url: r.url })?.name ??
                "Store Name"
              }
              aria-label={`Store ${i + 1}`}
            />
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-sunk hover:text-danger focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              aria-label={`Remove Store ${i + 1}`}
              title="Remove"
              onClick={() => remove(r.key)}
            >
              <Icon name="trash" className="h-[18px] w-[18px]" />
            </button>
          </div>
          <TextInput
            name="storeUrl"
            type="url"
            inputMode="url"
            value={r.url}
            onChange={(e) => set(r.key, { url: e.target.value })}
            placeholder="Product Link"
            aria-label={`Store ${i + 1} link`}
          />
          {/* One tap, not a dropdown; the hidden field keeps it in step with the row's other two. */}
          <input type="hidden" name="storeHow" value={r.how} />
          <div
            role="radiogroup"
            aria-label={`Store ${i + 1}: Where It’s Bought`}
            className="flex gap-2"
          >
            {HOW.map((h) => (
              <button
                key={h}
                type="button"
                role="radio"
                aria-checked={r.how === h}
                onClick={() => set(r.key, { how: h })}
                className={`flex min-h-11 min-w-0 flex-1 items-center justify-center rounded-control border px-2 text-center text-[15px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  r.how === h
                    ? "border-accent bg-accent-soft font-medium text-accent"
                    : "border-line bg-card text-ink"
                }`}
              >
                {HOW_BUTTON[h]}
              </button>
            ))}
          </div>
        </div>
      ))}
      {rows.length < MAX_STORES ? (
        <Button
          className="self-start"
          onClick={() => setRows((all) => [...all, blank(all)])}
        >
          <Icon name="plus" className="h-4 w-4" />
          Add Store
        </Button>
      ) : null}
    </fieldset>
  );
}
