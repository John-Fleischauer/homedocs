/*
 * The core reference model, against the four questions homedocs exists to
 * answer: what bulb the living-room light takes, how much mulch the front bed
 * needs, which paint is in the bedroom, and who our plumber is.
 */

import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createSpace, deleteSpace, updateSpace } from "../lib/places/places";
import { createFixture } from "../lib/fixtures/fixtures";
import {
  addUse,
  createPart,
  listUses,
  removeUse,
  updatePart,
} from "../lib/parts/parts";
import { comingUp, createNote } from "../lib/notes/notes";
import {
  createContact,
  preferredByTrade,
  updateContact,
} from "../lib/contacts/contacts";
import { search } from "../lib/search/search";
import { listDeleted, restore } from "../lib/trash/trash";
import { deleteFixture } from "../lib/fixtures/fixtures";
import { db, resetBetweenTests } from "./helpers/db";
import { household, makeProperty } from "./helpers/fixtures";
import { supplyUses } from "../lib/db/schema";

resetBetweenTests();

describe("places, fixtures and parts", () => {
  it("shares one bulb spec across several fixtures", async () => {
    const { scope, member } = await household();
    const living = await createSpace(db, scope, member, {
      name: "Living room",
    });
    const hall = await createSpace(db, scope, member, { name: "Hallway" });
    const overhead = await createFixture(db, scope, member, {
      name: "Overhead light",
      spaceId: living.id,
    });
    const hallLight = await createFixture(db, scope, member, {
      name: "Hall light",
      spaceId: hall.id,
    });
    const bulb = await createPart(db, scope, member, {
      category: "bulb",
      name: "",
      fields: {
        base: "E26",
        shape: "A19",
        color_temp: "2700K",
        junk: "ignored",
      },
    });
    expect(bulb.name).toBe("A19 E26 2700K bulb");
    expect(bulb.fields).not.toHaveProperty("junk");

    await addUse(db, scope, member, {
      supplyId: bulb.id,
      fixtureId: overhead.id,
      quantity: "3",
    });
    await addUse(db, scope, member, {
      supplyId: bulb.id,
      fixtureId: hallLight.id,
      quantity: "1",
    });

    const uses = await listUses(db, scope, { supplyId: bulb.id });
    expect(uses.map((u) => u.owner.name).sort()).toEqual([
      "Hall light",
      "Overhead light",
    ]);
    expect(uses.find((u) => u.owner.name === "Overhead light")?.quantity).toBe(
      "3.00",
    );
  });

  it("refuses a use that names both a fixture and a place, at the database too", async () => {
    const { scope, member } = await household();
    const room = await createSpace(db, scope, member, { name: "Bedroom" });
    const fixture = await createFixture(db, scope, member, {
      name: "Lamp",
      spaceId: room.id,
    });
    const part = await createPart(db, scope, member, {
      category: "other",
      name: "Widget",
    });
    await expect(
      addUse(db, scope, member, {
        supplyId: part.id,
        fixtureId: fixture.id,
        spaceId: room.id,
      }),
    ).rejects.toThrow(/which fixture or place/);
    await expect(
      db.insert(supplyUses).values({
        propertyId: scope.propertyId,
        supplyId: part.id,
        fixtureId: fixture.id,
        spaceId: room.id,
      }),
    ).rejects.toThrow();
  });

  it("keeps paint finish per use: one colour, eggshell walls and semi-gloss trim", async () => {
    const { scope, member } = await household();
    const bedroom = await createSpace(db, scope, member, { name: "Bedroom" });
    const paint = await createPart(db, scope, member, {
      category: "paint",
      name: "",
      fields: {
        brand: "Sherwin-Williams",
        color_code: "SW 7015",
        color_name: "Repose Gray",
        formula: "B1 2Y 14",
      },
    });
    await addUse(db, scope, member, {
      supplyId: paint.id,
      spaceId: bedroom.id,
      surface: "walls",
      finish: "Eggshell",
    });
    await addUse(db, scope, member, {
      supplyId: paint.id,
      spaceId: bedroom.id,
      surface: "trim",
      finish: "Semi-gloss",
    });
    await expect(
      addUse(db, scope, member, {
        supplyId: paint.id,
        spaceId: bedroom.id,
        surface: "walls",
      }),
    ).rejects.toThrow(/already listed/);
    const uses = await listUses(db, scope, { spaceId: bedroom.id });
    expect(uses.map((u) => `${u.surface}:${u.finish}`).sort()).toEqual([
      "trim:Semi-gloss",
      "walls:Eggshell",
    ]);

    // Removing a use frees its slot.
    await removeUse(db, scope, member, uses[0]!.id);
    await addUse(db, scope, member, {
      supplyId: paint.id,
      spaceId: bedroom.id,
      surface: uses[0]!.surface,
    });
  });

  it("records mulch and the lesson for next time, and brings it back around", async () => {
    const { scope, member } = await household();
    const bed = await createSpace(db, scope, member, {
      name: "Front flowerbed",
      kind: "outdoor",
    });
    const mulch = await createPart(db, scope, member, {
      category: "landscaping",
      name: "Brown hardwood mulch",
    });
    expect(mulch.unit).toBe("bag");
    await addUse(db, scope, member, {
      supplyId: mulch.id,
      spaceId: bed.id,
      quantity: "12",
      quantityNeeded: "15",
    });
    const nextYear = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    await createNote(db, scope, member, {
      title: "Spring mulch",
      spaceId: bed.id,
      supplyId: mulch.id,
      quantity: "12",
      unit: "bag",
      nextTime: "Needed 3 more bags",
      remindAfter: nextYear,
    });
    const upcoming = await comingUp(db, scope);
    expect(upcoming.map((r) => r.note.title)).toEqual(["Spring mulch"]);
    expect(upcoming[0]!.supplyName).toBe("Brown hardwood mulch");
  });

  it("knows our plumber: one preferred contact per trade", async () => {
    const { scope, member } = await household();
    const a = await createContact(db, scope, member, {
      name: "Ace Plumbing",
      trades: ["Plumber"],
      preferred: ["plumber"],
    });
    const b = await createContact(db, scope, member, {
      name: "Bob",
      trades: ["plumber", "handyman"],
      preferred: ["plumber"],
    });
    let preferred = await preferredByTrade(db, scope);
    expect(
      preferred.filter((p) => p.trade === "plumber").map((p) => p.contact.name),
    ).toEqual(["Bob"]);
    await updateContact(db, scope, member, a.id, {
      trades: ["plumber"],
      preferred: ["plumber"],
    });
    preferred = await preferredByTrade(db, scope);
    expect(
      preferred.filter((p) => p.trade === "plumber").map((p) => p.contact.id),
    ).toEqual([a.id]);
    expect(b.id).toBeTruthy();
  });
});

