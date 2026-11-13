/*
 * Soft delete and restore, shared by every domain table.
 *
 * Deleting never removes a row: it stamps deleted_at, and "Recently deleted"
 * (lib/trash/trash.ts) lists and restores. Only an admin purges.
 */

import { and, eq, isNotNull, isNull } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { recordAudit } from "./audit";
import {
  assertCanEdit,
  NotFoundError,
  ValidationError,
  type ActorContext,
  type Executor,
  type PropertyScope,
} from "./types";

type SoftTable = PgTable & {
  id: PgColumn;
  propertyId: PgColumn;
  deletedAt: PgColumn;
  updatedAt: PgColumn;
  updatedBy: PgColumn;
};

export async function softDelete(
  tx: Executor,
  table: SoftTable,
  entityType: string,
  scope: PropertyScope,
  id: string,
  actor: ActorContext,
) {
  assertCanEdit(actor);
  const done = await tx
    .update(table)
    .set({
      deletedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: actor.userId,
    } as never)
    .where(
      and(
        eq(table.id, id),
        eq(table.propertyId, scope.propertyId),
        isNull(table.deletedAt),
      ),
    )
    .returning({ id: table.id });
  if (done.length === 0) throw new NotFoundError(entityType);
  await recordAudit(tx, actor, { action: "delete", entityType, entityId: id });
}

export async function restoreRow(
  tx: Executor,
  table: SoftTable,
  entityType: string,
  scope: PropertyScope,
  id: string,
  actor: ActorContext,
) {
  assertCanEdit(actor);
  const done = await tx
    .update(table)
    .set({
      deletedAt: null,
      updatedAt: new Date(),
      updatedBy: actor.userId,
    } as never)
    .where(
      and(
        eq(table.id, id),
        eq(table.propertyId, scope.propertyId),
        isNotNull(table.deletedAt),
      ),
    )
    .returning({ id: table.id });
  if (done.length === 0) throw new NotFoundError(entityType);
  await recordAudit(tx, actor, { action: "restore", entityType, entityId: id });
}

/** "12", "2.5", "1,000" → a numeric string; "" → null; anything else refused. */
export function parseQuantity(
  raw: string | undefined | null,
  label = "Amount",
): string | null {
  const text = (raw ?? "").trim().replace(/,/g, "");
  if (text === "") return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text))
    throw new ValidationError(`${label} should be a number, like 12 or 2.5.`);
  return text;
}

/** "$1,200.50" → "1200.50". */
export function parseMoney(raw: string | undefined | null): string | null {
  const text = (raw ?? "").trim().replace(/[$,\s]/g, "");
  if (text === "") return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(text))
    throw new ValidationError("Cost should be an amount, like 120 or 89.99.");
  return text;
}

/** YYYY-MM-DD, or null. */
export function parseDate(
  raw: string | undefined | null,
  label = "Date",
): string | null {
  const text = (raw ?? "").trim();
  if (text === "") return null;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
    Number.isNaN(new Date(`${text}T00:00:00Z`).getTime())
  ) {
    throw new ValidationError(`${label} should be a date.`);
  }
  return text;
}

export function requireText(
  raw: string | undefined | null,
  message: string,
  max = 200,
): string {
  const text = (raw ?? "").trim();
  if (text === "") throw new ValidationError(message);
  if (text.length > max)
    throw new ValidationError(
      `That's too long — keep it under ${max} characters.`,
    );
  return text;
}

export function cleanText(
  raw: string | undefined | null,
  max = 20_000,
): string {
  return (raw ?? "").trim().slice(0, max);
}

/** A URL a person pasted: http(s) only, or empty. */
export function cleanUrl(raw: string | undefined | null): string {
  const text = (raw ?? "").trim();
  if (text === "") return "";
  const withScheme = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withScheme);
    if (url.protocol !== "http:" && url.protocol !== "https:")
      throw new Error();
    return url.toString();
  } catch {
    throw new ValidationError("That doesn’t look like a web address.");
  }
}
