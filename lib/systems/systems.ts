/*
 * Systems: water, electrical, heating — the way into the house beside places.
 *
 * A system gathers what you need when something goes wrong with one part of
 * the house: its fixtures (shutoffs and their photos first), the parts they
 * take, who to call, and what happened before. Each fixture belongs to at most
 * one system. Every home starts with SYSTEM_SEEDS; the family can rename,
 * add or delete them.
 */

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { diff, recordAudit } from "../core/audit";
import { assertFresh, inTransaction, liveIn } from "../core/internal";
import { cleanText, requireText, softDelete } from "../core/records";
import {
  assertCanEdit,
  NotFoundError,
  ValidationError,
  type ActorContext,
  type Executor,
  type PropertyScope,
} from "../core/types";
import {
  attachments,
  contacts,
  contactTrades,
  fixtures,
  supplies,
  supplyUses,
  systems,
} from "../db/schema";
import { addToTradeList } from "../contacts/trades";
import { cascadeSystem, rebuildSystem, spacePath } from "../search/rebuild";
import { guessSystemKey, isSystemIcon, SYSTEM_SEEDS } from "./seeds";

export type HouseSystem = typeof systems.$inferSelect;

export type SystemInput = {
  name: string;
  icon?: string;
  trades?: string[] | string;
  /** Trades typed rather than ticked; they join the family's list too. */
  newTrades?: string[];
  notes?: string;
};

/** Give a home its starting systems. Idempotent: a seed already there (even deleted) is not added again. */
export async function seedSystems(
  exec: Executor,
  propertyId: string,
  actorId: string | null,
) {
  const rows = await exec
    .insert(systems)
    .values(
      SYSTEM_SEEDS.map((s, i) => ({
        propertyId,
        seedKey: s.key,
        name: s.name,
        icon: s.icon,
        trades: s.trades,
        sort: i + 1,
        createdBy: actorId,
        updatedBy: actorId,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: systems.id });
  for (const r of rows) await rebuildSystem(exec, r.id);
}

function cleanTrades(raw: string[] | string | undefined): string[] {
  const list = typeof raw === "string" ? raw.split(",") : (raw ?? []);
  return [...new Set(list.map((t) => t.trim().toLowerCase()).filter(Boolean))]
    .slice(0, 10)
    .map((t) => t.slice(0, 60));
}

function cleanIcon(raw: string | undefined): string {
  return raw && isSystemIcon(raw) ? raw : "system";
}

export async function listSystems(exec: Executor, scope: PropertyScope) {
  const rows = await exec.execute<{
    id: string;
    name: string;
    icon: string;
    trades: string[];
    fixtures: number;
    guide: number;
  }>(sql`
    select s.id, s.name, s.icon, s.trades,
      (select count(*)::int from fixtures f where f.system_id = s.id and f.deleted_at is null) as fixtures,
      (select count(*)::int from fixtures f where f.system_id = s.id and f.deleted_at is null and f.in_guide) as guide
    from systems s
    where s.property_id = ${scope.propertyId} and s.deleted_at is null
    order by s.sort, s.name`);
  return [...rows];
}

/** For a picker: live systems in order. */
export async function listSystemChoices(exec: Executor, scope: PropertyScope) {
  return exec
    .select({ id: systems.id, name: systems.name, seedKey: systems.seedKey })
    .from(systems)
    .where(
      and(eq(systems.propertyId, scope.propertyId), isNull(systems.deletedAt)),
    )
    .orderBy(asc(systems.sort), asc(systems.name));
}

export type SystemSummary = Awaited<ReturnType<typeof listSystems>>[number];

export async function getSystem(
  exec: Executor,
  scope: PropertyScope,
  id: string,
) {
  const [row] = await exec
    .select()
    .from(systems)
    .where(liveIn(systems, scope.propertyId, id));
  if (!row) throw new NotFoundError("system");
  return row;
}

/** The live system a fixture most likely belongs to, by the seed rules; null when unclear or that system was deleted. */
export async function guessSystemId(
  exec: Executor,
  scope: PropertyScope,
  category?: string,
  name?: string,
): Promise<string | null> {
  const key = guessSystemKey(category, name);
  if (!key) return null;
  const [row] = await exec
    .select({ id: systems.id })
    .from(systems)
    .where(
      and(
        eq(systems.propertyId, scope.propertyId),
        eq(systems.seedKey, key),
        isNull(systems.deletedAt),
      ),
    );
  return row?.id ?? null;
}

export async function assertSystem(
  exec: Executor,
  scope: PropertyScope,
  systemId: string | null,
) {
  if (!systemId) return;
  const [row] = await exec
    .select({ id: systems.id })
    .from(systems)
    .where(liveIn(systems, scope.propertyId, systemId));
  if (!row) throw new ValidationError("That system no longer exists.");
}

export async function createSystem(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  input: SystemInput,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [last] = await tx
      .select({ sort: sql<number>`coalesce(max(${systems.sort}), 0)` })
      .from(systems)
      .where(eq(systems.propertyId, scope.propertyId));
    const [row] = await tx
      .insert(systems)
      .values({
        propertyId: scope.propertyId,
        name: requireText(
          input.name,
          "Give the system a name, like “Pool” or “Solar”.",
          100,
        ),
        icon: cleanIcon(input.icon),
        trades: cleanTrades([
          ...cleanTrades(input.trades),
          ...(await addToTradeList(tx, scope, input.newTrades ?? [])),
        ]),
        notes: cleanText(input.notes),
        sort: Number(last?.sort ?? 0) + 1,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await rebuildSystem(tx, row!.id);
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "system",
      entityId: row!.id,
      after: { name: row!.name },
    });
    return row!;
  });
}

