/*
 * What a fixture is, as words. Pure, so the fixture form can use it too.
 *
 * A fixture stores its kind as text (`fixtures.category`), spelled as the
 * family's list spells it. Two spellings are the same kind when their keys
 * match, so "shutoff valve" from the connector is "Shutoff Valve" on the list.
 */

/** Short on purpose: the form offers it as one dropdown. The family edits it at /fixtures/kinds. */
export const DEFAULT_FIXTURE_KINDS = [
  "Light",
  "Fan",
  "Switch or Outlet",
  "Electrical Panel",
  "Shutoff Valve",
  "Faucet or Toilet",
  "Water Heater",
  "Heating or Cooling",
  "Appliance",
  "Smoke Detector",
  "Door or Lock",
  "Other",
];

/** How two spellings of a kind are compared. */
export function kindKey(label: string): string {
  return label.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The list's spelling of a kind, or undefined when the list doesn't have it. */
export function listedKind(kinds: string[], value: string): string | undefined {
  const key = kindKey(value);
  return key ? kinds.find((k) => kindKey(k) === key) : undefined;
}

/** Trimmed, de-duplicated (first wins), blanks dropped. */
export function cleanKindNames(names: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of names.slice(0, 200)) {
    const name = String(raw).trim().replace(/\s+/g, " ").slice(0, 60);
    const key = kindKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length === 40) break;
  }
  return out;
}

/* First match wins, so the order matters: a light switch is a switch, a kitchen sink shutoff is a valve. */
const NAME_RULES: [kind: string, pattern: RegExp][] = [
  ["Water Heater", /water heater|tankless/],
  ["Shutoff Valve", /shut-?off|valve/],
  ["Smoke Detector", /smoke|carbon monoxide|\bco\b/],
  ["Electrical Panel", /breaker|\bpanel\b|subpanel|fuse box/],
  ["Switch or Outlet", /switch|outlet|gfci|dimmer|receptacle/],
  ["Fan", /\bfan\b/],
  ["Light", /\blights?\b|\blamps?\b|sconce|chandelier|pendant/],
  [
    "Heating or Cooling",
    /hvac|furnace|air handler|\ba\/?c\b|air condition|heat pump|thermostat|boiler|mini-?split|radiator/,
  ],
  ["Faucet or Toilet", /faucet|toilet|sink|shower|\btub\b|spigot|hose bib/],
  ["Door or Lock", /\bdoors?\b|\blocks?\b|deadbolt/],
  [
    "Appliance",
    /dishwasher|refrigerator|fridge|freezer|\boven\b|\brange\b|stove|cooktop|washer|dryer|microwave|disposal/,
  ],
];

/**
 * The kind on the family's list a fixture's name suggests ("Hall light" →
 * Light); null when nothing is clear. A kind the family added wins when the
 * name says it outright ("Back sprinkler valve" → their Sprinkler Valve); then
 * the default kinds go by NAME_RULES, for as long as they are on the list.
 */
export function guessFixtureKind(
  name: string | null | undefined,
  kinds: string[],
): string | null {
  const text = kindKey(name ?? "");
  if (!text) return null;
  const added = kinds
    .filter(
      (k) =>
        !NAME_RULES.some(([d]) => kindKey(d) === kindKey(k)) &&
        kindKey(k) !== "other" &&
        ` ${text} `.includes(` ${kindKey(k)} `),
    )
    .sort((a, b) => b.length - a.length)[0];
  if (added) return added;
  for (const [kind, pattern] of NAME_RULES) {
    const listed = listedKind(kinds, kind);
    if (listed && pattern.test(text)) return listed;
  }
  return null;
}

/* Names from components/ui/icons.tsx; the bulb ("fixture") is the one every fixture had before. */
export type KindIcon =
  | "fixture"
  | "bolt"
  | "water"
  | "drain"
  | "climate"
  | "flame"
  | "shield"
  | "key"
  | "leaf"
  | "wifi"
  | "system";

/* First match wins. By words, not by list position, so a kind the family adds or renames, and one saved before there was a list ("Ceiling fan"), still gets a fitting icon. */
const ICON_RULES: [icon: KindIcon, pattern: RegExp][] = [
  ["water", /water heater|shut-?off|valve/],
  ["drain", /faucet|toilet|sink|plumb|drain|shower|\btub\b/],
  ["bolt", /switch|outlet|electric|panel|breaker/],
  ["shield", /smoke|detector|alarm|camera|security/],
  ["key", /\bdoors?\b|\blocks?\b/],
  ["climate", /\bfan\b|heat|cool|hvac|thermostat|furnace|\bair\b/],
  ["flame", /\bgas\b|fireplace|grill|stove/],
  ["leaf", /irrigation|sprinkler|garden|yard/],
  ["wifi", /wi-?fi|network|router|internet/],
  ["water", /water/],
  ["system", /appliance/],
  ["fixture", /\blights?\b|\blamps?\b/],
];

/** The icon for a kind; the plain fixture icon for none, Other, or one nothing matches. */
export function kindIcon(kind: string | null | undefined): KindIcon {
  const text = kindKey(kind ?? "");
  for (const [icon, pattern] of ICON_RULES) if (pattern.test(text)) return icon;
  return "fixture";
}

/** A fixture's icon: its kind's, or for a fixture with no kind, the one its name suggests. */
export function fixtureIcon(fixture: {
  category: string;
  name: string;
}): KindIcon {
  return kindIcon(
    fixture.category || guessFixtureKind(fixture.name, DEFAULT_FIXTURE_KINDS),
  );
}
