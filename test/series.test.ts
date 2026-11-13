/*
 * Series: a job done every year. Each round starts from the series' places,
 * checklist, materials and contact; an open round shows what it changed and
 * can send those changes back, one row or all, against the series as the
 * person saw it.
 */

import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createContact } from "../lib/contacts/contacts";
import { StaleWriteError } from "../lib/core/types";
import { auditLog, materials } from "../lib/db/schema";
import { createNote } from "../lib/notes/notes";
import { createPart, updatePart } from "../lib/parts/parts";
import { createSpace } from "../lib/places/places";
import {
  addMaterial,
  copySeriesLineToProject,
  removeMaterial,
  updateMaterial,
  updateSeriesFromProject,
} from "../lib/projects/materials";
import {
  addItem,
  createProject,
  getProject,
  setProjectStatus,
  updateItem,
} from "../lib/projects/projects";
import {
  addSeriesItem,
  appendLessonToHowTo,
  createSeries,
  createSeriesFromProject,
  deleteSeries,
  getSeries,
  nextTitle,
  seriesNotes,
} from "../lib/projects/series";
import { search } from "../lib/search/search";
import { restore } from "../lib/trash/trash";
import { db, resetBetweenTests } from "./helpers/db";
import { household } from "./helpers/fixtures";

resetBetweenTests();

async function pineStraw(
  scope: { propertyId: string },
  actor: Parameters<typeof createSeries>[2],
) {
  const yard = await createSpace(db, scope, actor, {
    name: "Back yard",
    kind: "outdoor",
  });
  const part = await createPart(db, scope, actor, {
    category: "landscaping",
    name: "Pine straw",
    unit: "roll",
    extraUnits: ["bale"],
  });
  const series = await createSeries(db, scope, actor, {
    title: "Back yard pine straw",
    howTo: "Unroll along the stair edge first.",
    spaceIds: [yard.id],
  });
  const stairs = await addMaterial(
    db,
    scope,
    actor,
    { seriesId: series.id },
    { supplyId: part.id, quantity: "8", notes: "around the stairs" },
  );
  const deck = await addMaterial(
    db,
    scope,
    actor,
    { seriesId: series.id },
    { supplyId: part.id, quantity: "5", notes: "around the deck" },
  );
  const rake = await addSeriesItem(db, scope, actor, series.id, {
    text: "Rake out old straw",
  });
  return { yard, part, series, stairs, deck, rake };
}

function lines(project: Awaited<ReturnType<typeof getProject>>) {
  return project.materials.map((m) =>
    `${m.name} ${Number(m.quantity)} ${m.unit} ${m.notes}`.trim(),
  );
}

