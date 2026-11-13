/* Shared plumbing for the domain modules. */

import { and, eq, isNull, type SQL } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import {
  NotFoundError,
  StaleWriteError,
  type Db,
  type Executor,
  type Tx,
} from "./types";

/**
 * Run `fn` in a transaction. If `exec` is already a transaction this nests as a
 * savepoint, so an operation can be called standalone or composed into a larger
 * one without either caller knowing which it is.
 */
export function inTransaction<T>(
  exec: Executor,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  return (exec as Db).transaction((tx) => fn(tx as Tx));
}

type Scoped = { id: PgColumn; propertyId: PgColumn; deletedAt: PgColumn };

/** A live row of this property, by id. */
export function liveIn(table: Scoped, propertyId: string, id: string): SQL {
  return and(
    eq(table.id, id),
    eq(table.propertyId, propertyId),
    isNull(table.deletedAt),
  )!;
}

/**
 * Fetch-or-throw plus optimistic concurrency, when the caller supplied the
 * `updatedAt` it read. Passing undefined means "I have not read this row", not
 * "overwrite whatever is there".
 */
export function assertFresh<T extends { updatedAt: Date }>(
  what: string,
  row: T | undefined,
  expectedUpdatedAt?: Date,
): T {
  if (!row) throw new NotFoundError(what);
  if (
    expectedUpdatedAt &&
    row.updatedAt.getTime() !== expectedUpdatedAt.getTime()
  ) {
    throw new StaleWriteError();
  }
  return row;
}

/** Drops undefined keys so a patch never writes a column the caller omitted. */
export function definedOnly<T extends Record<string, unknown>>(
  patch: T,
): Partial<T> {
  return Object.fromEntries(
    Object.entries(patch).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}
