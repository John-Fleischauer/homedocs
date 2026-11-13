/*
 * Write tools (homedocs:write). Each calls the same domain function the web app
 * does, so the same validation, audit row (source: mcp) and search rebuild
 * happen. Nothing here deletes: removing fixtures is done in the app, where
 * "Recently deleted" is one tap away.
 */

import { z } from "zod";
import { createNote } from "../../notes/notes";
import { addUse, createPart } from "../../parts/parts";
import { CATEGORIES, TEMPLATES } from "../../parts/templates";
import { createContact } from "../../contacts/contacts";
import { createSpace } from "../../places/places";
import { addMaterial } from "../../projects/materials";
import {
  addItem,
  createProject,
  setProjectStatus,
  STATUSES,
} from "../../projects/projects";
import { getSeries, nextTitle } from "../../projects/series";
import { createFixture } from "../../fixtures/fixtures";
import { scopeOf } from "./read";
import { optionalRef, resolveRef } from "./resolve";
import { defineTool, ToolRefusal } from "./types";

const ref = (what: string) =>
  z.string().min(1).describe(`The ${what}'s id, or its name`);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export const writeTools = [
  defineTool({
    name: "add_note",
    title: "Add a note",
    description:
      "Record something that happened — mulch put down, a filter changed, a repair — optionally about a place, " +
      'fixture, part, contact or project, with a quantity, cost, and a "next time" lesson and reminder date.',
    scope: "homedocs:write",
    input: z.object({
      title: z.string().min(1).max(200),
      happened_on: day.optional().describe("Defaults to today"),
      place: ref("place").optional(),
      fixture: ref("fixture").optional(),
      part: ref("part").optional(),
      contact: ref("contact").optional(),
      project: ref("project").optional(),
      quantity: z.number().nonnegative().optional(),
      unit: z.string().max(30).optional(),
      cost: z.number().nonnegative().optional(),
      next_time: z
        .string()
        .max(2000)
        .optional()
        .describe('The lesson for next time, e.g. "needed 3 more bags"'),
      remind_after: day.optional().describe("When to bring the lesson back up"),
      details: z.string().max(20_000).optional(),
    }),
    handler: async (input, ctx) => {
      const scope = await scopeOf(ctx);
      const note = await createNote(ctx.exec, scope, ctx.actor, {
        title: input.title,
        happenedOn: input.happened_on,
        spaceId: await optionalRef(ctx.exec, scope, "place", input.place),
        fixtureId: await optionalRef(ctx.exec, scope, "fixture", input.fixture),
        supplyId: await optionalRef(ctx.exec, scope, "part", input.part),
        contactId: await optionalRef(ctx.exec, scope, "contact", input.contact),
        projectId: await optionalRef(ctx.exec, scope, "project", input.project),
        quantity: input.quantity?.toString(),
        unit: input.unit,
        cost: input.cost?.toString(),
        nextTime: input.next_time,
        remindAfter: input.remind_after,
        body: input.details,
      });
      return { id: note.id, title: note.title, date: note.happenedOn };
    },
  }),

  defineTool({
    name: "create_place",
    title: "Create a place",
    description:
      "Add a room, floor or outdoor area, optionally inside another place.",
    scope: "homedocs:write",
    input: z.object({
      name: z.string().min(1).max(200),
      inside: ref("parent place").optional(),
      kind: z.enum(["room", "floor", "outdoor", "area", "other"]).optional(),
      notes: z.string().max(20_000).optional(),
    }),
    handler: async (input, ctx) => {
      const scope = await scopeOf(ctx);
      const row = await createSpace(ctx.exec, scope, ctx.actor, {
        name: input.name,
        parentId: await optionalRef(ctx.exec, scope, "place", input.inside),
        kind: input.kind,
        notes: input.notes,
      });
      return { id: row.id, name: row.name };
    },
  }),

  defineTool({
    name: "create_fixture",
    title: "Create a fixture",
    description:
      "Add an installed fixture (light, fan, shutoff valve, appliance) in a place. Serial numbers and warranties belong in Homebox.",
    scope: "homedocs:write",
    input: z.object({
      name: z.string().min(1).max(200),
      place: ref("place")
        .optional()
        .describe("Leave out for whole-house fixtures like the main shutoff"),
      system: ref("system")
        .optional()
        .describe(
          "Water & plumbing, Electrical… (list_systems). Left out, it is guessed from the name and category",
        ),
      category: z.string().max(100).optional(),
      notes: z.string().max(20_000).optional(),
    }),
    handler: async (input, ctx) => {
      const scope = await scopeOf(ctx);
      const row = await createFixture(ctx.exec, scope, ctx.actor, {
        name: input.name,
        spaceId: await optionalRef(ctx.exec, scope, "place", input.place),
        systemId: input.system
          ? await optionalRef(ctx.exec, scope, "system", input.system)
          : undefined,
        category: input.category,
        notes: input.notes,
      });
      return { id: row.id, name: row.name, system_id: row.systemId };
    },
  }),

  defineTool({
    name: "create_part",
    title: "Create a part",
    description:
      `Define a reusable part once (then link it with link_part). Categories: ${CATEGORIES.join(", ")}. ` +
      `Fields by category — ${CATEGORIES.map((c) => `${c}: ${TEMPLATES[c].fields.map((f) => f.key).join(", ")}`).join("; ")}. ` +
      "Paint `sheen` is what the can says; the sheen on a wall goes as `finish` on link_part.",
    scope: "homedocs:write",
    input: z.object({
      category: z.enum(CATEGORIES as [string, ...string[]]),
      name: z
        .string()
        .max(200)
        .optional()
        .describe("Made from the fields when left out"),
      fields: z.record(z.string(), z.string()).optional(),
      units: z
        .array(z.string().min(1).max(30))
        .max(9)
        .optional()
        .describe('Units it is sold by, the usual one first: ["roll", "bale"]'),
      buy_url: z.string().max(2000).optional(),
      notes: z.string().max(20_000).optional(),
    }),
    handler: async (input, ctx) => {
      const scope = await scopeOf(ctx);
      const row = await createPart(ctx.exec, scope, ctx.actor, {
        category: input.category,
        name: input.name ?? "",
        fields: input.fields,
        unit: input.units?.[0],
        extraUnits: input.units?.slice(1),
        buyUrl: input.buy_url,
        notes: input.notes,
      });
      return { id: row.id, name: row.name, fields: row.fields };
    },
  }),

  defineTool({
    name: "link_part",
    title: "Link a part",
    description:
      "Say that a fixture or place uses a part: the overhead light takes 3 of this bulb; the bedroom walls are this " +
      "paint in eggshell; the front bed took 12 bags (really needs 15).",
    scope: "homedocs:write",
    input: z.object({
      part: ref("part"),
      fixture: ref("fixture").optional(),
      place: ref("place").optional(),
      quantity: z.number().nonnegative().optional(),
      unit: z.string().max(30).optional(),
      really_needs: z.number().nonnegative().optional(),
      surface: z.string().max(100).optional().describe("walls, trim, ceiling…"),
      finish: z
        .string()
        .max(60)
        .optional()
        .describe("Paint sheen: eggshell, semi-gloss…"),
      notes: z.string().max(2000).optional(),
    }),
    handler: async (input, ctx) => {
      const scope = await scopeOf(ctx);
      if (Boolean(input.fixture) === Boolean(input.place))
        throw new ToolRefusal("Give exactly one of fixture or place.");
      const use = await addUse(ctx.exec, scope, ctx.actor, {
        supplyId: await resolveRef(ctx.exec, scope, "part", input.part),
        fixtureId: await optionalRef(ctx.exec, scope, "fixture", input.fixture),
        spaceId: await optionalRef(ctx.exec, scope, "place", input.place),
        quantity: input.quantity?.toString(),
        unit: input.unit,
        quantityNeeded: input.really_needs?.toString(),
        surface: input.surface,
        finish: input.finish,
        notes: input.notes,
      });
      return { id: use.id };
    },
  }),

  defineTool({
    name: "create_contact",
    title: "Create a contact",
    description:
      "Add a contractor, service or contact, with trades and which trades they are our go-to for.",
    scope: "homedocs:write",
    input: z.object({
      name: z.string().min(1).max(200),
      company: z.string().max(200).optional(),
      phone: z.string().max(60).optional(),
      email: z.string().max(200).optional(),
      website: z.string().max(2000).optional(),
      trades: z.array(z.string().max(60)).max(12).optional(),
      preferred_for: z
        .array(z.string().max(60))
        .max(12)
        .optional()
        .describe("Trades they are our go-to for"),
      notes: z.string().max(20_000).optional(),
    }),
    handler: async (input, ctx) => {
      const scope = await scopeOf(ctx);
      const row = await createContact(ctx.exec, scope, ctx.actor, {
        name: input.name,
        company: input.company,
        phones: input.phone ? [{ label: "", value: input.phone }] : [],
        emails: input.email ? [{ label: "", value: input.email }] : [],
        website: input.website,
        trades: [...(input.trades ?? []), ...(input.preferred_for ?? [])],
        preferred: input.preferred_for,
        notes: input.notes,
      });
      return { id: row.id, name: row.name };
    },
  }),

  defineTool({
    name: "create_project",
    title: "Create a project",
    description:
      "Start tracking a job around the house. Give `series` to start this year’s round of a recurring job: it copies " +
      "the series’ checklist and materials (and its places and contact unless given), and the title defaults to " +
      '"<series> <year>".',
    scope: "homedocs:write",
    input: z.object({
      title: z
        .string()
        .min(1)
        .max(200)
        .optional()
        .describe("Required unless series is given"),
      series: ref("series").optional(),
      summary: z.string().max(20_000).optional(),
      status: z.enum(STATUSES as [string, ...string[]]).optional(),
      priority: z.enum(["low", "normal", "high"]).optional(),
      places: z.array(ref("place")).max(20).optional(),
    }),
    handler: async (input, ctx) => {
      const scope = await scopeOf(ctx);
      const spaceIds = [];
      for (const p of input.places ?? [])
        spaceIds.push(await resolveRef(ctx.exec, scope, "place", p));
      const seriesId = await optionalRef(
        ctx.exec,
        scope,
        "series",
        input.series,
      );
      const title =
        input.title ??
        (seriesId
          ? await nextTitle(
              ctx.exec,
              scope,
              await getSeries(ctx.exec, scope, seriesId),
            )
          : "");
      const row = await createProject(ctx.exec, scope, ctx.actor, {
        title,
        summary: input.summary,
        status: input.status,
        priority: input.priority,
        spaceIds: input.places ? spaceIds : seriesId ? undefined : [],
        seriesId,
      });
      return {
        id: row.id,
        title: row.title,
        status: row.status,
        series_id: row.seriesId ?? undefined,
      };
    },
  }),

  defineTool({
    name: "add_project_item",
    title: "Add to a project checklist",
    description:
      'Add a to-do to a project — e.g. "2 outlets in the garage while the electrician is here".',
    scope: "homedocs:write",
    input: z.object({
      project: ref("project"),
      text: z.string().min(1).max(500),
      place: ref("place").optional(),
    }),
    handler: async (input, ctx) => {
      const scope = await scopeOf(ctx);
      const item = await addItem(
        ctx.exec,
        scope,
        ctx.actor,
        await resolveRef(ctx.exec, scope, "project", input.project),
        {
          text: input.text,
          spaceId: await optionalRef(ctx.exec, scope, "place", input.place),
        },
      );
      return { id: item.id, text: item.text };
    },
  }),

  defineTool({
    name: "add_project_material",
    title: "Add a material",
    description:
      'Add a line to what a job takes — "8 rolls of pine straw, around the stairs" — on a project or on a series ' +
      "(the default every new round starts with). Link a part to fill in its name and limit the unit to the units " +
      "it is sold by. Changing a series from a project is done in the app, where a person confirms it.",
    scope: "homedocs:write",
    input: z.object({
      project: ref("project").optional(),
      series: ref("series").optional(),
      name: z
        .string()
        .max(200)
        .optional()
        .describe("Required unless part is given"),
      part: ref("part").optional(),
      quantity: z.number().nonnegative().optional(),
      unit: z.string().max(30).optional(),
      place: ref("place").optional(),
      notes: z
        .string()
        .max(2000)
        .optional()
        .describe('Where or what for: "around the stairs"'),
      only_this_project: z
        .boolean()
        .optional()
        .describe("Projects only: never offered back to the series"),
    }),
    handler: async (input, ctx) => {
      const scope = await scopeOf(ctx);
      if (Boolean(input.project) === Boolean(input.series))
        throw new ToolRefusal("Give exactly one of project or series.");
      const owner = input.project
        ? {
            projectId: await resolveRef(
              ctx.exec,
              scope,
              "project",
              input.project,
            ),
          }
        : {
            seriesId: await resolveRef(
              ctx.exec,
              scope,
              "series",
              input.series!,
            ),
          };
      const row = await addMaterial(ctx.exec, scope, ctx.actor, owner, {
        name: input.name,
        supplyId: await optionalRef(ctx.exec, scope, "part", input.part),
        quantity: input.quantity?.toString(),
        unit: input.unit,
        spaceId: await optionalRef(ctx.exec, scope, "place", input.place),
        notes: input.notes,
        oneOff: input.only_this_project,
      });
      return {
        id: row.id,
        name: row.name,
        quantity: row.quantity === null ? undefined : Number(row.quantity),
        unit: row.unit || undefined,
      };
    },
  }),

  defineTool({
    name: "set_project_status",
    title: "Set project status",
    description: `Move a project along: ${STATUSES.join(" → ")}.`,
    scope: "homedocs:write",
    input: z.object({
      project: ref("project"),
      status: z.enum(STATUSES as [string, ...string[]]),
    }),
    handler: async (input, ctx) => {
      const scope = await scopeOf(ctx);
      const row = await setProjectStatus(
        ctx.exec,
        scope,
        ctx.actor,
        await resolveRef(ctx.exec, scope, "project", input.project),
        input.status,
      );
      return { id: row.id, title: row.title, status: row.status };
    },
  }),
];
