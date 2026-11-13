/*
 * The app the browser tests run against: a fresh Postgres in a container, the
 * real migrations, then `next dev` on its own port and build folder so it can
 * run beside a developer's server. Started and stopped by Playwright.
 */

import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { E2E_PORT } from "./world";

const container = await new PostgreSqlContainer("postgres:18-alpine").start();
const databaseUrl = container.getConnectionUri();
const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
await migrate(drizzle(sql), { migrationsFolder: "lib/db/migrations" });
await sql.end();

const server = spawn(
  "pnpm",
  ["exec", "next", "dev", "--port", String(E2E_PORT)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
      SESSION_SECRET:
        "e2e-only-session-secret-not-used-anywhere-real-0123456789",
      INTEGRATIONS_KEY:
        "e2e-only-integrations-key-not-used-anywhere-real-012345",
      PUBLIC_BASE_URL: `http://localhost:${E2E_PORT}`,
      DATA_DIR: mkdtempSync(join(tmpdir(), "homedocs-e2e-")),
      NEXT_DIST_DIR: ".next-e2e",
      WORKER: "off",
    },
  },
);

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  server.kill("SIGTERM");
  await container.stop().catch(() => {});
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
server.on("exit", stop);
