"use client";

import { useState } from "react";
import { StoreBadge } from "@/components/StoreBadge";
import { Button } from "@/components/ui/Button";
import { Select, TextInput } from "@/components/ui/Field";
import { Icon } from "@/components/ui/icons";
import {
  HOW,
  HOW_LABEL,
  knownRetailer,
  RETAILERS,
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
    [...(initial ?? []), BLANK].map((s, key) => ({ ...s, key })),
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
      <datalist id="retailers">
        {RETAILERS.map((r) => (
          <option key={r.key} value={r.name} />
        ))}
      </datalist>
      {rows.map((r, i) => (
        <div
          key={r.key}
          className="flex flex-col gap-2 rounded-card border border-line bg-card p-3"
        >
          <div className="flex items-center gap-2">
            <StoreBadge store={r} />
            <TextInput
              name="storeRetailer"
              list="retailers"
              value={r.retailer}
              onChange={(e) => set(r.key, { retailer: e.target.value })}
              // Named from the link when it's a store the app knows.
              placeholder={
                knownRetailer({ retailer: "", url: r.url })?.name ??
                "Store name"
              }
              aria-label={`Store ${i + 1}`}
              className="min-w-0 flex-1"
            />
            <Button
              variant="ghost"
              className="w-11 shrink-0 px-0"
              aria-label={`Remove store ${i + 1}`}
              onClick={() => remove(r.key)}
            >
              <Icon name="close" className="h-4 w-4" />
            </Button>
          </div>
          <TextInput
            name="storeUrl"
            type="url"
            inputMode="url"
            value={r.url}
            onChange={(e) => set(r.key, { url: e.target.value })}
            placeholder="Link to the product (optional)"
            aria-label={`Store ${i + 1} link`}
          />
          <Select
            name="storeHow"
            value={r.how}
            onChange={(e) => set(r.key, { how: e.target.value as How })}
            aria-label={`Store ${i + 1}: how it’s bought`}
          >
            {HOW.map((h) => (
              <option key={h} value={h}>
                {HOW_LABEL[h]}
              </option>
            ))}
          </Select>
        </div>
      ))}
      <Button
        className="self-start"
        onClick={() => setRows((all) => [...all, blank(all)])}
      >
        <Icon name="plus" className="h-4 w-4" />
        Add Store
      </Button>
    </fieldset>
  );
}