describe("search", () => {
  it("finds a fixture by its room and the part it uses", async () => {
    const { scope, member } = await household();
    const living = await createSpace(db, scope, member, {
      name: "Living room",
    });
    const light = await createFixture(db, scope, member, {
      name: "Overhead light",
      spaceId: living.id,
    });
    const bulb = await createPart(db, scope, member, {
      category: "bulb",
      name: "Philips A19 LED",
    });
    await addUse(db, scope, member, { supplyId: bulb.id, fixtureId: light.id });

    const hits = await search(db, scope, "living room bulb");
    expect(hits[0]).toMatchObject({ kind: "fixture", id: light.id });
  });

  it("follows a rename through the cascade: Den → Office", async () => {
    const { scope, member } = await household();
    const den = await createSpace(db, scope, member, { name: "Den" });
    const lamp = await createFixture(db, scope, member, {
      name: "Desk lamp",
      spaceId: den.id,
    });
    const bulb = await createPart(db, scope, member, {
      category: "bulb",
      name: "Edison bulb",
    });
    await addUse(db, scope, member, { supplyId: bulb.id, fixtureId: lamp.id });

    await updateSpace(db, scope, member, den.id, { name: "Office" });
    const hits = await search(db, scope, "office bulb");
    expect(hits.map((h) => h.id)).toContain(lamp.id);
    // The old name is gone from the document (not merely outranked).
    const [doc] = [
      ...(await db.execute(
        sql`select search_doc::text as d from fixtures where id = ${lamp.id}`,
      )),
    ];
    expect((doc as { d: string }).d).not.toMatch(/'den'/);
  });

  it("follows a part rename to the fixtures that use it", async () => {
    const { scope, member } = await household();
    const lamp = await createFixture(db, scope, member, {
      name: "Porch light",
    });
    const bulb = await createPart(db, scope, member, {
      category: "bulb",
      name: "Old bulb",
    });
    await addUse(db, scope, member, { supplyId: bulb.id, fixtureId: lamp.id });
    await updatePart(db, scope, member, bulb.id, { name: "Cree BR30" });
    expect((await search(db, scope, "cree")).map((h) => h.id)).toContain(
      lamp.id,
    );
  });

  it("tolerates a typo in a name", async () => {
    const { scope, member } = await household();
    const p = await createContact(db, scope, member, { name: "Plumbing Pros" });
    const hits = await search(db, scope, "Plumbng Pro");
    expect(hits.map((h) => h.id)).toContain(p.id);
  });

  it("never crosses into another property", async () => {
    const { scope, member } = await household();
    const other = await makeProperty("Cabin");
    await createSpace(db, other, member, { name: "Cabin kitchen" });
    await createSpace(db, scope, member, { name: "Kitchen" });
    const hits = await search(db, scope, "kitchen");
    expect(hits.map((h) => h.title)).toEqual(["Kitchen"]);
  });
});

