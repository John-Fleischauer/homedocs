/*
 * What a contact does, as words. Pure, so the contact form can use it too.
 *
 * contact_trades stores a trade lower-cased ("hvac"), which is what matches a
 * system's trades and a search. What the family sees is the label from their
 * list ("HVAC"), or failing that one made here.
 */

export type TradeGroup = { label: string; trades: string[] };

/* A utility is a company as often as not, so utilities get their own group. */
export const DEFAULT_TRADE_GROUPS: TradeGroup[] = [
  {
    label: "Repairs and Services",
    trades: [
      "Plumber",
      "Electrician",
      "HVAC",
      "Handyman",
      "Roofer",
      "Landscaper",
      "Pest control",
      "Appliance repair",
      "Locksmith",
      "Painter",
      "Pool",
      "Cleaning",
    ],
  },
  {
    label: "Utilities",
    trades: [
      "Electric",
      "Gas",
      "Water & sewer",
      "Trash & recycling",
      "Internet",
      "Phone & TV",
      "Propane",
      "Septic",
    ],
  },
  { label: "Other", trades: ["HOA", "Insurance", "Neighbor", "Vet"] },
];

/** How a trade is stored and matched. */
export function tradeKey(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

const ACRONYMS = new Set(["hvac", "hoa", "tv", "isp", "ac", "diy", "pto"]);

/** A label for a trade not on the list: "phone & tv" → "Phone & TV". */
export function defaultTradeLabel(key: string): string {
  const words = key
    .split(" ")
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w));
  const s = words.join(" ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** key → label, from the family's list. */
export function tradeLabeler(groups: TradeGroup[]): (key: string) => string {
  const known = new Map(
    groups.flatMap((g) => g.trades.map((t) => [tradeKey(t), t] as const)),
  );
  return (key) => known.get(key) ?? defaultTradeLabel(key);
}