export async function updateSystem(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
  input: Partial<SystemInput>,
  expectedUpdatedAt?: Date,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(systems)
      .where(liveIn(systems, scope.propertyId, id))
      .for("update");
    assertFresh("system", current, expectedUpdatedAt);
    const patch: Partial<HouseSystem> = {};
    if (input.name !== undefined)
      patch.name = requireText(input.name, "Give the system a name.", 100);
    if (input.icon !== undefined) patch.icon = cleanIcon(input.icon);
    if (input.trades !== undefined || input.newTrades?.length) {
      const typed = await addToTradeList(tx, scope, input.newTrades ?? []);
      patch.trades = cleanTrades([
        ...cleanTrades(input.trades ?? current!.trades),
        ...typed,
      ]);
    }
    if (input.notes !== undefined) patch.notes = cleanText(input.notes);
    const changes = diff(current!, patch);
    if (Object.keys(changes.after).length === 0) return current!;
    const [row] = await tx
      .update(systems)
      .set({ ...patch, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(systems.id, id))
      .returning();
    if ("name" in changes.after) await cascadeSystem(tx, id);
    else await rebuildSystem(tx, id);
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "system",
      entityId: id,
      ...changes,
    });
    return row!;
  });
}

/** Its fixtures stay where they are; they just aren't in a system until it comes back from Recently deleted. */
export async function deleteSystem(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  return inTransaction(exec, async (tx) => {
    await softDelete(tx, systems, "system", scope, id, actor);
    await cascadeSystem(tx, id);
  });
}

export type SystemFixture = {
  id: string;
  name: string;
  category: string;
  where: string;
  /** The place it is in, for grouping; null for whole-house fixtures. */
  spaceId: string | null;
  inGuide: boolean;
  guideNote: string;
  photo: string | null;
};

/**
 * Everything for a system's page: its fixtures (guide ones first, with a
 * photo), the parts they take, and who to call — the preferred contact for
 * each of its trades, in the order the trades are listed, then anyone else
 * with that trade.
 */
