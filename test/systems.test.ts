/*
 * Systems: the second way into the house, and the handoff. "Water & plumbing"
 * gathers the main shutoff, the water heater, the plumber and the parts.
 */

import { describe, expect, it } from "vitest";
import { createContact } from "../lib/contacts/contacts";
import {
  createFixture,
  getFixture,
  updateFixture,
} from "../lib/fixtures/fixtures";
import { buildGuide } from "../lib/guide/guide";
import { offlineHtml } from "../lib/guide/offline";
import { addUse, createPart } from "../lib/parts/parts";
import { createSpace } from "../lib/places/places";
import { search } from "../lib/search/search";
import { guessSystemKey } from "../lib/systems/seeds";
import {
  createSystem,
  deleteSystem,
  listSystems,
  systemOverview,
  updateSystem,
} from "../lib/systems/systems";
import { restore } from "../lib/trash/trash";
import { db, resetBetweenTests } from "./helpers/db";
import { household } from "./helpers/fixtures";
import { connect, dataOf, identityFor } from "./helpers/mcp";

resetBetweenTests();

async function water(scope: { propertyId: string }) {
  const systems = await listSystems(db, scope);
  return systems.find((s) => s.name === "Water & plumbing")!;
}

describe("systems", () => {
  it("starts every home with the usual systems", async () => {
    const { scope } = await household();
    expect((await listSystems(db, scope)).map((s) => s.name)).toEqual([
      "Water & plumbing",
      "Electrical",
      "Heating & cooling",
      "Gas",
      "Sewer & septic",
      "Irrigation",
      "Safety & security",
      "Internet & Wi-Fi",
    ]);
  });

  it("guesses a fixture’s system from its kind and name, and leaves it alone when told", async () => {
    expect(guessSystemKey("Shutoff valve", "Main water shutoff")).toBe("water");
    expect(guessSystemKey("Shutoff valve", "Gas shutoff")).toBe("gas");
    expect(guessSystemKey("Water heater", "Gas water heater")).toBe("water");
    expect(guessSystemKey("", "Irrigation shutoff")).toBe("irrigation");
    expect(guessSystemKey("Electrical panel", "Breaker box")).toBe(
      "electrical",
    );
    expect(guessSystemKey("HVAC", "Upstairs furnace")).toBe("hvac");
    expect(guessSystemKey("Light fixture", "Overhead light")).toBeNull();

    const { scope, member } = await household();
    const shutoff = await createFixture(db, scope, member, {
      name: "Main water shutoff",
      category: "Shutoff valve",
    });
    expect((await getFixture(db, scope, shutoff.id)).system?.name).toBe(
      "Water & plumbing",
    );
    const light = await createFixture(db, scope, member, {
      name: "Overhead light",
      category: "Light fixture",
    });
    expect(light.systemId).toBeNull();
    const none = await createFixture(db, scope, member, {
      name: "Gas shutoff",
      systemId: null,
    });
    expect(none.systemId).toBeNull();
  });

  it("gathers a system’s fixtures, guide ones first, with the parts they take and who to call", async () => {
    const { scope, member } = await household();
    const basement = await createSpace(db, scope, member, { name: "Basement" });
    const heater = await createFixture(db, scope, member, {
      name: "Water heater",
      category: "Water heater",
      spaceId: basement.id,
    });
    const shutoff = await createFixture(db, scope, member, {
      name: "Main water shutoff",
      spaceId: basement.id,
      inGuide: true,
      guideNote: "Turn the red handle a quarter turn.",
    });
    const anode = await createPart(db, scope, member, {
      category: "other",
      name: "Anode rod",
    });
    await addUse(db, scope, member, {
      supplyId: anode.id,
      fixtureId: heater.id,
    });
    await createContact(db, scope, member, {
      name: "Ace Plumbing",
      phones: [{ label: "", value: "555-0100" }],
      trades: ["plumber"],
      preferred: ["plumber"],
    });
    await createContact(db, scope, member, {
      name: "Bob the plumber",
      trades: ["plumber"],
    });
    await createContact(db, scope, member, {
      name: "City Water",
      phones: [{ label: "", value: "555-0199" }],
      trades: ["water & sewer"],
    });

    const o = await systemOverview(db, scope, (await water(scope)).id);
    expect(o.fixtures.map((f) => f.name)).toEqual([
      "Main water shutoff",
      "Water heater",
    ]);
    expect(o.fixtures[0]).toMatchObject({
      id: shutoff.id,
      where: "Basement",
      inGuide: true,
    });
    expect(o.parts).toEqual([
      expect.objectContaining({ name: "Anode rod", usedBy: ["Water heater"] }),
    ]);
    // The preferred plumber only; for water & sewer there is no preferred one, so whoever has the trade.
    expect(o.contacts.map((c) => [c.name, c.trade, c.phone])).toEqual([
      ["Ace Plumbing", "plumber", "555-0100"],
      ["City Water", "water & sewer", "555-0199"],
    ]);
  });

  it("makes fixtures findable by their system, through renames, deletes and restores", async () => {
    const { scope, member } = await household();
    const shutoff = await createFixture(db, scope, member, {
      name: "Main shutoff",
      category: "Shutoff valve",
    });
    const hits = await search(db, scope, "plumbing");
    expect(hits.map((h) => [h.kind, h.title])).toEqual(
      expect.arrayContaining([
        ["system", "Water & plumbing"],
        ["fixture", "Main shutoff"],
      ]),
    );

    const system = await water(scope);
    await updateSystem(db, scope, member, system.id, { name: "Waterworks" });
    expect((await search(db, scope, "waterworks")).map((h) => h.id)).toContain(
      shutoff.id,
    );

    await deleteSystem(db, scope, member, system.id);
    expect(
      (await search(db, scope, "waterworks")).map((h) => h.id),
    ).not.toContain(shutoff.id);
    expect((await getFixture(db, scope, shutoff.id)).system).toBeNull();

    await restore(db, scope, member, "system", system.id);
    expect((await search(db, scope, "waterworks")).map((h) => h.id)).toContain(
      shutoff.id,
    );
  });

  it("lets the family add their own, and move a fixture into it", async () => {
    const { scope, member, viewer } = await household();
    await expect(
      createSystem(db, scope, viewer, { name: "Pool" }),
    ).rejects.toThrow();
    const pool = await createSystem(db, scope, member, {
      name: "Pool",
      icon: "water",
      trades: "Pool, pool",
    });
    expect(pool).toMatchObject({
      name: "Pool",
      icon: "water",
      trades: ["pool"],
    });
    const pump = await createFixture(db, scope, member, { name: "Pool pump" });
    await updateFixture(db, scope, member, pump.id, { systemId: pool.id });
    expect(
      (await systemOverview(db, scope, pool.id)).fixtures.map((f) => f.name),
    ).toEqual(["Pool pump"]);
    await expect(
      updateFixture(db, scope, member, pump.id, {
        systemId: crypto.randomUUID(),
      }),
    ).rejects.toThrow(/no longer exists/);
  });

  it("groups the guide’s emergency card by system, with the call button under each", async () => {
    const { scope, member } = await household();
    await createFixture(db, scope, member, {
      name: "Main water shutoff",
      inGuide: true,
      guideNote: "Quarter turn.",
    });
    await createFixture(db, scope, member, {
      name: "Breaker panel",
      category: "Electrical panel",
      inGuide: true,
    });
    await createFixture(db, scope, member, {
      name: "Spare key spot",
      inGuide: true,
    });
    await createFixture(db, scope, member, { name: "Water softener" }); // not on the guide
    await createContact(db, scope, member, {
      name: "Ace Plumbing",
      phones: [{ label: "", value: "555-0100" }],
      trades: ["plumber"],
      preferred: ["plumber"],
    });
    // Has the trade but isn't preferred or on the guide: not offered to a housesitter.
    await createContact(db, scope, member, {
      name: "Sparky",
      phones: [{ label: "", value: "555-0111" }],
      trades: ["electrician"],
    });

    const guide = await buildGuide(db, scope, { unlocked: false });
    expect(
      guide.groups.map((g) => [
        g.name,
        g.fixtures.map((f) => f.name),
        g.calls.map((c) => c.name),
      ]),
    ).toEqual([
      ["Water & plumbing", ["Main water shutoff"], ["Ace Plumbing"]],
      ["Electrical", ["Breaker panel"], []],
      ["Around the house", ["Spare key spot"], []],
    ]);
    const html = offlineHtml(guide, new Date(Date.now() + 86_400_000));
    expect(html).toContain("<h3>Water &amp; plumbing</h3>");
    expect(html).toContain(
      'Call <a href="tel:5550100">Ace Plumbing: 555-0100</a>',
    );
  });

  it('answers "where is the water shutoff" over MCP', async () => {
    const { scope, member, users } = await household();
    await createFixture(db, scope, member, {
      name: "Main water shutoff",
      inGuide: true,
      guideNote: "Quarter turn.",
    });
    const mcp = await connect(identityFor(users.member.id, "member"));
    try {
      const listed = dataOf(await mcp.call("list_systems")) as {
        systems: { name: string; fixtures: number }[];
      };
      expect(
        listed.systems.find((s) => s.name === "Water & plumbing")?.fixtures,
      ).toBe(1);
      const got = dataOf(
        await mcp.call("get_system", { system: "water & plumbing" }),
      ) as {
        fixtures: { name: string; housesitter_note?: string }[];
      };
      expect(got.fixtures).toEqual([
        expect.objectContaining({
          name: "Main water shutoff",
          housesitter_note: "Quarter turn.",
        }),
      ]);
      const made = dataOf(
        await mcp.call("create_fixture", {
          name: "Furnace",
          system: "Heating & cooling",
        }),
      ) as { system_id: string };
      expect(made.system_id).toBe(
        (await listSystems(db, scope)).find(
          (s) => s.name === "Heating & cooling",
        )!.id,
      );
    } finally {
      await mcp.close();
    }
  });
});
