/*
 * The guards.
 *
 * `app/(app)/` is authenticated by placement: its layout calls requireUser(), so
 * a new page under it is safe without anyone remembering to do anything.
 *
 * `app/api/` and `app/g/` are NOT. Every handler there authenticates explicitly
 * — see the guard table in docs/ARCHITECTURE.md. A new file under app/(app)/ is
 * safe by default; a new file under app/api/ is not.
 *
 * Page guards redirect; API guards return a response, because a redirect is the
 * wrong answer to a fetch.
 */

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ForbiddenError, roleAtLeast, type Role } from "../core/types";
import { SESSION_COOKIE, resolveSession, type AuthUser } from "./sessions";
import { needsSetup } from "./users";

export type { AuthUser };

/** The current user, or null. Never redirects — for conditional rendering. */
export async function getCurrentUser(): Promise<AuthUser | null> {
  const jar = await cookies();
  return resolveSession(jar.get(SESSION_COOKIE)?.value);
}

/**
 * For pages and layouts. Sends a signed-out visitor to /setup when there are no
 * accounts at all, and to /login otherwise.
 */
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser();
  if (user) return user;

  if (await needsSetup()) redirect("/setup");
  redirect("/login");
}

export async function requireRole(role: Role): Promise<AuthUser> {
  const user = await requireUser();
  // Not a redirect: they are signed in and simply lack authority.
  if (!roleAtLeast(user.role, role)) throw new ForbiddenError();
  return user;
}

// ─── API guards ──────────────────────────────────────────────────────────────

export type ApiAuth = { user: AuthUser } | { response: Response };

/** For Route Handlers under app/api/. Returns a 401 rather than redirecting. */
export async function requireApiUser(): Promise<ApiAuth> {
  const user = await getCurrentUser();
  if (user) return { user };
  return {
    response: Response.json(
      { error: "authentication required" },
      { status: 401 },
    ),
  };
}

export async function requireApiRole(role: Role): Promise<ApiAuth> {
  const auth = await requireApiUser();
  if ("response" in auth) return auth;
  if (!roleAtLeast(auth.user.role, role)) {
    return { response: Response.json({ error: "forbidden" }, { status: 403 }) };
  }
  return auth;
}