export async function systemOverview(
  exec: Executor,
  scope: PropertyScope,
  id: string,
) {
  const system = await getSystem(exec, scope, id);
  const rows = await exec
    .select()
    .from(fixtures)
    .where(
      and(
        eq(fixtures.propertyId, scope.propertyId),
        eq(fixtures.systemId, id),
        isNull(fixtures.deletedAt),
      ),
    )
    .orderBy(asc(fixtures.name));
  const ids = rows.map((f) => f.id);

  const photos = ids.length
    ? await exec
        .select({
          fixtureId: attachments.fixtureId,
          sha256: attachments.sha256,
        })
        .from(attachments)
        .where(
          and(
            inArray(attachments.fixtureId, ids),
            isNull(attachments.deletedAt),
            sql`${attachments.mime} like 'image/%'`,
          ),
        )
        .orderBy(asc(attachments.sort), asc(attachments.createdAt))
    : [];
  const firstPhoto = new Map<string, string>();
  for (const p of photos)
    if (p.fixtureId && !firstPhoto.has(p.fixtureId))
      firstPhoto.set(p.fixtureId, p.sha256);

  const items: SystemFixture[] = [];
  for (const f of rows) {
    const path = await spacePath(exec, f.spaceId);
    items.push({
      id: f.id,
      name: f.name,
      category: f.category,
      where: path.map((p) => p.name).join(" › ") || "Whole house",
      spaceId: f.spaceId,
      inGuide: f.inGuide,
      guideNote: f.guideNote,
      photo: firstPhoto.get(f.id) ?? null,
    });
  }

  const useRows = ids.length
    ? await exec
        .select({
          id: supplies.id,
          name: supplies.name,
          category: supplies.category,
          fixture: fixtures.name,
        })
        .from(supplyUses)
        .innerJoin(supplies, eq(supplies.id, supplyUses.supplyId))
        .innerJoin(fixtures, eq(fixtures.id, supplyUses.fixtureId))
        .where(
          and(
            inArray(supplyUses.fixtureId, ids),
            isNull(supplyUses.deletedAt),
            isNull(supplies.deletedAt),
          ),
        )
        .orderBy(asc(supplies.name))
    : [];
  const parts = new Map<
    string,
    { id: string; name: string; category: string; usedBy: string[] }
  >();
  for (const u of useRows) {
    const p = parts.get(u.id) ?? {
      id: u.id,
      name: u.name,
      category: u.category,
      usedBy: [],
    };
    if (!p.usedBy.includes(u.fixture)) p.usedBy.push(u.fixture);
    parts.set(u.id, p);
  }

  return {
    system,
    fixtures: [
      ...items.filter((f) => f.inGuide),
      ...items.filter((f) => !f.inGuide),
    ],
    parts: [...parts.values()],
    contacts: await whoToCall(exec, scope, system.trades),
  };
}

export type SystemContact = {
  id: string;
  name: string;
  company: string;
  trade: string;
  preferred: boolean;
  phone: string | null;
};

/** For each trade in order: its preferred contact, or else everyone with it. A contact appears once. */
export async function whoToCall(
  exec: Executor,
  scope: PropertyScope,
  trades: string[],
): Promise<SystemContact[]> {
  if (trades.length === 0) return [];
  const rows = await exec
    .select({
      id: contacts.id,
      name: contacts.name,
      company: contacts.company,
      phones: contacts.phones,
      trade: contactTrades.trade,
      preferred: contactTrades.preferred,
    })
    .from(contactTrades)
    .innerJoin(contacts, eq(contacts.id, contactTrades.contactId))
    .where(
      and(
        eq(contacts.propertyId, scope.propertyId),
        isNull(contacts.deletedAt),
        inArray(contactTrades.trade, trades),
      ),
    )
    .orderBy(asc(contacts.name));
  const out: SystemContact[] = [];
  const seen = new Set<string>();
  for (const trade of trades) {
    const withTrade = rows.filter((r) => r.trade === trade);
    const preferred = withTrade.filter((r) => r.preferred);
    for (const r of preferred.length ? preferred : withTrade) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      out.push({
        id: r.id,
        name: r.name,
        company: r.company,
        trade,
        preferred: r.preferred,
        phone: r.phones[0]?.value ?? null,
      });
    }
  }
  return out;
}
