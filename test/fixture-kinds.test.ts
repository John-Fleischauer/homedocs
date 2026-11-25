/*
 * What a fixture is: the family's own list of kinds, the kind and icon a name
 * suggests, a rename reaching the fixtures that have the kind, and a kind
 * removed from the list staying on them.
 */

import { describe, expect, it } from "vitest";
import {
  createFixture,
  getFixture,
  updateFixture,
} from "../lib/fixtures/fixtures";
import {
  DEFAULT_FIXTURE_KINDS,
  fixtureIcon,
  guessFixtureKind,
  kindIcon,
  listedKind,
} from "../lib/fixtures/kind-labels";
import {
  cleanFixtureKinds,
  getFixtureKinds,
  saveFixtureKinds,
} from "../lib/fixtures/kinds";
import { search } from "../lib/search/search";
import { guessSystemKey } from "../lib/systems/seeds";
import { db, resetBetweenTests } from "./helpers/db";
import { household } from "./helpers/fixtures";

resetBetweenTests();

const asEdits = (kinds: string[]) => kinds.map((k) => ({ name: k, was: k }));

describe("kind labels", () => {
  it("suggests a kind from the name, a switch before a light and a shutoff before a sink", () => {
    const guess = (name: string) =>
      guessFixtureKind(name, DEFAULT_FIXTURE_KINDS);
    expect(guess("Hall light")).toBe("Light");
    expect(guess("Light switch")).toBe("Switch or Outlet");
    expect(guess("Kitchen sink shutoff")).toBe("Shutoff Valve");
    expect(guess("Gas water heater")).toBe("Water Heater");
    expect(guess("Upstairs furnace")).toBe("Heating or Cooling");
    expect(guess("Front door deadbolt")).toBe("Door or Lock");
    expect(guess("Bookshelf")).toBeNull();
    expect(guess("")).toBeNull();
  });

  it("suggests only kinds on the list, and one the family added when the name says it", () => {
    expect(guessFixtureKind("Hall light", ["Fan", "Other"])).toBeNull();
    expect(
      guessFixtureKind("Back sprinkler valve", [
        ...DEFAULT_FIXTURE_KINDS,
        "Sprinkler Valve",
      ]),
    ).toBe("Sprinkler Valve");
    expect(guessFixtureKind("Other thing", DEFAULT_FIXTURE_KINDS)).toBeNull();
  });

  it("gives every default kind a system guess that fits, or none", () => {
    expect(guessSystemKey("Switch or Outlet", "")).toBe("electrical");
    expect(guessSystemKey("Shutoff Valve", "Gas shutoff")).toBe("gas");
    expect(guessSystemKey("Heating or Cooling", "")).toBe("hvac");
    expect(guessSystemKey("Water Heater", "")).toBe("water");
    expect(guessSystemKey("Smoke Detector", "")).toBe("safety");
    expect(guessSystemKey("Light", "Hall light")).toBeNull();
  });

  it("picks an icon by the kind's words, so an old or added kind gets one too", () => {
    expect(kindIcon("Light")).toBe("fixture");
    expect(kindIcon("Shutoff Valve")).toBe("water");
    expect(kindIcon("Switch or Outlet")).toBe("bolt");
    expect(kindIcon("Ceiling fan")).toBe("climate");
    expect(kindIcon("Smoke / CO detector")).toBe("shield");
    expect(kindIcon("Door or Lock")).toBe("key");
    expect(kindIcon("Other")).toBe("fixture");
    expect(kindIcon("")).toBe("fixture");
    // No kind: the icon its name suggests.
    expect(fixtureIcon({ category: "", name: "Main water shutoff" })).toBe(
      "water",
    );
    expect(fixtureIcon({ category: "Appliance", name: "Hall light" })).toBe(
      "system",
    );
  });

  it("cleans a saved list: trims, drops duplicates and blanks", () => {
    expect(
      cleanFixtureKinds([
        { name: " Light " },
        { name: "light" },
        { name: "" },
        { name: "Sump   Pump" },
      ]),
    ).toEqual(["Light", "Sump Pump"]);
    expect(() => cleanFixtureKinds("nope")).toThrow();
    expect(listedKind(["Shutoff Valve"], " shutoff  valve ")).toBe(
      "Shutoff Valve",
    );
    expect(listedKind(["Shutoff Valve"], "")).toBeUndefined();
  });
});

