/*
 * Where `pnpm db:migrate` applies migrations.
 *
 * Locally it defaults to the dev database (the `docker run` line in README.md
 * and CLAUDE.md), because the migrator doesn't read `.env.local`. In
 * production there is no default: the image sets NODE_ENV=production, the
 * migrator runs `checkEnv()` first (lib/env.ts refuses a missing
 * DATABASE_URL), and this returns null as well, so a container without one
 * never migrates a database it guessed.
 */

export const LOCAL_DATABASE_URL =
  "postgres://homedocs:homedocs@localhost:54330/homedocs";

export function migrationUrl(
  env: Record<string, string | undefined>,
): string | null {
  const url = env.DATABASE_URL?.trim();
  if (url) return url;
  return env.NODE_ENV === "production" ? null : LOCAL_DATABASE_URL;
}
