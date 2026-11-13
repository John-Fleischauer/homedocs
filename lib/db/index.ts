import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

/*
 * One instance, one writer, so a process-wide pool is the right shape — but it
 * is created on first use rather than at import.
 *
 * `next build` evaluates page modules to collect their metadata, with no
 * DATABASE_URL in the environment; a pool constructed at import time turns every
 * page that reads the catalog into a build failure.
 *
 * The pool hangs off globalThis rather than off module scope, for two reasons
 * that are the same reason. Next re-evaluates modules on hot reload, which leaks
 * connections until Postgres refuses new ones. And a *built* server compiles
 * this file once per layer — six copies in the last build — so a module-level
 * cache is one pool of ten connections per copy, which is how an idle app
 * arrives at sixty. See lib/process-state.ts; this predates that helper and has
 * its own shape, since what it holds is a connection rather than a Map.
 */
const globalForDb = globalThis as unknown as {
  homedocs?: { sql: postgres.Sql; db: Db };
};

function connect(): { sql: postgres.Sql; db: Db } {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const sql = postgres(url, { max: 10 });
  return { sql, db: drizzle(sql, { schema }) };
}

function instance(): { sql: postgres.Sql; db: Db } {
  return (globalForDb.homedocs ??= connect());
}

/*
 * A proxy so callers can `import { db }` and use it directly. Methods are bound
 * to the real instance: drizzle's builders rely on `this`, and handing back an
 * unbound function would break them in ways that only show up at the first
 * query.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, property) {
    const value = Reflect.get(instance().db, property);
    return typeof value === "function" ? value.bind(instance().db) : value;
  },
});

/** The raw client, for the rare query drizzle should not shape. */
export function sqlClient(): postgres.Sql {
  return instance().sql;
}
