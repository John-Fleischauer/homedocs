/*
 * Which accounts can be signed in as: not removed, and not awaiting placement
 * (a sign-on that matched nobody, waiting for an admin; docs/DECISIONS.md).
 * Every way in that resolves a person from the users table uses this, so the
 * rule is in one place: sessions, MCP bearer tokens, password resets.
 */

import { and, eq, isNull } from 'drizzle-orm'
import { users } from '../db/schema'

export function liveAccount() {
  return and(isNull(users.deletedAt), eq(users.awaitingPlacement, false))!
}
