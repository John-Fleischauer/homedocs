/*
 * The family's list of what a contact can do: the chips on the contact and
 * system forms. Stored on the property; null means DEFAULT_TRADE_GROUPS.
 * Removing a trade from the list leaves contacts that have it alone.
 */

import { eq } from "drizzle-orm";
import { recordAudit } from "../core/audit";
import { inTransaction } from "../core/internal";
import {
  assertCanEdit,
  ValidationError,
  type ActorContext,
  type Executor,
  type PropertyScope,
} from "../core/types";
import { properties } from "../db/schema";
import {
  DEFAULT_TRADE_GROUPS,
  tradeKey,
  type TradeGroup,
} from "./trade-labels";

export async function getTradeGroups(
  exec: Executor,
  scope: PropertyScope,
): Promise<TradeGroup[]> {
  const [row] = await exec
    .select({ tradeGroups: properties.tradeGroups })
    .from(properties)
    .where(eq(properties.id, scope.propertyId));
  return row?.tradeGroups ?? DEFAULT_TRADE_GROUPS;
}

/** Trimmed, de-duplicated across groups (first wins), empty groups dropped; a group with no name is "Other". */
export function cleanTradeGroups(raw: unknown): TradeGroup[] {
  if (!Array.isArray(raw))
    throw new ValidationError("That list didn’t come through. Try again.");
  const seen = new Set<string>();
  const out: TradeGroup[] = [];
  for (const g of raw.slice(0, 12)) {
    if (!g || typeof g !== "object") continue;
    const label =
      String((g as TradeGroup).label ?? "")
        .trim()
        .slice(0, 60) || "Other";
    const trades: string[] = [];
    for (const t of Array.isArray((g as TradeGroup).trades)
      ? (g as TradeGroup).trades.slice(0, 60)
      : []) {
      const name = String(t).trim().replace(/\s+/g, " ").slice(0, 60);
      const key = tradeKey(name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      trades.push(name);
    }
    if (trades.length) out.push({ label, trades });
  }
  return out;
}

export async function saveTradeGroups(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  raw: unknown,
) {
  assertCanEdit(actor);
  const groups = cleanTradeGroups(raw);
  return inTransaction(exec, async (tx) => {
    await tx
      .update(properties)
      .set({
        tradeGroups: groups,
        updatedAt: new Date(),
        updatedBy: actor.userId,
      })
      .where(eq(properties.id, scope.propertyId));
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "property",
      entityId: scope.propertyId,
      after: { tradeGroups: groups },
    });
    return groups;
  });
}

/** Add trades typed on a contact to the end of the list, so they are a chip next time. Returns their keys. */
export async function addToTradeList(
  exec: Executor,
  scope: PropertyScope,
  labels: string[],
): Promise<string[]> {
  const typed = labels
    .map((l) => l.trim().replace(/\s+/g, " ").slice(0, 60))
    .filter(Boolean);
  if (typed.length === 0) return [];
  const groups = structuredClone(await getTradeGroups(exec, scope));
  const known = new Set(groups.flatMap((g) => g.trades.map(tradeKey)));
  const fresh = typed.filter(
    (t, i) =>
      !known.has(tradeKey(t)) &&
      typed.findIndex((u) => tradeKey(u) === tradeKey(t)) === i,
  );
  if (fresh.length) {
    const last = groups.at(-1);
    if (last) last.trades.push(...fresh);
    else groups.push({ label: "Other", trades: fresh });
    await exec
      .update(properties)
      .set({ tradeGroups: groups })
      .where(eq(properties.id, scope.propertyId));
  }
  return typed.map(tradeKey);
}
