/*
 * Next calls `register()` once per server process, before any request is
 * served. The work is in lib/boot.ts.
 */

export async function register() {
  /* The Edge runtime evaluates this file too and can load none of what follows. */
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  /* Imported inside the function: `next build` evaluates this file, and a
     top-level import would pull the database driver into a build with no
     DATABASE_URL. */
  const { boot } = await import("./lib/boot");
  await boot();
}
