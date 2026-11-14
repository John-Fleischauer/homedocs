/*
 * Where a part is bought: the stores on a part, the retailers the app knows by
 * sight, and the badges it draws for them.
 */

import { describe, expect, it } from "vitest";
import { ValidationError } from "../lib/core/types";
import {
  cleanStores,
  createPart,
  getPart,
  updatePart,
} from "../lib/parts/parts";
import {
  RETAILERS,
  badgeFor,
  knownRetailer,
  storeName,
} from "../lib/parts/retailers";
import { fieldGroups } from "../lib/parts/templates";
import { search } from "../lib/search/search";
import { db, resetBetweenTests } from "./helpers/db";
import { household } from "./helpers/fixtures";
import { connect, dataOf, identityFor } from "./helpers/mcp";

resetBetweenTests();

/* WCAG relative luminance and contrast ratio, for the badge colours. */
function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

describe("retailers", () => {
  it("knows a store by what the family calls it", () => {
    for (const name of ["Lowe's", "lowes", "LOWE’S", "Lowe’s"])
      expect(knownRetailer({ retailer: name, url: "" })?.key).toBe("lowes");
    expect(knownRetailer({ retailer: "The Home Depot", url: "" })?.key).toBe(
      "home-depot",
    );
    // Its name inside a longer one, as whole words.
    expect(knownRetailer({ retailer: "Ace on Main St", url: "" })?.key).toBe(
      "ace",
    );
    expect(knownRetailer({ retailer: "Home Depot on Elm", url: "" })?.key).toBe(
      "home-depot",
    );
    expect(knownRetailer({ retailer: "Grace Hardware", url: "" })).toBe(
      undefined,
    );
  });

  it("goes by the name the family typed, not the link, when there is one", () => {
    const store = {
      retailer: "Bob's Hardware",
      url: "https://www.homedepot.com/p/1",
    };
    expect(knownRetailer(store)).toBe(undefined);
    expect(badgeFor(store)).toEqual({ mark: "B" });
    expect(storeName(store)).toBe("Bob's Hardware");
  });

  it("knows a store by its link's host, subdomains and short links too", () => {
    const by = (url: string) => knownRetailer({ retailer: "", url })?.key;
    expect(by("https://www.homedepot.com/p/123")).toBe("home-depot");
    expect(by("https://smile.amazon.com/dp/B0")).toBe("amazon");
    expect(by("https://amzn.to/3abc")).toBe("amazon");
    expect(by("walmart.com/ip/1")).toBe("walmart");
    // A host that merely ends in the same letters is someone else.
    expect(by("https://nothomedepot.com/")).toBe(undefined);
    expect(by("not a link")).toBe(undefined);
  });

  it("names a store by its own name, then the retailer, then the host", () => {
    expect(
      storeName({ retailer: "Lowe's on 5th", url: "https://lowes.com/x" }),
    ).toBe("Lowe's on 5th");
    expect(storeName({ retailer: "", url: "https://www.lowes.com/x" })).toBe(
      "Lowe’s",
    );
    expect(storeName({ retailer: "", url: "https://www.example.com/x" })).toBe(
      "example.com",
    );
  });

  it("draws a known retailer in its colours and any other with its first letter", () => {
    expect(badgeFor({ retailer: "Amazon", url: "" })).toMatchObject({
      mark: "a",
      bg: "#232f3e",
    });
    expect(badgeFor({ retailer: "Bob's Hardware", url: "" })).toEqual({
      mark: "B",
    });
    expect(badgeFor({ retailer: "", url: "https://example.com" })).toEqual({
      mark: "E",
    });
    expect(badgeFor({ retailer: "", url: "" })).toEqual({ mark: "" });
  });

  it("gives every badge readable text", () => {
    for (const r of RETAILERS)
      expect(contrast(r.bg, r.fg), r.name).toBeGreaterThanOrEqual(4.5);
  });

  it("has no two retailers claiming the same name or host", () => {
    const names = RETAILERS.flatMap((r) => [r.name, ...(r.aliases ?? [])]).map(
      (n) => n.toLowerCase(),
    );
    expect(new Set(names).size).toBe(names.length);
    const hosts = RETAILERS.flatMap((r) => r.hosts);
    expect(new Set(hosts).size).toBe(hosts.length);
  });
});

