/*
 * Rows for the materials list and checklist, and the plain-words lines the
 * "Update series" confirmation shows. Built on the server from getProject /
 * getSeries so the client components only render.
 */

import type { ListDiff, MaterialRow } from "@/lib/projects/materials";
import { formatQty } from "@/lib/web/format";

export type Status = "same" | "changed" | "added" | "one_off";

export type MaterialView = {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  units: string[];
  supplyId: string | null;
  partName: string | null;
  spaceId: string | null;
  spaceName: string | null;
  notes: string;
  oneOff: boolean;
  status?: Status;
  /** "was 8 rolls" */
  was?: string;
  /** What confirming "Update series" on this row does, in plain words. */
  change?: string;
};

export type MissingView = { id: string; label: string; change: string };

export function amountOf(quantity: string | null, unit: string) {
  return formatQty(quantity, unit) || unit;
}

/** "Pine straw (around the stairs)" — the notes tell two lines of the same thing apart. */
export function lineLabel(m: { name: string; notes: string }) {
  return m.notes ? `${m.name} (${m.notes})` : m.name;
}

const FIELD = {
  name: "name",
  supplyId: "part",
  quantity: "amount",
  unit: "amount",
  spaceId: "place",
  notes: "notes",
} as const;

export function materialViews(
  rows: MaterialRow[],
  diff?: ListDiff | null,
  series?: MaterialRow[],
): MaterialView[] {
  const source = new Map((series ?? []).map((s) => [s.id, s]));
  return rows.map((m) => {
    const view: MaterialView = {
      id: m.id,
      name: m.name,
      quantity: m.quantity === null ? "" : String(Number(m.quantity)),
      unit: m.unit,
      units: m.units,
      supplyId: m.supplyId,
      partName: m.partName,
      spaceId: m.spaceId,
      spaceName: m.spaceName,
      notes: m.notes,
      oneOff: m.oneOff,
    };
    const r = diff?.rows[m.id];
    if (!r) return view;
    view.status = r.status;
    const here = [m.name, amountOf(m.quantity, m.unit)]
      .filter(Boolean)
      .join(", ");
    if (r.status === "added")
      view.change = `Add ${here}${m.notes ? ` (${m.notes})` : ""} to the series`;
    if (r.status === "changed") {
      const before = source.get(r.seriesRowId!);
      const fields = [
        ...new Set(
          r.changes.map((c) => FIELD[c.field as keyof typeof FIELD] ?? c.field),
        ),
      ];
      const amount = before ? amountOf(before.quantity, before.unit) : "";
      view.was =
        fields.includes("amount") && amount
          ? `was ${amount}`
          : `changed ${fields.join(", ")}`;
      view.change = before
        ? fields.includes("amount") && fields.length === 1
          ? `${lineLabel(m)}: ${amount || "no amount"} → ${amountOf(m.quantity, m.unit) || "no amount"}`
          : `${lineLabel(before)} → ${here}${m.notes ? ` (${m.notes})` : ""}`
        : `Update ${here}`;
    }
    return view;
  });
}

export function missingMaterials(
  diff: ListDiff | null | undefined,
  series: MaterialRow[],
): MissingView[] {
  if (!diff) return [];
  const byId = new Map(series.map((s) => [s.id, s]));
  return diff.missing.flatMap((id) => {
    const s = byId.get(id);
    if (!s) return [];
    const label = [lineLabel(s), amountOf(s.quantity, s.unit)]
      .filter(Boolean)
      .join(", ");
    return [{ id, label, change: `Remove ${label} from the series` }];
  });
}

export type ItemView = {
  id: string;
  text: string;
  done: boolean;
  spaceName: string | null;
  quoteLabel: string | null;
  oneOff: boolean;
  status?: Status;
  change?: string;
};

export function itemChange(
  text: string,
  status: Status | undefined,
  before?: string,
) {
  if (status === "added") return `Add the to-do “${text}” to the series`;
  if (status === "changed")
    return before && before !== text
      ? `To-do “${before}” → “${text}”`
      : `Update the to-do “${text}”`;
  return undefined;
}

/** Every pending change, for the "Update series with all changes" confirmation. */
export function allChanges(
  materials: MaterialView[],
  missing: MissingView[],
  items: ItemView[],
  missingItems: MissingView[],
) {
  return [
    ...materials
      .filter((m) => m.status === "changed" || m.status === "added")
      .map((m) => m.change!),
    ...missing.map((m) => m.change),
    ...items
      .filter((i) => i.status === "changed" || i.status === "added")
      .map((i) => i.change!),
    ...missingItems.map((m) => m.change),
  ];
}
