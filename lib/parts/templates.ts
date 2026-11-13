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

export type TemplateField = {
  key: string;
  label: string;
  placeholder?: string;
  hint?: string;
  multiline?: boolean;
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
  fields: TemplateField[];
};

export const TEMPLATES: Record<Category, Template> = {
  bulb: {
    category: "bulb",
    label: "Light Bulb",
    unit: "bulb",
    fields: [
      { key: "base", label: "Base", placeholder: "E26, E12, GU10" },
      { key: "shape", label: "Shape", placeholder: "A19, BR30, candelabra" },
      { key: "color_temp", label: "Colour temperature", placeholder: "2700K" },
      {
        key: "brightness",
        label: "Brightness",
        placeholder: "800 lumens / 60W equivalent",
      },
      { key: "dimmable", label: "Dimmable?", placeholder: "Yes" },
      { key: "smart", label: "Smart bulb?", placeholder: "No" },
      {
        key: "brand",
        label: "Brand / product",
        placeholder: "Philips Ultra Definition",
      },
    ],
  },
  paint: {
    category: "paint",
    label: "Paint Colour",
    unit: "gal",
    finishes: ["Flat", "Matte", "Eggshell", "Satin", "Semi-gloss", "Gloss"],
    tip: "Copy these from the can’s label.",
    // In the order a store's tint label reads, top to bottom.
    fields: [
      { key: "brand", label: "Brand", placeholder: "Sherwin-Williams" },
      { key: "store", label: "Store", placeholder: "#1234, 555-123-4567" },
      { key: "mixed_on", label: "Date mixed", placeholder: "04/22/24" },
      { key: "order", label: "Order number", placeholder: "0582820" },
      {
        key: "interior_exterior",
        label: "Interior or exterior",
        placeholder: "Interior",
      },
      {
        key: "product_line",
        label: "Product",
        placeholder: "ProMar 200 Zero, Duration, Emerald",
      },
      { key: "sheen", label: "Sheen", placeholder: "Flat" },
      { key: "color_name", label: "Colour name", placeholder: "Repose Gray" },
      {
        key: "color_code",
        label: "Colour code",
        placeholder: "SW 7015, or “Custom match”",
      },
      {
        key: "formula",
        label: "Tint formula",
        placeholder:
          "COLORANT OZ 32 64 128\nB1-Black 2 3 1 1\nR2-Maroon - 4 1 1",
        hint: "One colorant per line; - for a blank.",
        multiline: true,
      },
      { key: "size", label: "Container size", placeholder: "Five gallon" },
      { key: "base", label: "Base", placeholder: "Extra White" },
      {
        key: "product_number",
        label: "Product number",
        placeholder: "B30W12651",
      },
    ],
  },
  filter: {
    category: "filter",
    label: "Filter",
    unit: "filter",
    fields: [
      { key: "size", label: "Size", placeholder: "16x25x1" },
      { key: "rating", label: "Rating", placeholder: "MERV 8" },
      { key: "brand", label: "Brand / product", placeholder: "Filtrete 1500" },
      { key: "interval", label: "Change every", placeholder: "90 days" },
    ],
  },
  battery: {
    category: "battery",
    label: "Battery",
    unit: "battery",
    fields: [
      { key: "size", label: "Size", placeholder: "AA, 9V, CR2032" },
      { key: "count", label: "How many it takes", placeholder: "4" },
      { key: "chemistry", label: "Type", placeholder: "Lithium, alkaline" },
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
        placeholder: "Hardwood mulch, brown",
      },
      { key: "bag_size", label: "Bag size", placeholder: "2 cu ft" },
      { key: "brand", label: "Brand", placeholder: "Scotts" },
    ],
  },
  other: {
    category: "other",
    label: "Other Part",
    unit: "",
    fields: [
      { key: "brand", label: "Brand / product", placeholder: "" },
      { key: "model", label: "Model / part number", placeholder: "" },
      { key: "size", label: "Size", placeholder: "" },
    ],
  },
};

export const CATEGORIES = Object.keys(TEMPLATES) as Category[];

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
    if (typeof value === "string" && value.trim() !== "")
      out[field.key] = value.trim().slice(0, 2000);
  }
  return out;
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
