/*
 * Read tools (homedocs:read). Every one returns plain data shaped for a model to
 * answer a contact's question from — names and paths, not just ids. Codes and
 * passwords are not reachable from any tool.
 */

import { z } from "zod";
import { getNote, listNotes, comingUp, lessons } from "../../notes/notes";
import { getPart, listUses } from "../../parts/parts";
import { summarize, TEMPLATES } from "../../parts/templates";
import {
  getContact,
  listContacts,
  preferredByTrade,
} from "../../contacts/contacts";
import {
  buildTree,
  flattenTree,
  getSpace,
  listSpaces,
} from "../../places/places";
import type { MaterialRow, SeriesDiff } from "../../projects/materials";
import {
  getProject,
  listProjects,
  OPEN_STATUSES,
  STATUS_LABEL,
  STATUSES,
} from "../../projects/projects";
import { getSeries, listSeries, seriesNotes } from "../../projects/series";
import { listProperties } from "../../property/property";
import { search } from "../../search/search";
import { getFixture, listFixtures } from "../../fixtures/fixtures";
import { listLinks } from "../../links/links";
import { listSystems, systemOverview } from "../../systems/systems";
import { resolveRef } from "./resolve";
import { defineTool, ToolRefusal, type ToolContext } from "./types";

/** The home a call is about. One today; the argument exists so a second home needs no new tools. */
export async function scopeOf(ctx: ToolContext) {
  const [first] = await listProperties(ctx.exec);
  if (!first) throw new ToolRefusal("homedocs has not been set up yet.");
  return { propertyId: first.id };
}

const ref = (what: string) =>
  z.string().min(1).describe(`The ${what}'s id, or its name`);

function partView(part: {
  id: string;
  name: string;
  category: keyof typeof TEMPLATES;
  fields: Record<string, string>;
  unit: string;
}) {
  const template = TEMPLATES[part.category];
  return {
    id: part.id,
    name: part.name,
    kind: template.label,
    details: Object.fromEntries(
      template.fields
        .filter((f) => part.fields[f.key])
        .map((f) => [f.label, part.fields[f.key]]),
    ),
    unit: part.unit,
  };
}

function noteView(r: Awaited<ReturnType<typeof listNotes>>[number]) {
  return {
    id: r.note.id,
    date: r.note.happenedOn,
    title: r.note.title,
    quantity: r.note.quantity
      ? `${Number(r.note.quantity)} ${r.note.unit}`.trim()
      : undefined,
    cost: r.note.cost ?? undefined,
    next_time: r.note.nextTime || undefined,
    remind_after: r.note.remindAfter ?? undefined,
    about: [
      r.spaceName,
      r.fixtureName,
      r.supplyName,
      r.contactName,
      r.projectTitle,
    ].filter(Boolean),
    details: r.note.body || undefined,
  };
}

function materialView(m: MaterialRow, d?: SeriesDiff["materials"] | null) {
  const r = d?.rows[m.id];
  return {
    id: m.id,
    name: m.name,
    quantity: m.quantity === null ? undefined : Number(m.quantity),
    unit: m.unit || undefined,
    part: m.partName ?? undefined,
    where: m.spaceName ?? undefined,
    notes: m.notes || undefined,
    only_this_project: m.oneOff || undefined,
    // Only on open projects in a series: how this line compares with the series.
    vs_series:
      r?.status === "changed"
        ? r.changes
        : r?.status === "added"
          ? "not in series"
          : undefined,
  };
}

