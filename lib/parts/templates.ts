/*
 * Per-category field templates for parts.
 *
 * A part's `fields` jsonb is free key/value in the database, but every write
 * goes through the category's template here: known keys only, trimmed, and the
 * form shows the right questions for a bulb vs. a can of paint. Adding a field
 * is a code change and no migration; template values feed search.
 *
 * Paint's `sheen` is what the can's label says was mixed. The sheen on a wall
 * belongs to the *use* (eggshell walls, semi-gloss trim of the same colour), on
 * supply_uses.finish.
 */

export type Category =
  "bulb" | "paint" | "filter" | "battery" | "landscaping" | "other";

import {
  matchChoice,
  tidyChoice,
  yesNoValue,
  type Choice,
} from "../core/choices";

export type TemplateField = {
  key: string;
  label: string;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
  /**
   * The usual answers, as a dropdown. "Other…" is always there too, so an
   * unusual one can still be typed; a typed one that matches is saved as
   * listed ("e26" → "E26").
   */
  choices?: Choice[];
  /** Yes, No or Not sure, as buttons. A typed "y" or "true" is saved as Yes. */
  yesNo?: boolean;
  /** A count: the phone shows its number pad. */
  count?: boolean;
};

export type Template = {
  category: Category;
  label: string;
  /** The default unit a use or a note counts in. */
  unit: string;
  /** Suggested finishes for a use, when the category has them. */
  finishes?: string[];
  /** A nudge shown on the form. */
  tip?: string;
  /** In the order the form asks for them: for paint, the order the can's label reads. */
  fields: TemplateField[];
  /**
   * How the part's page groups the fields, when one list would bury what's
   * asked for most (paint's colour under the store's order number). Fields left
   * out of every group follow in a group of their own.
   */
  view?: { title: string; keys: string[] }[];
};

/* What a can's label says was mixed, and the finish a wall is painted in: the same list. */
const PAINT_SHEENS = [
  "Flat",
  "Matte",
  "Eggshell",
  "Satin",
  "Semi-gloss",
  "Gloss",
];

