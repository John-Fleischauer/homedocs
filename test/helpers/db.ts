/*
 * A database per test file, cloned from the migrated template in test/setup.ts.
 * Files run in parallel; one file's truncation cannot touch another's rows.
 * Within a file, tests are separated by truncation (not an outer rollback), so
 * the domain layer's own transactions really commit.
 */

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeEach, inject } from "vitest";
import * as schema from "../../lib/db/schema";
import { TEMPLATE_DB } from "../setup";

export type Db = PostgresJsDatabase<typeof schema>;

const adminUrl = inject("adminDatabaseUrl");
const dbName = `test_${randomUUID().replaceAll("-", "")}`;

const admin = postgres(adminUrl, { max: 1 });
try {
  await admin.unsafe(`create database "${dbName}" template "${TEMPLATE_DB}"`);
} finally {
  await admin.end();
}

const url = new URL(adminUrl);
url.pathname = `/${dbName}`;

/** For tests that go through `@/lib/db`, which reads DATABASE_URL on first use. */
export const databaseUrl = url.toString();
process.env.DATABASE_URL = databaseUrl;

const client = postgres(databaseUrl, { max: 4, onnotice: () => {} });
export const db: Db = drizzle(client, { schema });

let cached: string[] | null = null;

export async function resetDb() {
  cached ??= [
    ...(await db.execute(
      sql`select tablename from pg_tables where schemaname = 'public'`,
    )),
  ].map((r) => (r as { tablename: string }).tablename);
  if (cached.length === 0) return;
  await db.execute(
    sql.raw(
      `truncate table ${cached.map((t) => `"${t}"`).join(", ")} restart identity cascade`,
    ),
  );
}

/** Opt in per file at the top level. */
export function resetBetweenTests() {
  beforeEach(resetDb);
}

afterAll(async () => {
  await client.end();
});