describe("a part's stores", () => {
  it("drops blank rows, leaves a blank name blank, and says either when not told", () => {
    expect(
      cleanStores([
        { retailer: "", url: "https://www.homedepot.com/p/1", how: "online" },
        { retailer: "  ", url: "", how: "in_store" },
        { retailer: "Ace on Main", url: "", how: "in_store" },
        { retailer: "", url: "example.com/bulb", how: "nonsense" },
      ]),
    ).toEqual([
      { retailer: "", url: "https://www.homedepot.com/p/1", how: "online" },
      { retailer: "Ace on Main", url: "", how: "in_store" },
      { retailer: "", url: "https://example.com/bulb", how: "either" },
    ]);
  });

  it("refuses a link that isn't one, and more than ten stores", () => {
    expect(() =>
      cleanStores([{ retailer: "x", url: "javascript:alert(1)" }]),
    ).toThrow(ValidationError);
    expect(() =>
      cleanStores(
        Array.from({ length: 11 }, (_, i) => ({ retailer: `Store ${i}` })),
      ),
    ).toThrow(ValidationError);
  });

  it("are saved, changed, and found by search", async () => {
    const { scope, member } = await household();
    const filter = await createPart(db, scope, member, {
      category: "filter",
      name: "Furnace filter",
      fields: { size: "16x25x1" },
      stores: [{ url: "https://www.lowes.com/pd/filter/1", how: "online" }],
    });
    // Named from its link when shown, so the name follows the link.
    expect(filter.stores).toEqual([
      { retailer: "", url: "https://www.lowes.com/pd/filter/1", how: "online" },
    ]);
    expect(filter.stores.map(storeName)).toEqual(["Lowe’s"]);
    expect((await search(db, scope, "lowes")).map((h) => h.id)).toContain(
      filter.id,
    );

    await updatePart(db, scope, member, filter.id, {
      stores: [{ retailer: "Costco", how: "in_store" }],
    });
    const saved = await getPart(db, scope, filter.id);
    expect(saved.stores).toEqual([
      { retailer: "Costco", url: "", how: "in_store" },
    ]);
    expect((await search(db, scope, "costco")).map((h) => h.id)).toContain(
      filter.id,
    );
    expect((await search(db, scope, "lowes")).map((h) => h.id)).not.toContain(
      filter.id,
    );
  });

  it("go in and come out through the connector", async () => {
    const { users } = await household();
    const m = await connect(identityFor(users.member.id, "member"));
    const made = dataOf<{ id: string }>(
      await m.call("create_part", {
        category: "battery",
        fields: { size: "CR2032" },
        where_to_buy: [
          { url: "https://www.amazon.com/dp/B0", how: "online" },
          { retailer: "Batteries Plus" },
        ],
      }),
    );
    const part = dataOf<{ where_to_buy: unknown }>(
      await m.call("get_part", { part: made.id }),
    );
    expect(part.where_to_buy).toEqual([
      {
        retailer: "Amazon",
        url: "https://www.amazon.com/dp/B0",
        how: "online",
      },
      { retailer: "Batteries Plus", how: "either" },
    ]);
    await m.close();
  });
});

describe("a part's page", () => {
  it("groups paint by what's asked for, every field exactly once", () => {
    const groups = fieldGroups("paint");
    expect(groups.map((g) => g.title)).toEqual(["Colour", "Can", "Mixed At"]);
    expect(groups[0]!.fields[0]!.key).toBe("color_name");
    const keys = groups.flatMap((g) => g.fields.map((f) => f.key));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys).toHaveLength(13);
  });

  it("shows a part without groups as one", () => {
    expect(fieldGroups("bulb").map((g) => g.title)).toEqual(["Details"]);
  });
});