describe("the family’s list of kinds", () => {
  it("starts with the defaults, and a fixture is saved as the list spells its kind", async () => {
    const { scope, member } = await household();
    expect(await getFixtureKinds(db, scope)).toEqual(DEFAULT_FIXTURE_KINDS);
    const shutoff = await createFixture(db, scope, member, {
      name: "Main shutoff",
      category: "shutoff valve",
    });
    expect(shutoff.category).toBe("Shutoff Valve");
    // One the list doesn't have is kept as typed (the connector sends free text).
    const sauna = await createFixture(db, scope, member, {
      name: "Sauna",
      category: "Sauna heater",
    });
    expect(sauna.category).toBe("Sauna heater");
    const again = await updateFixture(db, scope, member, sauna.id, {
      category: "APPLIANCE",
    });
    expect(again.category).toBe("Appliance");
  });

  it("can lose a kind without touching the fixtures that have it; viewers can’t edit it", async () => {
    const { scope, member, viewer } = await household();
    const fan = await createFixture(db, scope, member, {
      name: "Bedroom fan",
      category: "Fan",
    });
    const without = asEdits(DEFAULT_FIXTURE_KINDS.filter((k) => k !== "Fan"));
    await expect(
      saveFixtureKinds(db, scope, viewer, without),
    ).rejects.toThrow();
    await saveFixtureKinds(db, scope, member, without);
    expect(await getFixtureKinds(db, scope)).not.toContain("Fan");
    expect((await getFixture(db, scope, fan.id)).category).toBe("Fan");
  });

  it("renames a kind on the fixtures that have it, and search finds them by the new name", async () => {
    const { scope, member } = await household();
    const other = await household();
    const shutoff = await createFixture(db, scope, member, {
      name: "Main shutoff",
      category: "Shutoff Valve",
    });
    const light = await createFixture(db, scope, member, {
      name: "Hall light",
      category: "Light",
    });
    const theirs = await createFixture(db, other.scope, other.member, {
      name: "Their shutoff",
      category: "Shutoff Valve",
    });

    const saved = await saveFixtureKinds(
      db,
      scope,
      member,
      DEFAULT_FIXTURE_KINDS.map((k) => ({
        name: k === "Shutoff Valve" ? "Stopcock" : k,
        was: k,
      })),
    );
    expect(saved).toContain("Stopcock");
    expect(saved).not.toContain("Shutoff Valve");
    expect((await getFixture(db, scope, shutoff.id)).category).toBe("Stopcock");
    expect((await getFixture(db, scope, light.id)).category).toBe("Light");
    // Another home's fixtures and list are not this home's to rename.
    expect((await getFixture(db, other.scope, theirs.id)).category).toBe(
      "Shutoff Valve",
    );
    expect(await getFixtureKinds(db, other.scope)).toEqual(
      DEFAULT_FIXTURE_KINDS,
    );
    expect((await search(db, scope, "stopcock")).map((h) => h.title)).toContain(
      "Main shutoff",
    );
  });

  it("swaps two names, merges a kind renamed onto another, and treats a new row as new", async () => {
    const { scope, member } = await household();
    const a = await createFixture(db, scope, member, {
      name: "A",
      category: "Fan",
      systemId: null,
    });
    const b = await createFixture(db, scope, member, {
      name: "B",
      category: "Light",
      systemId: null,
    });
    await saveFixtureKinds(db, scope, member, [
      { name: "Light", was: "Fan" },
      { name: "Fan", was: "Light" },
    ]);
    expect((await getFixture(db, scope, a.id)).category).toBe("Light");
    expect((await getFixture(db, scope, b.id)).category).toBe("Fan");

    // "Fan" renamed onto "Light": one kind left, and both fixtures have it.
    expect(
      await saveFixtureKinds(db, scope, member, [
        { name: "Light", was: "Light" },
        { name: "light", was: "Fan" },
      ]),
    ).toEqual(["Light"]);
    expect((await getFixture(db, scope, b.id)).category).toBe("Light");

    // A row with no `was` is a new kind, whatever it is called: nothing is renamed.
    await saveFixtureKinds(db, scope, member, [{ name: "Lamp" }]);
    expect((await getFixture(db, scope, a.id)).category).toBe("Light");
    expect(await getFixtureKinds(db, scope)).toEqual(["Lamp"]);
  });
});