describe("series", () => {
  it("runs the pine straw year: a one-off roll, 8 → 7 sent back, and next year starts from 7 and 5", async () => {
    const { scope, member } = await household();
    const { series, part } = await pineStraw(scope, member);

    // Year one starts from the series.
    const y1 = await createProject(db, scope, member, {
      title: "Back yard pine straw 2027",
      status: "scheduled",
      seriesId: series.id,
    });
    let p1 = await getProject(db, scope, y1.id);
    expect(lines(p1)).toEqual([
      "Pine straw 8 roll around the stairs",
      "Pine straw 5 roll around the deck",
    ]);
    expect(p1.items.map((i) => i.item.text)).toEqual(["Rake out old straw"]);
    expect(p1.places.map((p) => p.name)).toEqual(["Back yard"]);
    expect(p1.series?.howTo).toBe("Unroll along the stair edge first.");
    expect(p1.diff?.differs).toBe(0);

    // An extra roll for the flowerbeds, this year only; the stairs only took 7.
    await addMaterial(
      db,
      scope,
      member,
      { projectId: y1.id },
      { supplyId: part.id, quantity: "1", notes: "flowerbeds", oneOff: true },
    );
    const stairs = p1.materials.find((m) => m.notes === "around the stairs")!;
    await updateMaterial(db, scope, member, stairs.id, { quantity: "7" });
    // A one-off to-do, and a reworded one.
    await addItem(db, scope, member, y1.id, {
      text: "Weed the flowerbeds",
      oneOff: true,
    });
    await updateItem(db, scope, member, p1.items[0]!.item.id, {
      text: "Rake out old straw first — it mats down",
    });

    p1 = await getProject(db, scope, y1.id);
    expect(p1.diff!.materials.rows[stairs.id]).toMatchObject({
      status: "changed",
      changes: [{ field: "quantity", before: "8", after: "7" }],
    });
    const oneOff = p1.materials.find((m) => m.oneOff)!;
    expect(p1.diff!.materials.rows[oneOff.id]!.status).toBe("one_off");
    expect(p1.diff!.differs).toBe(2); // the stairs line and the reworded to-do

    // Send back only the stairs line.
    await updateSeriesFromProject(
      db,
      scope,
      member,
      y1.id,
      { materials: [stairs.id] },
      p1.diff!.seriesUpdatedAt,
    );
    p1 = await getProject(db, scope, y1.id);
    expect(p1.diff!.materials.rows[stairs.id]!.status).toBe("same");
    expect(p1.diff!.differs).toBe(1);
    // …and then the to-do too, through "all", which leaves the one-offs behind.
    await updateSeriesFromProject(
      db,
      scope,
      member,
      y1.id,
      "all",
      p1.diff!.seriesUpdatedAt,
    );
    await setProjectStatus(db, scope, member, y1.id, "done");

    // Year two: 7 and 5, the reworded to-do, no flowerbed roll or weeding.
    const y2 = await createProject(db, scope, member, {
      title: await nextTitle(db, scope, series),
      seriesId: series.id,
    });
    const p2 = await getProject(db, scope, y2.id);
    expect(lines(p2)).toEqual([
      "Pine straw 7 roll around the stairs",
      "Pine straw 5 roll around the deck",
    ]);
    expect(p2.items.map((i) => i.item.text)).toEqual([
      "Rake out old straw first — it mats down",
    ]);

    // Year one is finished: a record, not a proposal.
    expect((await getProject(db, scope, y1.id)).diff).toBeNull();
    await expect(
      updateSeriesFromProject(db, scope, member, y1.id, "all", undefined),
    ).rejects.toThrow("This project is finished");

    // The series history lines the stairs up across years.
    const s = await getSeries(db, scope, series.id);
    const stairsLine = s.materials.find(
      (m) => m.notes === "around the stairs",
    )!;
    const byYear = s.projects.map((p) =>
      Number(
        p.materials.find((m) => m.seriesMaterialId === stairsLine.id)?.quantity,
      ),
    );
    expect(byYear).toEqual([7, 7]); // newest first: year two copied 7; year one was changed to 7
    expect(s.projects.map((p) => p.title)).toEqual([
      p2.title,
      "Back yard pine straw 2027",
    ]);
  });

  it("limits a part-linked line to the part’s units; a free line takes any", async () => {
    const { scope, member } = await household();
    const { series, part } = await pineStraw(scope, member);
    const bale = await addMaterial(
      db,
      scope,
      member,
      { seriesId: series.id },
      { supplyId: part.id, quantity: "2", unit: "Bale" },
    );
    expect(bale.unit).toBe("bale");
    await expect(
      addMaterial(
        db,
        scope,
        member,
        { seriesId: series.id },
        { supplyId: part.id, unit: "bag" },
      ),
    ).rejects.toThrow("Pine straw comes by roll or bale.");
    const free = await addMaterial(
      db,
      scope,
      member,
      { seriesId: series.id },
      { name: "Landscape staples", quantity: "1", unit: "box" },
    );
    expect(free.unit).toBe("box");
    // A series line cannot be "only this project".
    await expect(
      addMaterial(
        db,
        scope,
        member,
        { seriesId: series.id },
        { name: "x", oneOff: true },
      ),
    ).rejects.toThrow("Only a project");
    // Extra units are tidied.
    const tidy = await updatePart(db, scope, member, part.id, {
      extraUnits: [" bale ", "Bale", "roll", ""],
    });
    expect(tidy.extraUnits).toEqual(["bale"]);
  });

  it("reports added and missing lines, and settles each either way", async () => {
    const { scope, member } = await household();
    const { series } = await pineStraw(scope, member);
    const y = await createProject(db, scope, member, {
      title: "This year",
      seriesId: series.id,
    });
    let p = await getProject(db, scope, y.id);
    const deck = p.materials.find((m) => m.notes === "around the deck")!;
    const added = await addMaterial(
      db,
      scope,
      member,
      { projectId: y.id },
      { name: "Edging stakes", quantity: "10" },
    );
    await removeMaterial(db, scope, member, deck.id);

    p = await getProject(db, scope, y.id);
    expect(p.diff!.materials.rows[added.id]!.status).toBe("added");
    expect(p.diff!.materials.missing).toEqual([deck.seriesMaterialId]);

    // Put the deck back after all; send the stakes to the series.
    await copySeriesLineToProject(db, scope, member, y.id, {
      material: deck.seriesMaterialId!,
    });
    p = await getProject(db, scope, y.id);
    await updateSeriesFromProject(
      db,
      scope,
      member,
      y.id,
      { materials: [added.id] },
      p.diff!.seriesUpdatedAt,
    );
    p = await getProject(db, scope, y.id);
    expect(p.diff!.differs).toBe(0);
    expect(
      (await getSeries(db, scope, series.id)).materials.map((m) => m.name),
    ).toContain("Edging stakes");

    // Dropping a line from the series: remove it here, then send the removal back.
    const stakes = p.materials.find((m) => m.name === "Edging stakes")!;
    await removeMaterial(db, scope, member, stakes.id);
    p = await getProject(db, scope, y.id);
    await updateSeriesFromProject(
      db,
      scope,
      member,
      y.id,
      { materials: [stakes.seriesMaterialId!] },
      p.diff!.seriesUpdatedAt,
    );
    expect(
      (await getSeries(db, scope, series.id)).materials.map((m) => m.name),
    ).not.toContain("Edging stakes");
  });

  it("refuses to update a series someone changed since the dialog opened, and writes nothing", async () => {
    const { scope, member, admin } = await household();
    const { series } = await pineStraw(scope, member);
    const y = await createProject(db, scope, member, {
      title: "This year",
      seriesId: series.id,
    });
    const p = await getProject(db, scope, y.id);
    const stairs = p.materials.find((m) => m.notes === "around the stairs")!;
    await updateMaterial(db, scope, member, stairs.id, { quantity: "9" });
    const seen = (await getProject(db, scope, y.id)).diff!.seriesUpdatedAt;

    await addSeriesItem(db, scope, admin, series.id, { text: "Water it in" }); // someone else, meanwhile
    await expect(
      updateSeriesFromProject(db, scope, member, y.id, "all", seen),
    ).rejects.toBeInstanceOf(StaleWriteError);
    const [line] = await db
      .select()
      .from(materials)
      .where(eq(materials.id, stairs.seriesMaterialId!));
    expect(Number(line!.quantity)).toBe(8);
  });

  it("keeps viewers and other houses out", async () => {
    const { scope, member, viewer } = await household();
    const { series, part } = await pineStraw(scope, member);
    const y = await createProject(db, scope, member, {
      title: "This year",
      seriesId: series.id,
    });
    await expect(
      addMaterial(db, scope, viewer, { projectId: y.id }, { name: "x" }),
    ).rejects.toThrow("Viewers can look");
    await expect(
      updateSeriesFromProject(db, scope, viewer, y.id, "all", undefined),
    ).rejects.toThrow("Viewers can look");

    const other = await household();
    await expect(getSeries(db, other.scope, series.id)).rejects.toThrow(
      "no longer exists",
    );
    await expect(
      createProject(db, other.scope, other.member, {
        title: "Theirs",
        seriesId: series.id,
      }),
    ).rejects.toThrow("no longer exists");
    const theirs = await createSeries(db, other.scope, other.member, {
      title: "Theirs",
    });
    await expect(
      addMaterial(
        db,
        other.scope,
        other.member,
        { seriesId: theirs.id },
        { supplyId: part.id },
      ),
    ).rejects.toThrow("That part no longer exists");
    await expect(
      addMaterial(
        db,
        other.scope,
        other.member,
        { projectId: y.id },
        { name: "x" },
      ),
    ).rejects.toThrow("no longer exists");
  });

  it("audits the series update, finds rounds by material, and restores a deleted series", async () => {
    const { scope, member } = await household();
    const { series } = await pineStraw(scope, member);
    const y = await createProject(db, scope, member, {
      title: "Spring tidy",
      seriesId: series.id,
    });
    const p = await getProject(db, scope, y.id);
    const stairs = p.materials.find((m) => m.notes === "around the stairs")!;
    await updateMaterial(db, scope, member, stairs.id, { quantity: "7" });
    await updateSeriesFromProject(db, scope, member, y.id, "all", undefined);
    const rows = await db
      .select()
      .from(auditLog)
      .where(
        and(
          eq(auditLog.entityType, "material"),
          eq(auditLog.entityId, stairs.seriesMaterialId!),
        ),
      );
    expect(rows.find((r) => r.action === "update")).toMatchObject({
      before: { quantity: "8.00" },
      after: { quantity: "7.00" },
    });

    const hits = await search(db, scope, "pine straw");
    expect(hits.map((h) => `${h.kind}:${h.title}`)).toEqual(
      expect.arrayContaining([
        "series:Back yard pine straw",
        "project:Spring tidy",
      ]),
    );

    await deleteSeries(db, scope, member, series.id);
    expect((await getProject(db, scope, y.id)).series).toBeNull();
    expect((await getProject(db, scope, y.id)).diff).toBeNull();
    await restore(db, scope, member, "series", series.id);
    expect((await getProject(db, scope, y.id)).series?.title).toBe(
      "Back yard pine straw",
    );
  });

  it("shows last time’s lessons on the next round, and adds one to the how-to", async () => {
    const { scope, member } = await household();
    const { series } = await pineStraw(scope, member);
    const y1 = await createProject(db, scope, member, {
      title: "Year one",
      seriesId: series.id,
    });
    const note = await createNote(db, scope, member, {
      title: "Pine straw done",
      projectId: y1.id,
      nextTime: "Order one extra roll.",
    });
    await createNote(db, scope, member, {
      title: "Bought straw",
      projectId: y1.id,
    });
    const y2 = await createProject(db, scope, member, {
      title: "Year two",
      seriesId: series.id,
    });

    const p2 = await getProject(db, scope, y2.id);
    expect(p2.lessons.map((l) => l.note.nextTime)).toEqual([
      "Order one extra roll.",
    ]);
    expect((await getProject(db, scope, y1.id)).lessons).toEqual([]);
    expect(
      (await seriesNotes(db, scope, series.id)).map((n) => n.note.title).sort(),
    ).toEqual(["Bought straw", "Pine straw done"]);

    const stale = p2.series!.updatedAt;
    await appendLessonToHowTo(db, scope, member, note.id, stale);
    expect((await getSeries(db, scope, series.id)).howTo).toBe(
      "Unroll along the stair edge first.\n\nOrder one extra roll.",
    );
    await expect(
      appendLessonToHowTo(db, scope, member, note.id, stale),
    ).rejects.toBeInstanceOf(StaleWriteError);
    await expect(
      appendLessonToHowTo(db, scope, member, note.id),
    ).rejects.toThrow("already in the instructions");
  });

  it("makes a series from an existing project, leaving its one-offs behind", async () => {
    const { scope, member } = await household();
    const crew = await createContact(db, scope, member, { name: "Yard crew" });
    const y = await createProject(db, scope, member, {
      title: "Front bed mulch 2026",
      summary: '3" deep by the stairs',
      contactId: crew.id,
    });
    await addMaterial(
      db,
      scope,
      member,
      { projectId: y.id },
      { name: "Mulch", quantity: "14", unit: "bag" },
    );
    await addMaterial(
      db,
      scope,
      member,
      { projectId: y.id },
      { name: "Weed fabric", quantity: "1", oneOff: true },
    );
    await addItem(db, scope, member, y.id, { text: "Edge the bed" });

    const series = await createSeriesFromProject(db, scope, member, y.id);
    const s = await getSeries(db, scope, series.id);
    expect(s.title).toBe("Front bed mulch");
    expect(s.howTo).toBe('3" deep by the stairs');
    expect(s.contact?.name).toBe("Yard crew");
    expect(s.materials.map((m) => m.name)).toEqual(["Mulch"]);
    expect(s.items.map((i) => i.item.text)).toEqual(["Edge the bed"]);
    expect((await getProject(db, scope, y.id)).diff?.differs).toBe(0);
    await expect(
      createSeriesFromProject(db, scope, member, y.id),
    ).rejects.toThrow("already part of a series");

    const next = await createProject(db, scope, member, {
      title: await nextTitle(db, scope, s),
      seriesId: series.id,
    });
    expect((await getProject(db, scope, next.id)).contact?.name).toBe(
      "Yard crew",
    );
  });
});
