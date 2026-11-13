/*
 * The list counts are correlated subqueries; drizzle renders a column unqualified
 * inside a single-table select, which once compared each child row to itself.
 * These pin the numbers.
 */

import { describe, expect, it } from "vitest";
import {
  createShareLink,
  listShareLinks,
  recordView,
} from "../lib/guide/share-links";
import { addUse, createPart, listParts } from "../lib/parts/parts";
import { createSpace } from "../lib/places/places";
import {
  addItem,
  addQuote,
  createProject,
  listProjects,
  updateItem,
} from "../lib/projects/projects";
import { createFixture } from "../lib/fixtures/fixtures";
import { db, resetBetweenTests } from "./helpers/db";
import { household } from "./helpers/fixtures";

resetBetweenTests();

describe("list counts", () => {
  it("counts the uses of each part", async () => {
    const { scope, member } = await household();
    const a = await createFixture(db, scope, member, { name: "A" });
    const b = await createFixture(db, scope, member, { name: "B" });
    const bulb = await createPart(db, scope, member, {
      category: "bulb",
      name: "Bulb",
    });
    await createPart(db, scope, member, { category: "filter", name: "Unused" });
    await addUse(db, scope, member, { supplyId: bulb.id, fixtureId: a.id });
    await addUse(db, scope, member, { supplyId: bulb.id, fixtureId: b.id });
    const rows = await listParts(db, scope);
    expect(Object.fromEntries(rows.map((r) => [r.part.name, r.uses]))).toEqual({
      Bulb: 2,
      Unused: 0,
    });
  });

  it("counts open to-dos and quotes per project", async () => {
    const { scope, member } = await household();
    const p = await createProject(db, scope, member, { title: "Panel" });
    await createProject(db, scope, member, { title: "Empty" });
    const i1 = await addItem(db, scope, member, p.id, { text: "Outlets" });
    await addItem(db, scope, member, p.id, { text: "Garage light" });
    await updateItem(db, scope, member, i1.id, { done: true });
    await addQuote(db, scope, member, p.id, { amount: "2400" });
    const rows = await listProjects(db, scope);
    const panel = rows.find((r) => r.title === "Panel")!;
    expect([panel.openItems, panel.quoteCount, panel.status]).toEqual([
      1,
      1,
      "quoted",
    ]);
    expect(rows.find((r) => r.title === "Empty")).toMatchObject({
      openItems: 0,
      quoteCount: 0,
    });
  });

  it("counts views per share link", async () => {
    const { scope, admin } = await household();
    const { link } = await createShareLink(db, scope, admin, {
      label: "Sarah",
    });
    await createShareLink(db, scope, admin, { label: "Unused" });
    await recordView(db, link, {
      ip: "203.0.113.1",
      userAgent: "x",
      atHome: false,
    });
    await recordView(db, link, {
      ip: "203.0.113.1",
      userAgent: "x",
      atHome: false,
      event: "pin_failed",
    });
    const rows = await listShareLinks(db, scope);
    expect(
      Object.fromEntries(rows.map((r) => [r.link.label, r.views])),
    ).toEqual({ Sarah: 1, Unused: 0 });
  });

  it("filters a place’s notes including notes about fixtures in it", async () => {
    const { scope, member } = await household();
    const room = await createSpace(db, scope, member, { name: "Kitchen" });
    const t = await createFixture(db, scope, member, {
      name: "Dishwasher",
      spaceId: room.id,
    });
    const { createNote, listNotes } = await import("../lib/notes/notes");
    await createNote(db, scope, member, {
      title: "Fixed hose",
      fixtureId: t.id,
    });
    await createNote(db, scope, member, { title: "Painted", spaceId: room.id });
    await createNote(db, scope, member, { title: "Elsewhere" });
    const rows = await listNotes(db, scope, { spaceId: room.id });
    expect(rows.map((r) => r.note.title).sort()).toEqual([
      "Fixed hose",
      "Painted",
    ]);
  });
});
