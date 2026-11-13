/*
 * The contract every mutation shares.
 *
 * There is one write path. Server Actions, Route Handlers and MCP tools all call
 * the domain modules under lib/, which is what makes "every change is attributed,
 * audited and recoverable" a property of the architecture rather than a habit.
 */

import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "../db/schema";

export type Db = PostgresJsDatabase<typeof schema>;

/** A transaction handle, as handed to the callback of `db.transaction()`. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Anything that can run a query — the pool, or a transaction inside one. */
export type Executor = Db | Tx;

export type Role = "admin" | "member" | "viewer";

export type ActorContext = {
  userId: string;
  /* The user's app role, always — never a token's scope. An MCP caller is
     authorized by the intersection of the two (lib/mcp/auth.ts). */
  role: Role;
  source: "web" | "mcp" | "system";
  /** The OAuth client, when source is 'mcp'. */
  clientId?: string;
  /** Groups one submission's rows into one reviewable audit event. */
  requestId: string;
};

/**
 * Which property a call is about. Every domain function that reads or writes a
 * property's data takes one, so a query cannot forget the boundary.
 */
export type PropertyScope = { propertyId: string };

// ─── errors ──────────────────────────────────────────────────────────────────

/** A refusal meant for a person. Forms show `.message`; MCP returns it as content. */
export class AppError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(what: string) {
    super(`That ${what} no longer exists.`, "not_found");
  }
}

/** Two phones editing the same record: the second save is refused, not merged. */
export class StaleWriteError extends AppError {
  constructor() {
    super(
      "Someone else just edited this. Reload to see their change, then try again.",
      "stale_write",
    );
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, "validation");
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have permission to do that.") {
    super(message, "forbidden");
  }
}

// ─── roles ───────────────────────────────────────────────────────────────────

const RANK: Record<Role, number> = { viewer: 0, member: 1, admin: 2 };

export function roleAtLeast(role: Role, needed: Role): boolean {
  return RANK[role] >= RANK[needed];
}

/** Throws unless the actor may make changes (member or admin). */
export function assertCanEdit(actor: ActorContext): void {
  if (!roleAtLeast(actor.role, "member")) {
    throw new ForbiddenError(
      "Viewers can look but not change things. Ask an admin for edit access.",
    );
  }
}

export function assertAdmin(actor: ActorContext): void {
  if (actor.role !== "admin")
    throw new ForbiddenError("Only an admin can do that.");
}

export function systemActor(userId: string): ActorContext {
  return {
    userId,
    role: "admin",
    source: "system",
    requestId: crypto.randomUUID(),
  };
}