export const readTools = [
  defineTool({
    name: "search",
    title: "Search",
    description:
      "Search everything — places, fixtures, parts, notes, contacts, projects — by words: a room, a " +
      "colour, a brand, a trade. Returns the best matches with their kind and id.",
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({ query: z.string().min(1).max(200) }),
    handler: async ({ query }, ctx) => {
      const hits = await search(ctx.exec, await scopeOf(ctx), query, 20);
      return {
        hits: hits.map((h) => ({
          kind: h.kind,
          id: h.id,
          title: h.title,
          detail: h.detail,
        })),
      };
    },
  }),

  defineTool({
    name: "find_part_for",
    title: "What does it take?",
    description:
      "What a fixture or place takes or used: the bulb a light needs, the filter size for the furnace, " +
      "the paint colour in a room, the mulch in a bed — with quantities, finishes and any " +
      '"next time" lessons. Give a fixture or a place by name or id.',
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({
      fixture: ref("fixture").optional(),
      place: ref("place").optional(),
    }),
    handler: async ({ fixture, place }, ctx) => {
      const scope = await scopeOf(ctx);
      if (!fixture && !place)
        throw new ToolRefusal("Say which fixture or place.");
      if (fixture) {
        const t = await getFixture(
          ctx.exec,
          scope,
          await resolveRef(ctx.exec, scope, "fixture", fixture),
        );
        const uses = await listUses(ctx.exec, scope, { fixtureId: t.id });
        return {
          fixture: {
            id: t.id,
            name: t.name,
            where: t.path.map((p) => p.name).join(" › ") || "whole house",
          },
          parts: uses.map((u) => ({
            ...partView(u.part),
            quantity: u.quantity ? Number(u.quantity) : undefined,
            really_needs: u.quantityNeeded
              ? Number(u.quantityNeeded)
              : undefined,
            note: u.notes || undefined,
          })),
          next_time: (await lessons(ctx.exec, scope, { fixtureId: t.id })).map(
            (l) => l.note.nextTime,
          ),
        };
      }
      const s = await getSpace(
        ctx.exec,
        scope,
        await resolveRef(ctx.exec, scope, "place", place!),
      );
      const [uses, fixtures] = await Promise.all([
        listUses(ctx.exec, scope, { spaceId: s.id }),
        listFixtures(ctx.exec, scope, { spaceId: s.id }),
      ]);
      const fixtureParts = [];
      for (const t of fixtures) {
        const tu = await listUses(ctx.exec, scope, { fixtureId: t.id });
        if (tu.length)
          fixtureParts.push({
            fixture: t.name,
            parts: tu.map((u) => ({
              ...partView(u.part),
              quantity: u.quantity ? Number(u.quantity) : undefined,
            })),
          });
      }
      return {
        place: { id: s.id, name: s.name, path: s.path.map((p) => p.name) },
        used_here: uses.map((u) => ({
          ...partView(u.part),
          surface: u.surface || undefined,
          finish: u.finish || undefined,
          quantity: u.quantity ? Number(u.quantity) : undefined,
          really_needs: u.quantityNeeded ? Number(u.quantityNeeded) : undefined,
        })),
        fixtures_here: fixtureParts,
        next_time: (await lessons(ctx.exec, scope, { spaceId: s.id })).map(
          (l) => l.note.nextTime,
        ),
      };
    },
  }),

  defineTool({
    name: "who_to_call",
    title: "Who to call",
    description:
      "The contacts for a trade (plumber, electrician, hvac…), with the preferred one first and their phone numbers.",
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({
      trade: z
        .string()
        .min(1)
        .max(60)
        .optional()
        .describe("Leave out for every preferred contact"),
    }),
    handler: async ({ trade }, ctx) => {
      const scope = await scopeOf(ctx);
      if (!trade) {
        const preferred = await preferredByTrade(ctx.exec, scope);
        return {
          preferred: preferred.map((p) => ({
            trade: p.trade,
            id: p.contact.id,
            name: p.contact.name,
            company: p.contact.company,
            phones: p.contact.phones,
          })),
        };
      }
      const want = trade.trim().toLowerCase();
      const contacts = (await listContacts(ctx.exec, scope)).filter((p) =>
        p.trades.some((t) => t.trade.includes(want)),
      );
      contacts.sort(
        (a, b) =>
          Number(b.trades.some((t) => t.preferred && t.trade.includes(want))) -
          Number(a.trades.some((t) => t.preferred && t.trade.includes(want))),
      );
      return {
        trade: want,
        contacts: contacts.map((p) => ({
          id: p.id,
          name: p.name,
          company: p.company,
          preferred: p.trades.some(
            (t) => t.preferred && t.trade.includes(want),
          ),
          phones: p.phones,
          emails: p.emails,
          notes: p.notes || undefined,
        })),
      };
    },
  }),

  defineTool({
    name: "list_places",
    title: "List places",
    description:
      'Every place (room, floor, outdoor area) as paths like "Main floor › Living room", with ids.',
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({}),
    handler: async (_input, ctx) => ({
      places: flattenTree(
        buildTree(await listSpaces(ctx.exec, await scopeOf(ctx))),
      ).map((p) => ({ id: p.id, path: p.label })),
    }),
  }),

  defineTool({
    name: "list_systems",
    title: "List systems",
    description:
      "The house's systems (water & plumbing, electrical, heating & cooling, gas…) with how many fixtures each has. " +
      'Use get_system for "where is the water shutoff" or "who do we call about the furnace".',
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({}),
    handler: async (_input, ctx) => ({
      systems: (await listSystems(ctx.exec, await scopeOf(ctx))).map((s) => ({
        id: s.id,
        name: s.name,
        fixtures: s.fixtures,
        trades: s.trades,
      })),
    }),
  }),

  defineTool({
    name: "get_system",
    title: "Get a system",
    description:
      "One system: its fixtures (house-guide ones such as shutoffs first, with where they are and what to do), " +
      "the parts they take, who to call (the preferred contact for each of its trades), and recent notes.",
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({ system: ref("system") }),
    handler: async ({ system }, ctx) => {
      const scope = await scopeOf(ctx);
      const id = await resolveRef(ctx.exec, scope, "system", system);
      const [o, notes] = await Promise.all([
        systemOverview(ctx.exec, scope, id),
        listNotes(ctx.exec, scope, { systemId: id, limit: 10 }),
      ]);
      return {
        id: o.system.id,
        name: o.system.name,
        notes: o.system.notes || undefined,
        fixtures: o.fixtures.map((f) => ({
          id: f.id,
          name: f.name,
          where: f.where,
          kind: f.category || undefined,
          on_house_guide: f.inGuide,
          housesitter_note: f.guideNote || undefined,
        })),
        parts: o.parts.map((p) => ({
          id: p.id,
          name: p.name,
          used_by: p.usedBy,
        })),
        who_to_call: o.contacts.map((c) => ({
          id: c.id,
          name: c.name,
          company: c.company || undefined,
          for: c.trade,
          preferred: c.preferred,
          phone: c.phone ?? undefined,
        })),
        recent_notes: notes.map(noteView),
      };
    },
  }),

  defineTool({
    name: "get_place",
    title: "Get a place",
    description:
      "A place with what is in it: places inside, fixtures, parts used, recent notes, and photos/links counts.",
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({ place: ref("place") }),
    handler: async ({ place }, ctx) => {
      const scope = await scopeOf(ctx);
      const s = await getSpace(
        ctx.exec,
        scope,
        await resolveRef(ctx.exec, scope, "place", place),
      );
      const [fixtures, uses, notes] = await Promise.all([
        listFixtures(ctx.exec, scope, { spaceId: s.id }),
        listUses(ctx.exec, scope, { spaceId: s.id }),
        listNotes(ctx.exec, scope, { spaceId: s.id, limit: 10 }),
      ]);
      return {
        id: s.id,
        name: s.name,
        path: s.path.map((p) => p.name),
        kind: s.kind,
        notes: s.notes || undefined,
        places_inside: s.children.map((c) => ({ id: c.id, name: c.name })),
        fixtures: fixtures.map((t) => ({
          id: t.id,
          name: t.name,
          category: t.category || undefined,
        })),
        parts_used: uses.map((u) => ({
          ...partView(u.part),
          surface: u.surface || undefined,
          finish: u.finish || undefined,
          quantity: u.quantity ? Number(u.quantity) : undefined,
        })),
        recent_notes: notes.map(noteView),
      };
    },
  }),

  defineTool({
    name: "get_fixture",
    title: "Get a fixture",
    description:
      "A fixture (something installed: a light, a shutoff valve) with where it is, the parts it takes, notes, and links to Homebox or paperless.",
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({ fixture: ref("fixture") }),
    handler: async ({ fixture }, ctx) => {
      const scope = await scopeOf(ctx);
      const t = await getFixture(
        ctx.exec,
        scope,
        await resolveRef(ctx.exec, scope, "fixture", fixture),
      );
      const [uses, notes, links] = await Promise.all([
        listUses(ctx.exec, scope, { fixtureId: t.id }),
        listNotes(ctx.exec, scope, { fixtureId: t.id, limit: 10 }),
        listLinks(ctx.exec, scope, { kind: "fixture", id: t.id }),
      ]);
      return {
        id: t.id,
        name: t.name,
        where: t.path.map((p) => p.name).join(" › ") || "whole house",
        system: t.system?.name,
        category: t.category || undefined,
        notes: t.notes || undefined,
        on_house_guide: t.inGuide,
        housesitter_note: t.guideNote || undefined,
        parts: uses.map((u) => ({
          ...partView(u.part),
          quantity: u.quantity ? Number(u.quantity) : undefined,
        })),
        recent_notes: notes.map(noteView),
        links: links.map((l) => ({
          system: l.system,
          title: l.title,
          url: l.url,
        })),
      };
    },
  }),

  defineTool({
    name: "get_part",
    title: "Get a part",
    description:
      "A part (bulb, paint colour, filter…) with its details, everywhere it is used, and its purchase/notes history.",
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({ part: ref("part") }),
    handler: async ({ part }, ctx) => {
      const scope = await scopeOf(ctx);
      const p = await getPart(
        ctx.exec,
        scope,
        await resolveRef(ctx.exec, scope, "part", part),
      );
      const [uses, notes] = await Promise.all([
        listUses(ctx.exec, scope, { supplyId: p.id }),
        listNotes(ctx.exec, scope, { supplyId: p.id, limit: 10 }),
      ]);
      return {
        ...partView(p),
        summary: summarize(p.category, p.fields) || undefined,
        buy_url: p.buyUrl || undefined,
        notes: p.notes || undefined,
        used_in: uses.map((u) => ({
          kind: u.owner.kind,
          id: u.owner.id,
          name: u.owner.name,
          where: u.owner.path || undefined,
          surface: u.surface || undefined,
          finish: u.finish || undefined,
          quantity: u.quantity ? Number(u.quantity) : undefined,
          really_needs: u.quantityNeeded ? Number(u.quantityNeeded) : undefined,
        })),
        history: notes.map(noteView),
      };
    },
  }),

  defineTool({
    name: "get_contact",
    title: "Get a contact",
    description:
      "A contact with phones, emails, trades (and which they are our preferred one for), notes, and the work they have done.",
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({ contact: ref("contact") }),
    handler: async ({ contact }, ctx) => {
      const scope = await scopeOf(ctx);
      const p = await getContact(
        ctx.exec,
        scope,
        await resolveRef(ctx.exec, scope, "contact", contact),
      );
      const notes = await listNotes(ctx.exec, scope, {
        contactId: p.id,
        limit: 10,
      });
      return {
        id: p.id,
        name: p.name,
        company: p.company || undefined,
        phones: p.phones,
        emails: p.emails,
        website: p.website || undefined,
        trades: p.trades.map((t) => ({
          trade: t.trade,
          preferred: t.preferred,
        })),
        notes: p.notes || undefined,
        work_done: notes.map(noteView),
      };
    },
  }),

  defineTool({
    name: "list_projects",
    title: "List projects",
    description: `Projects with status, to-do counts and quote counts. Statuses: ${STATUSES.join(", ")}.`,
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({
      include_finished: z
        .boolean()
        .optional()
        .describe("Include done and dropped projects"),
    }),
    handler: async ({ include_finished }, ctx) => {
      const rows = await listProjects(
        ctx.exec,
        await scopeOf(ctx),
        include_finished ? {} : { statuses: OPEN_STATUSES },
      );
      return {
        projects: rows.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          status_label: STATUS_LABEL[p.status],
          priority: p.priority,
          target_date: p.targetDate ?? undefined,
          open_items: p.openItems,
          quotes: p.quoteCount,
        })),
      };
    },
  }),

  defineTool({
    name: "get_project",
    title: "Get a project",
    description:
      "A project with its checklist, quotes (who, how much, status), the places it touches, and notes.",
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({ project: ref("project") }),
    handler: async ({ project }, ctx) => {
      const scope = await scopeOf(ctx);
      const p = await getProject(
        ctx.exec,
        scope,
        await resolveRef(ctx.exec, scope, "project", project),
      );
      const notes = await listNotes(ctx.exec, scope, {
        projectId: p.id,
        limit: 10,
      });
      return {
        id: p.id,
        title: p.title,
        status: p.status,
        priority: p.priority,
        target_date: p.targetDate ?? undefined,
        summary: p.summary || undefined,
        places: p.places.map((s) => s.name),
        series: p.series
          ? {
              id: p.series.id,
              title: p.series.title,
              how_to: p.series.howTo || undefined,
            }
          : undefined,
        contact: p.contact?.name,
        last_time: p.lessons.length
          ? p.lessons.map((l) => l.note.nextTime)
          : undefined,
        differs_from_series: p.diff ? p.diff.differs : undefined,
        materials: p.materials.map((m) => materialView(m, p.diff?.materials)),
        checklist: p.items.map(({ item, spaceName }) => ({
          id: item.id,
          text: item.text,
          done: item.done,
          where: spaceName ?? undefined,
          only_this_project: item.oneOff || undefined,
        })),
        quotes: p.quotes.map(({ quote, contactName }) => ({
          id: quote.id,
          from: contactName ?? undefined,
          amount: quote.amount ?? undefined,
          received: quote.receivedOn ?? undefined,
          status: quote.status,
          notes: quote.notes || undefined,
        })),
        notes: notes.map(noteView),
      };
    },
  }),

  defineTool({
    name: "list_series",
    title: "List series",
    description:
      "Jobs done again and again (pine straw every spring), each with how many rounds it has had.",
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({}),
    handler: async (_input, ctx) => {
      const rows = await listSeries(ctx.exec, await scopeOf(ctx));
      return {
        series: rows.map((s) => ({
          id: s.id,
          title: s.title,
          projects: s.projectCount,
        })),
      };
    },
  }),

  defineTool({
    name: "get_series",
    title: "Get a series",
    description:
      "A recurring job: how we do it, the default materials and checklist a new round starts with, its places and " +
      "usual contact, each past round with what it used, and lessons from past rounds.",
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({ series: ref("series") }),
    handler: async ({ series }, ctx) => {
      const scope = await scopeOf(ctx);
      const s = await getSeries(
        ctx.exec,
        scope,
        await resolveRef(ctx.exec, scope, "series", series),
      );
      const notes = await seriesNotes(ctx.exec, scope, s.id);
      return {
        id: s.id,
        title: s.title,
        how_to: s.howTo || undefined,
        places: s.places.map((p) => p.name),
        contact: s.contact?.name,
        materials: s.materials.map((m) => materialView(m)),
        checklist: s.items.map(({ item, spaceName }) => ({
          text: item.text,
          where: spaceName ?? undefined,
        })),
        rounds: s.projects.map((p) => ({
          id: p.id,
          title: p.title,
          status: p.status,
          used: p.materials.map((m) =>
            `${m.name}: ${m.quantity === null ? "?" : Number(m.quantity)} ${m.unit}${m.notes ? ` (${m.notes})` : ""}`.trim(),
          ),
        })),
        lessons: notes
          .filter((n) => n.note.nextTime)
          .map((n) => ({
            date: n.note.happenedOn,
            next_time: n.note.nextTime,
            from: n.note.title,
          })),
      };
    },
  }),

  defineTool({
    name: "coming_up",
    title: "Coming up",
    description:
      'Notes whose "next time" reminder falls within about a month of today — what to remember soon.',
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({}),
    handler: async (_input, ctx) => {
      const rows = await comingUp(ctx.exec, await scopeOf(ctx));
      return {
        reminders: rows.map((r) => ({
          note_id: r.note.id,
          remind_after: r.note.remindAfter,
          next_time: r.note.nextTime,
          from: r.note.title,
          about: [r.spaceName, r.fixtureName, r.supplyName].filter(Boolean),
        })),
      };
    },
  }),

  defineTool({
    name: "get_note",
    title: "Get a note",
    description: "One note in full.",
    scope: "homedocs:read",
    annotations: { readOnlyHint: true },
    input: z.object({ id: z.string().uuid() }),
    handler: async ({ id }, ctx) => {
      const scope = await scopeOf(ctx);
      await getNote(ctx.exec, scope, id);
      const [row] = await listNotes(ctx.exec, scope, { id });
      return noteView(row!);
    },
  }),
];
