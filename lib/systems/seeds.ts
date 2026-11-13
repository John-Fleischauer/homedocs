/*
 * The systems every home starts with, and the guess at which one a fixture
 * belongs to. Pure, so the fixture form can make the same guess as you type.
 *
 * The backfill in migration 0003_systems.sql applies the same rules in SQL to
 * fixtures that existed before systems did; keep the two in step.
 */

export type SystemSeed = {
  key: string;
  name: string;
  icon: SystemIcon;
  trades: string[];
};

export const SYSTEM_ICONS = [
  "water",
  "bolt",
  "climate",
  "flame",
  "drain",
  "leaf",
  "shield",
  "wifi",
  "system",
] as const;
export type SystemIcon = (typeof SYSTEM_ICONS)[number];

export function isSystemIcon(value: string): value is SystemIcon {
  return (SYSTEM_ICONS as readonly string[]).includes(value);
}

/** A stored icon name, or the generic one. */
export function systemIcon(value: string): SystemIcon {
  return isSystemIcon(value) ? value : "system";
}

export const SYSTEM_SEEDS: SystemSeed[] = [
  {
    key: "water",
    name: "Water & plumbing",
    icon: "water",
    trades: ["plumber", "water & sewer"],
  },
  {
    key: "electrical",
    name: "Electrical",
    icon: "bolt",
    trades: ["electrician", "electric"],
  },
  { key: "hvac", name: "Heating & cooling", icon: "climate", trades: ["hvac"] },
  { key: "gas", name: "Gas", icon: "flame", trades: ["gas", "propane"] },
  {
    key: "sewer",
    name: "Sewer & septic",
    icon: "drain",
    trades: ["septic", "water & sewer"],
  },
  {
    key: "irrigation",
    name: "Irrigation",
    icon: "leaf",
    trades: ["landscaper"],
  },
  {
    key: "safety",
    name: "Safety & security",
    icon: "shield",
    trades: ["locksmith"],
  },
  {
    key: "network",
    name: "Internet & Wi-Fi",
    icon: "wifi",
    trades: ["internet"],
  },
];

/* First match wins, so the order matters: a gas water heater is Water, an irrigation shutoff is Irrigation. */
const RULES: [key: string, pattern: RegExp][] = [
  ["sewer", /septic|sewer|clean-?out|ejector/],
  ["irrigation", /irrigation|sprinkler|drip line/],
  ["water", /water heater|water softener|tankless/],
  ["gas", /\bgas\b|propane/],
  [
    "hvac",
    /hvac|furnace|air handler|\ba\/?c\b|air condition|heat pump|thermostat|boiler|mini-?split|ductless|air filter/,
  ],
  [
    "water",
    /\bwater\b|plumb|shut-?off|valve|faucet|toilet|sink|sump|well pump|hose bib|spigot/,
  ],
  ["electrical", /electric|breaker|\bpanel\b|outlet|gfci|generator|subpanel/],
  [
    "safety",
    /smoke|carbon monoxide|\bco\b|alarm|lock|extinguisher|camera|doorbell/,
  ],
  ["network", /router|modem|wi-?fi|network|access point|ethernet/],
];

/** The seed key a fixture most likely belongs to, from its kind and name; null when nothing is clear. */
export function guessSystemKey(
  category: string | null | undefined,
  name: string | null | undefined,
): string | null {
  const text = `${category ?? ""} ${name ?? ""}`.toLowerCase();
  for (const [key, pattern] of RULES) if (pattern.test(text)) return key;
  return null;
}
