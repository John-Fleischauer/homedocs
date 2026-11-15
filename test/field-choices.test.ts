/*
 * A part's details offered as dropdowns and yes/no buttons: answers are saved
 * as the list spells them, and anything else is kept as typed.
 */

import { describe, expect, it } from "vitest";
import {
  CATEGORIES,
  TEMPLATES,
  choiceValue,
  cleanFields,
  matchChoice,
  yesNoValue,
} from "../lib/parts/templates";

describe("a part's details", () => {
  it("saves a listed answer as the list spells it", () => {
    expect(
      cleanFields("bulb", {
        base: "e26",
        shape: "a19",
        color_temp: "2700k",
        dimmable: "y",
        smart: "FALSE",
      }),
    ).toEqual({
      base: "E26",
      shape: "A19",
      color_temp: "2700K",
      dimmable: "Yes",
      smart: "No",
    });
    expect(cleanFields("paint", { sheen: "semi gloss" })).toEqual({
      sheen: "Semi-gloss",
    });
    expect(cleanFields("filter", { rating: "merv13" })).toEqual({
      rating: "MERV 13",
    });
  });

  it("keeps an answer the list doesn't have, and one saved before there was a list", () => {
    expect(
      cleanFields("bulb", {
        shape: "R20",
        dimmable: "Only with an LED dimmer",
      }),
    ).toEqual({ shape: "R20", dimmable: "Only with an LED dimmer" });
  });

  it("matches only whole answers", () => {
    const base = TEMPLATES.bulb.fields.find((f) => f.key === "base")!;
    expect(matchChoice(base.choices, "E2")).toBe(undefined);
    expect(matchChoice(base.choices, "")).toBe(undefined);
    expect(yesNoValue("maybe")).toBe(undefined);
  });

  it("lists each answer once per field, and never a blank one", () => {
    for (const c of CATEGORIES)
      for (const f of TEMPLATES[c].fields) {
        if (!f.choices) continue;
        const values = f.choices.map(choiceValue);
        expect(values.every(Boolean), `${c}.${f.key}`).toBe(true);
        expect(
          new Set(values.map((v) => v.toLowerCase())).size,
          `${c}.${f.key}`,
        ).toBe(values.length);
      }
  });
});