export const TEMPLATES: Record<Category, Template> = {
  bulb: {
    category: "bulb",
    label: "Light Bulb",
    unit: "bulb",
    fields: [
      {
        key: "base",
        label: "Base",
        placeholder: "E26",
        choices: [
          ["E26", "standard"],
          ["E12", "candelabra"],
          ["E17", "intermediate"],
          "GU10",
          "GU24",
          "G4",
          "G9",
          ["GU5.3", "MR16 pins"],
          ["G13", "T8 tube"],
          ["E39", "mogul"],
        ],
      },
      {
        key: "shape",
        label: "Shape",
        placeholder: "A19",
        choices: [
          ["A19", "standard"],
          "A21",
          ["BR30", "recessed"],
          "BR40",
          "PAR20",
          "PAR30",
          "PAR38",
          ["B11", "candelabra"],
          ["G25", "globe"],
          "ST19",
          "MR16",
          "T8",
        ],
      },
      {
        key: "color_temp",
        label: "Colour Temperature",
        placeholder: "2700K",
        choices: [
          ["2200K", "candlelight"],
          ["2700K", "warm white"],
          ["3000K", "soft white"],
          ["3500K", "neutral"],
          ["4000K", "cool white"],
          ["5000K", "daylight"],
          ["6500K", "bright daylight"],
        ],
      },
      {
        key: "brightness",
        label: "Brightness",
        placeholder: "800 lumens",
        choices: [
          ["450 lumens", "40W"],
          ["800 lumens", "60W"],
          ["1100 lumens", "75W"],
          ["1600 lumens", "100W"],
        ],
      },
      { key: "dimmable", label: "Dimmable", placeholder: "Yes", yesNo: true },
      { key: "smart", label: "Smart Bulb", placeholder: "No", yesNo: true },
      {
        key: "brand",
        label: "Brand and Product",
        placeholder: "Philips Ultra Definition",
      },
    ],
  },
  paint: {
    category: "paint",
    label: "Paint Colour",
    unit: "gal",
    finishes: PAINT_SHEENS,
    tip: "Copy from the can’s label",
    // In the order a store's tint label reads, top to bottom.
    fields: [
      {
        key: "brand",
        label: "Brand",
        placeholder: "Sherwin-Williams",
        choices: [
          "Sherwin-Williams",
          "Benjamin Moore",
          "Behr",
          "Valspar",
          "PPG",
          "Glidden",
          "Dunn-Edwards",
          "Farrow & Ball",
        ],
      },
      { key: "store", label: "Store", placeholder: "Store #1234" },
      { key: "mixed_on", label: "Date Mixed", placeholder: "04/22/24" },
      { key: "order", label: "Order Number", placeholder: "0582820" },
      {
        key: "interior_exterior",
        label: "Interior or Exterior",
        placeholder: "Interior",
        choices: ["Interior", "Exterior", "Interior/Exterior"],
      },
      {
        key: "product_line",
        label: "Product",
        placeholder: "Duration",
      },
      {
        key: "sheen",
        label: "Sheen",
        placeholder: "Flat",
        choices: PAINT_SHEENS,
      },
      { key: "color_name", label: "Colour Name", placeholder: "Repose Gray" },
      {
        key: "color_code",
        label: "Colour Code",
        placeholder: "SW 7015",
      },
      {
        key: "formula",
        label: "Tint Formula",
        placeholder:
          "COLORANT OZ 32 64 128\nB1-Black 2 3 1 1\nR2-Maroon - 4 1 1",
        hint: "One colorant per line, - for a blank",
        multiline: true,
      },
      {
        key: "size",
        label: "Container Size",
        placeholder: "Five gallon",
        choices: ["Sample", "Quart", "Gallon", "Five gallon"],
      },
      {
        key: "base",
        label: "Base",
        placeholder: "Extra White",
        choices: [
          "Extra White",
          "Pastel",
          "Medium",
          "Deep",
          "Ultradeep",
          "Neutral",
          "Clear",
        ],
      },
      {
        key: "product_number",
        label: "Product Number",
        placeholder: "B30W12651",
      },
    ],
    view: [
      {
        title: "Colour",
        keys: [
          "color_name",
          "color_code",
          "brand",
          "product_line",
          "sheen",
          "interior_exterior",
        ],
      },
      { title: "Can", keys: ["size", "base", "product_number"] },
      { title: "Mixed At", keys: ["store", "mixed_on", "order", "formula"] },
    ],
  },
  filter: {
    category: "filter",
    label: "Filter",
    unit: "filter",
    fields: [
      {
        key: "size",
        label: "Size",
        placeholder: "16x25x1",
        choices: [
          "14x20x1",
          "14x25x1",
          "16x20x1",
          "16x25x1",
          "20x20x1",
          "20x25x1",
          "16x25x4",
          "20x20x4",
          "20x25x4",
          "20x25x5",
        ],
      },
      {
        key: "rating",
        label: "Rating",
        placeholder: "MERV 8",
        choices: ["MERV 8", "MERV 11", "MERV 13", "MERV 16", "HEPA"],
      },
      {
        key: "brand",
        label: "Brand and Product",
        placeholder: "Filtrete 1500",
      },
      {
        key: "interval",
        label: "Change Every",
        placeholder: "90 days",
        choices: ["30 days", "60 days", "90 days", "6 months", "12 months"],
      },
    ],
  },
  battery: {
    category: "battery",
    label: "Battery",
    unit: "battery",
    fields: [
      {
        key: "size",
        label: "Size",
        placeholder: "AA",
        choices: [
          "AA",
          "AAA",
          "C",
          "D",
          "9V",
          "CR2032",
          "CR2025",
          "CR2016",
          "CR123A",
          "CR2",
          "LR44",
        ],
      },
      {
        key: "count",
        label: "How Many Needed",
        placeholder: "4",
        count: true,
      },
      {
        key: "chemistry",
        label: "Type",
        placeholder: "Lithium",
        choices: ["Alkaline", "Lithium", "Rechargeable (NiMH)", "Lithium-ion"],
      },
    ],
  },
  landscaping: {
    category: "landscaping",
    label: "Landscaping",
    unit: "bag",
    fields: [
      {
        key: "product",
        label: "Product",
        placeholder: "Hardwood mulch",
      },
      {
        key: "bag_size",
        label: "Bag Size",
        placeholder: "2 cu ft",
        choices: ["1.5 cu ft", "2 cu ft", "3 cu ft", "40 lb", "50 lb"],
      },
      { key: "brand", label: "Brand", placeholder: "Scotts" },
    ],
  },
  other: {
    category: "other",
    label: "Other Part",
    unit: "",
    fields: [
      { key: "brand", label: "Brand and Product", placeholder: "" },
      { key: "model", label: "Model or Part Number", placeholder: "" },
      { key: "size", label: "Size", placeholder: "" },
    ],
  },
};