describe("roles, deletes and restore", () => {
  it("lets a viewer look but not change", async () => {
    const { scope, viewer } = await household();
    await expect(
      createSpace(db, scope, viewer, { name: "Attic" }),
    ).rejects.toThrow(/Viewers can look/);
  });

  it("refuses to delete a place with fixtures in it, and restores what was deleted", async () => {
    const { scope, member } = await household();
    const garage = await createSpace(db, scope, member, { name: "Garage" });
    const opener = await createFixture(db, scope, member, {
      name: "Door opener",
      spaceId: garage.id,
    });
    await expect(deleteSpace(db, scope, member, garage.id)).rejects.toThrow(
      /Move or delete the 1 fixture/,
    );

    await deleteFixture(db, scope, member, opener.id);
    await deleteSpace(db, scope, member, garage.id);
    const trash = await listDeleted(db, scope);
    expect(trash.map((t) => t.title).sort()).toEqual(["Door opener", "Garage"]);

    await restore(db, scope, member, "place", garage.id);
    await restore(db, scope, member, "fixture", opener.id);
    expect(
      (await search(db, scope, "garage opener")).map((h) => h.id),
    ).toContain(opener.id);
  });

  it("refuses a stale edit", async () => {
    const { scope, member } = await household();
    const room = await createSpace(db, scope, member, { name: "Bath" });
    await updateSpace(db, scope, member, room.id, { name: "Main bath" });
    await expect(
      updateSpace(
        db,
        scope,
        member,
        room.id,
        { name: "Hall bath" },
        room.updatedAt,
      ),
    ).rejects.toThrow(/Someone else just edited/);
  });

  it("refuses to move a place inside itself", async () => {
    const { scope, member } = await household();
    const house = await createSpace(db, scope, member, { name: "House" });
    const floor = await createSpace(db, scope, member, {
      name: "Upstairs",
      parentId: house.id,
    });
    await expect(
      updateSpace(db, scope, member, house.id, { parentId: floor.id }),
    ).rejects.toThrow(/inside itself/);
  });

  it("writes an audit row with every change", async () => {
    const { scope, member } = await household();
    await createSpace(db, scope, member, { name: "Laundry" });
    const rows = await db.execute(
      sql`select action, entity_type from audit_log`,
    );
    expect([...rows]).toEqual([{ action: "create", entity_type: "space" }]);
  });
});
