/*
 * One postgres:18-alpine container for the whole run. See docs/ARCHITECTURE.md (Testing) for
 * why this rather than a CI `services:` block: it is one path, identical on a
 * laptop and in Actions, and `pnpm test` works on a clean checkout with nothing
 * running but Docker.
 *
 * The migrations are applied once, to a template database. Each test file then
 * clones that template into a database of its own (test/helpers/db.ts), which is
 * what makes files independent — they run in parallel and one file's truncation
 * cannot delete another file's fixtures.
 *
 * Applying the real migrations rather than pushing the schema is deliberate:
 * every run also proves the migration chain still builds a working database,
 * which is the thing the container does at boot.
 */

import {
  PostgreSqlContainer,
  type StartedPostgreSqlContainer,
} from "@testcontainers/postgresql";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import type { TestProject } from "vitest/node";

export const TEMPLATE_DB = "homedocs_template";

let container: StartedPostgreSqlContainer;

export async function setup(project: TestProject) {
  container = await new PostgreSqlContainer("postgres:18-alpine").start();
  const adminUrl = container.getConnectionUri();

  const admin = postgres(adminUrl, { max: 1 });
  try {
    await admin.unsafe(`create database "${TEMPLATE_DB}"`);
  } finally {
    await admin.end();
  }

  const templateUrl = new URL(adminUrl);
  templateUrl.pathname = `/${TEMPLATE_DB}`;

  const sql = postgres(templateUrl.toString(), { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder: "lib/db/migrations" });
  } finally {
    // The connection has to be closed before anything can clone the template:
    // CREATE DATABASE ... TEMPLATE refuses while another session is attached.
    await sql.end();
  }

  // globalSetup runs in its own process, so mutating process.env would not reach
  // the test workers. provide/inject is the supported channel.
  project.provide("adminDatabaseUrl", adminUrl);
}

export async function teardown() {
  await container?.stop();
}

declare module "vitest" {
  interface ProvidedContext {
    adminDatabaseUrl: string;
  }
}
