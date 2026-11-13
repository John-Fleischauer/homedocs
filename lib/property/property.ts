/*
 * The property — the house the data is about.
 *
 * There is one today. Every domain table still carries `property_id`, and every
 * domain call takes a PropertyScope, so adding a cabin later is a switcher in
 * the UI rather than a migration of every query.
 */

import { asc, eq, isNull, and } from "drizzle-orm";
import { recordAudit, diff } from "../core/audit";
import { inTransaction } from "../core/internal";
import {
  assertAdmin,
  NotFoundError,
  ValidationError,
  type ActorContext,
  type Executor,
} from "../core/types";
import { db } from "../db";
import { properties } from "../db/schema";
import { parseNetworks } from "../guide/networks";

export type Property = typeof properties.$inferSelect;

export async function listProperties(exec: Executor = db) {
  return exec
    .select()
    .from(properties)
    .where(isNull(properties.deletedAt))
    .orderBy(asc(properties.createdAt));
}

export async function getProperty(
  id: string,
  exec: Executor = db,
): Promise<Property> {
  const [row] = await exec
    .select()
    .from(properties)
    .where(and(eq(properties.id, id), isNull(properties.deletedAt)));
  if (!row) throw new NotFoundError("home");
  return row;
}

export async function updateProperty(
  id: string,
  input: {
    name?: string;
    address?: string;
    homeNetworks?: string;
    homeHostname?: string;
  },
  actor: ActorContext,
  exec: Executor = db,
) {
  assertAdmin(actor);
  return inTransaction(exec, async (tx) => {
    const current = await getProperty(id, tx);
    const patch: Partial<Property> = {};
    if (input.name !== undefined) {
      if (!input.name.trim())
        throw new ValidationError("Give the home a name.");
      patch.name = input.name.trim();
    }
    if (input.address !== undefined) patch.address = input.address.trim();
    if (input.homeNetworks !== undefined) {
      const { networks, invalid } = parseNetworks(input.homeNetworks);
      if (invalid.length)
        throw new ValidationError(
          `Not a network address: ${invalid.join(", ")}`,
        );
      patch.homeNetworks = networks;
    }
    if (input.homeHostname !== undefined) {
      const host = input.homeHostname.trim().toLowerCase();
      if (host && !/^[a-z0-9.-]+$/.test(host))
        throw new ValidationError("Enter a hostname like home.example.com.");
      patch.homeHostname = host;
    }
    const changes = diff(current, patch);
    if (Object.keys(changes.after).length === 0) return;
    await tx
      .update(properties)
      .set({ ...patch, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(properties.id, id));
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "property",
      entityId: id,
      ...changes,
    });
  });
}
