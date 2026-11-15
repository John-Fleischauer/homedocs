/*
 * A part's details offered as dropdowns and yes/no buttons: answers are saved
 * as the list spells them, and anything else is kept as typed.
 */

import { describe, expect, it } from "vitest";
import {
  OTHER_CHOICE,
  choiceValue,
  matchChoice,
  yesNoValue,
} from "../lib/core/choices";
import { CATEGORIES, TEMPLATES, cleanFields } from "../lib/parts/templates";

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

  it("counts dots, so a different size isn't taken for a listed one", () => {
    expect(cleanFields("landscaping", { bag_size: "15 cu ft" })).toEqual({
      bag_size: "15 cu ft",
    });
    expect(cleanFields("landscaping", { bag_size: "1.5 cu-ft" })).toEqual({
      bag_size: "1.5 cu ft",
    });
  });

  it("saves nothing for Not sure, or for Other… picked before the page loaded", () => {
    expect(
      cleanFields("bulb", { dimmable: "Not sure", shape: OTHER_CHOICE }),
    ).toEqual({});
  });

  it("can reach every listed answer, and lists none blank", () => {
    for (const c of CATEGORIES)
      for (const f of TEMPLATES[c].fields) {
        if (!f.choices) continue;
        for (const v of f.choices.map(choiceValue)) {
          expect(v, `${c}.${f.key}`).not.toBe("");
          // An answer that matched an earlier one could never be saved.
          expect(matchChoice(f.choices, v), `${c}.${f.key}`).toBe(v);
        }
      }
  });
});
