/*
 * What contacts do: the family's own list, labels with their casing ("HVAC"),
 * and trades typed on a contact or system joining the list.
 */

import { describe, expect, it } from "vitest";
import { createContact, getContact } from "../lib/contacts/contacts";
import {
  defaultTradeLabel,
  tradeLabeler,
  DEFAULT_TRADE_GROUPS,
} from "../lib/contacts/trade-labels";
import {
  cleanTradeGroups,
  getTradeGroups,
  saveTradeGroups,
} from "../lib/contacts/trades";
import { createSystem } from "../lib/systems/systems";
import { db, resetBetweenTests } from "./helpers/db";
import { household } from "./helpers/fixtures";

resetBetweenTests();

describe("trade labels", () => {
  it("shows acronyms in capitals and the rest in sentence case", () => {
    expect(defaultTradeLabel("hvac")).toBe("HVAC");
    expect(defaultTradeLabel("phone & tv")).toBe("Phone & TV");
    expect(defaultTradeLabel("water & sewer")).toBe("Water & sewer");
    const label = tradeLabeler([
      { label: "Mine", trades: ["ISP", "Chimney sweep"] },
    ]);
    expect(label("isp")).toBe("ISP");
    expect(label("chimney sweep")).toBe("Chimney sweep");
    expect(label("hoa")).toBe("HOA");
  });

  it("cleans a saved list: trims, drops duplicates and empty groups", () => {
    expect(
      cleanTradeGroups([
        { label: " Services ", trades: ["Plumber", " plumber ", "HVAC"] },
        { label: "", trades: ["hvac", "Vet"] },
        { label: "Empty", trades: [] },
      ]),
    ).toEqual([
      { label: "Services", trades: ["Plumber", "HVAC"] },
      { label: "Other", trades: ["Vet"] },
    ]);
    expect(() => cleanTradeGroups("nope")).toThrow();
  });
});

describe("the family’s list", () => {
  it("starts with the defaults, and can lose the HOA without touching contacts that have it", async () => {
    const { scope, member, viewer } = await household();
    expect(await getTradeGroups(db, scope)).toEqual(DEFAULT_TRADE_GROUPS);
    const hoa = await createContact(db, scope, member, {
      name: "Oak Hills HOA",
      trades: ["hoa"],
    });

    const without = DEFAULT_TRADE_GROUPS.map((g) => ({
      ...g,
      trades: g.trades.filter((t) => t !== "HOA"),
    }));
    await expect(saveTradeGroups(db, scope, viewer, without)).rejects.toThrow();
    await saveTradeGroups(db, scope, member, without);
    expect(
      (await getTradeGroups(db, scope)).flatMap((g) => g.trades),
    ).not.toContain("HOA");
    expect(
      (await getContact(db, scope, hoa.id)).trades.map((t) => t.trade),
    ).toEqual(["hoa"]);
  });

  it("adds a trade typed on a contact or a system to the list, keeping its casing", async () => {
    const { scope, member } = await household();
    const sweep = await createContact(db, scope, member, {
      name: "Sooty",
      newTrades: ["Chimney sweep", "ISP"],
      preferNew: true,
    });
    const got = await getContact(db, scope, sweep.id);
    expect(got.trades.map((t) => [t.trade, t.preferred])).toEqual([
      ["chimney sweep", true],
      ["isp", true],
    ]);
    const solar = await createSystem(db, scope, member, {
      name: "Solar",
      newTrades: ["Solar installer"],
    });
    expect(solar.trades).toEqual(["solar installer"]);
    const last = (await getTradeGroups(db, scope)).at(-1)!;
    expect(last.trades.slice(-3)).toEqual([
      "Chimney sweep",
      "ISP",
      "Solar installer",
    ]);
    // Typing one that's already listed doesn't add it twice.
    await createContact(db, scope, member, {
      name: "Other sweep",
      newTrades: ["chimney SWEEP"],
    });
    expect(
      (await getTradeGroups(db, scope))
        .flatMap((g) => g.trades)
        .filter((t) => t.toLowerCase() === "chimney sweep"),
    ).toHaveLength(1);
  });
});
