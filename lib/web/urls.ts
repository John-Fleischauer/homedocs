/*
 * The external origin, in one place.
 *
 * PUBLIC_BASE_URL is what share links, OAuth discovery and the sign-on callback
 * are built from, so it has to be the HTTPS origin people actually type — not the
 * container's own address. Required in every mode and checked at boot
 * (lib/env.ts), never guessed; a local run sets http://localhost:3000.
 */

export function baseUrl(): string {
  const raw = process.env.PUBLIC_BASE_URL;
  if (!raw)
    throw new Error(
      "PUBLIC_BASE_URL must be set — share links and OAuth are built from it",
    );
  return raw.replace(/\/+$/, "");
}

export function absoluteUrl(path: string): string {
  return `${baseUrl()}${path.startsWith("/") ? path : `/${path}`}`;
}
