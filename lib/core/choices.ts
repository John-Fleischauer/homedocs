/*
 * Answers picked from a list: a dropdown's usual answers, and yes/no. Pure,
 * shared by the forms (components/ui/Choice.tsx) and the domain modules that
 * save what they post.
 */

/** A dropdown answer: the value saved, or the value and how the list shows it ("2700K", "warm white"). */
export type Choice = string | [value: string, note: string];

/**
 * What the dropdown posts for "Other…" until the page has loaded and swapped
 * in its text box. Never an answer: a save treats it as blank.
 */
export const OTHER_CHOICE = "__other__";

/*
 * "e26", "E-26" and "E26" are the same answer; so are "semi gloss" and
 * "Semi-gloss". Dots count: "1.5 cu ft" is not "15 cu ft".
 */
function plain(text: string): string {
  return text.toLowerCase().replace(/[\s\-_]/g, "");
}

export function choiceValue(choice: Choice): string {
  return typeof choice === "string" ? choice : choice[0];
}

/** How a dropdown shows an answer: "2700K · warm white". */
export function choiceLabel(choice: Choice): string {
  return typeof choice === "string" ? choice : `${choice[0]} · ${choice[1]}`;
}

/** The listed answer a typed one is, if any. */
export function matchChoice(
  choices: readonly Choice[] | undefined,
  value: string,
): string | undefined {
  if (!value) return undefined;
  const v = plain(value);
  return choices?.map(choiceValue).find((c) => plain(c) === v);
}

/**
 * A listed answer as the list spells it; anything else as typed, so an answer
 * the list doesn't have, or one saved before there was a list, survives a save.
 */
export function tidyChoice(
  choices: readonly Choice[] | undefined,
  value: string,
): string {
  if (value === OTHER_CHOICE) return "";
  return matchChoice(choices, value) ?? value;
}

const YES = ["yes", "y", "true"];
const NO = ["no", "n", "false"];
const UNSURE = ["not sure", "unsure", "unknown", "?"];

/**
 * A yes/no answer: "Yes", "No", "" for one that says it isn't known, or
 * undefined for anything else (kept as typed).
 */
export function yesNoValue(value: string): "Yes" | "No" | "" | undefined {
  const v = value.trim().toLowerCase();
  if (v === "" || UNSURE.includes(v)) return "";
  if (YES.includes(v)) return "Yes";
  if (NO.includes(v)) return "No";
  return undefined;
}