export const CATEGORIES = Object.keys(TEMPLATES) as Category[];

/*
 * The units parts are usually sold and counted by, for the forms' dropdowns.
 * Spelled as they are saved: singular, and "gal" and "ft" as formatQty shows
 * them. Anything else is still typed, under "Other…".
 */
export const UNITS = [
  "each",
  "pack",
  "box",
  "bag",
  "roll",
  "bale",
  "gal",
  "quart",
  "can",
  "tube",
  "ft",
];

/** The units to offer for a part: its own first, then the usual ones. */
export function unitChoices(own: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const u of [...own, ...UNITS]) {
    const key = u.trim().toLowerCase();
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push(u.trim());
  }
  return out;
}

/**
 * A typed unit as its list spells it: "Bags" and "bag" are both "bag", so the
 * same unit isn't saved two ways. One the list doesn't have is kept as typed.
 */
export function tidyUnit(value: string, own: readonly string[] = []): string {
  const choices = unitChoices(own);
  const listed =
    matchChoice(choices, value) ??
    (/s$/i.test(value)
      ? matchChoice(choices, value.slice(0, -1))
      : undefined) ??
    (/es$/i.test(value) ? matchChoice(choices, value.slice(0, -2)) : undefined);
  return listed ?? tidyChoice(undefined, value);
}

export function isCategory(value: string): value is Category {
  return value in TEMPLATES;
}

/** Keep only this category's keys, trimmed; drop empties. */
export function cleanFields(
  category: Category,
  raw: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const field of TEMPLATES[category].fields) {
    const value = raw[field.key];
    if (typeof value !== "string") continue;
    // A blank, "Not sure" or a dropdown's unswapped "Other…" saves nothing.
    const answer = tidyAnswer(field, value.trim().slice(0, 2000));
    if (answer !== "") out[field.key] = answer;
  }
  return out;
}

/* An answer as its list spells it ("e26" → "E26", "y" → "Yes"); see lib/core/choices.ts. */
function tidyAnswer(field: TemplateField, value: string): string {
  if (field.yesNo) return yesNoValue(value) ?? value;
  return tidyChoice(field.choices, value);
}

/** A one-line summary for lists: "E26 · A19 · 2700K". */
export function summarize(
  category: Category,
  fields: Record<string, string>,
): string {
  const keys: Record<Category, string[]> = {
    bulb: ["base", "shape", "color_temp"],
    paint: ["brand", "color_code", "product_line", "sheen"],
    filter: ["size", "rating"],
    battery: ["size", "count"],
    landscaping: ["product", "bag_size"],
    other: ["brand", "model", "size"],
  };
  return keys[category]
    .map((k) => fields[k])
    .filter(Boolean)
    .join(" · ");
}

/**
 * The template's fields in the groups the part's page shows: its `view`, then
 * whatever no group names. A template without a view is one group, "Details".
 */
export function fieldGroups(
  category: Category,
): { title: string; fields: TemplateField[] }[] {
  const template = TEMPLATES[category];
  const byKey = new Map(template.fields.map((f) => [f.key, f]));
  const groups = (template.view ?? []).map((g) => ({
    title: g.title,
    fields: g.keys.flatMap((k) => byKey.get(k) ?? []),
  }));
  const named = new Set(groups.flatMap((g) => g.fields.map((f) => f.key)));
  const rest = template.fields.filter((f) => !named.has(f.key));
  if (rest.length)
    groups.push({ title: groups.length ? "More" : "Details", fields: rest });
  return groups;
}
