import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { LOCAL_DATABASE_URL, migrationUrl } from "@/lib/db/migrate-url";
import { parseEnv } from "@/lib/env";

describe("pnpm db:migrate database", () => {
  it("defaults to the local dev database outside production", () => {
    expect(migrationUrl({})).toBe(LOCAL_DATABASE_URL);
    expect(migrationUrl({ NODE_ENV: "development" })).toBe(LOCAL_DATABASE_URL);
    expect(migrationUrl({ NODE_ENV: "test", DATABASE_URL: "  " })).toBe(
      LOCAL_DATABASE_URL,
    );
  });

  it("uses DATABASE_URL when it is set", () => {
    const url = "postgres://someone@elsewhere:5432/db";
    expect(migrationUrl({ DATABASE_URL: url })).toBe(url);
    expect(migrationUrl({ NODE_ENV: "production", DATABASE_URL: url })).toBe(
      url,
    );
  });

  it("has no default in production", () => {
    expect(migrationUrl({ NODE_ENV: "production" })).toBeNull();
    expect(
      migrationUrl({ NODE_ENV: "production", DATABASE_URL: "" }),
    ).toBeNull();
  });

  it("lib/env.ts still refuses a production environment without DATABASE_URL", () => {
    expect(() =>
      parseEnv({
        NODE_ENV: "production",
        SESSION_SECRET: "x".repeat(32),
        INTEGRATIONS_KEY: "y".repeat(32),
        PUBLIC_BASE_URL: "https://homedocs.example.test",
      }),
    ).toThrow(/DATABASE_URL/);
  });

  it("the migrator refuses to run in production without DATABASE_URL", () => {
    const env: NodeJS.ProcessEnv = { ...process.env, NODE_ENV: "production" };
    delete env.DATABASE_URL;
    const run = spawnSync("node_modules/.bin/tsx", ["lib/db/migrate.ts"], {
      env,
      encoding: "utf8",
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("DATABASE_URL");
  });
});
