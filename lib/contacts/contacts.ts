/*
 * Contacts: the companies and people the house relies on — the plumber, the
 * electric company, the neighbor with a key.
 *
 * Trades are rows, not a column, so one contact can be "plumber" and "gas" and a
 * trade can have one *preferred* contact — which is what "who's our plumber?"
 * means, and what the house guide's emergency card shows.
 */

import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { diff, recordAudit } from "../core/audit";
import { assertFresh, inTransaction, liveIn } from "../core/internal";
import { cleanText, cleanUrl, requireText, softDelete } from "../core/records";
import {
  assertCanEdit,
  NotFoundError,
  type ActorContext,
  type Executor,
  type PropertyScope,
} from "../core/types";
import { contacts, contactTrades, type ContactMethod } from "../db/schema";
import { cascadeContact, rebuildContact } from "../search/rebuild";
import { addToTradeList } from "./trades";

export type Contact = typeof contacts.$inferSelect;

export type ContactInput = {
  name: string;
  company?: string;
  phones?: ContactMethod[];
  emails?: ContactMethod[];
  website?: string;
  notes?: string;
  accountNumber?: string;
  inGuide?: boolean;
  /** Lower-cased trade names; `preferred` is the subset this contact is "our" one for. */
  trades?: string[];
  preferred?: string[];
  /** Trades typed in rather than ticked: added to the family's list, and to this contact. */
  newTrades?: string[];
  /** Make this contact "ours" for the typed trades too. */
  preferNew?: boolean;
};

function cleanMethods(list: ContactMethod[] | undefined): ContactMethod[] {
  return (list ?? [])
    .map((m) => ({
      label: cleanText(m.label, 40),
      value: cleanText(m.value, 200),
    }))
    .filter((m) => m.value !== "")
    .slice(0, 6);
}

export function normalizeTrades(raw: string[] | undefined): string[] {
  return [
    ...new Set((raw ?? []).map((t) => t.trim().toLowerCase()).filter(Boolean)),
  ].slice(0, 12);
}

/** The ticked and typed trades, with typed ones added to the family's list. */
async function resolveTrades(
  tx: Executor,
  scope: PropertyScope,
  input: Partial<ContactInput>,
) {
  const typed = await addToTradeList(tx, scope, input.newTrades ?? []);
  return {
    trades: normalizeTrades([...(input.trades ?? []), ...typed]),
    preferred: normalizeTrades([
      ...(input.preferred ?? []),
      ...(input.preferNew ? typed : []),
    ]),
  };
}

async function writeTrades(
  tx: Executor,
  scope: PropertyScope,
  contactId: string,
  trades: string[],
  preferred: string[],
) {
  await tx.delete(contactTrades).where(eq(contactTrades.contactId, contactId));
  if (trades.length === 0) return;
  const pref = new Set(preferred.filter((p) => trades.includes(p)));
  // Only one preferred contact per trade in this home: claiming it clears the others.
  if (pref.size > 0) {
    await tx
      .update(contactTrades)
      .set({ preferred: false })
      .where(
        and(
          inArray(contactTrades.trade, [...pref]),
          sql`${contactTrades.contactId} in (select id from contacts where property_id = ${scope.propertyId})`,
        ),
      );
  }
  await tx
    .insert(contactTrades)
    .values(
      trades.map((trade) => ({ contactId, trade, preferred: pref.has(trade) })),
    );
}

export async function listContacts(exec: Executor, scope: PropertyScope) {
  const rows = await exec
    .select()
    .from(contacts)
    .where(
      and(
        eq(contacts.propertyId, scope.propertyId),
        isNull(contacts.deletedAt),
      ),
    )
    .orderBy(asc(contacts.name));
  const trades = rows.length
    ? await exec
        .select()
        .from(contactTrades)
        .where(
          inArray(
            contactTrades.contactId,
            rows.map((r) => r.id),
          ),
        )
    : [];
  return rows.map((r) => ({
    ...r,
    trades: trades.filter((t) => t.contactId === r.id),
  }));
}

export type ContactWithTrades = Awaited<
  ReturnType<typeof listContacts>
>[number];

export async function getContact(
  exec: Executor,
  scope: PropertyScope,
  id: string,
) {
  const [row] = await exec
    .select()
    .from(contacts)
    .where(liveIn(contacts, scope.propertyId, id));
  if (!row) throw new NotFoundError("contact");
  const trades = await exec
    .select()
    .from(contactTrades)
    .where(eq(contactTrades.contactId, id))
    .orderBy(asc(contactTrades.trade));
  return { ...row, trades };
}

/** The preferred contact for each trade — "our plumber". */
export async function preferredByTrade(exec: Executor, scope: PropertyScope) {
  return exec
    .select({ trade: contactTrades.trade, contact: contacts })
    .from(contactTrades)
    .innerJoin(contacts, eq(contacts.id, contactTrades.contactId))
    .where(
      and(
        eq(contactTrades.preferred, true),
        eq(contacts.propertyId, scope.propertyId),
        isNull(contacts.deletedAt),
      ),
    )
    .orderBy(asc(contactTrades.trade));
}

export async function createContact(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  input: ContactInput,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [row] = await tx
      .insert(contacts)
      .values({
        propertyId: scope.propertyId,
        name: requireText(input.name, "Give it a name: a company or a person."),
        company: cleanText(input.company, 200),
        phones: cleanMethods(input.phones),
        emails: cleanMethods(input.emails),
        website: cleanUrl(input.website),
        notes: cleanText(input.notes),
        accountNumber: cleanText(input.accountNumber, 100),
        inGuide: input.inGuide ?? false,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    const t = await resolveTrades(tx, scope, input);
    await writeTrades(tx, scope, row!.id, t.trades, t.preferred);
    await rebuildContact(tx, row!.id);
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "contact",
      entityId: row!.id,
      after: { name: row!.name },
    });
    return row!;
  });
}

export async function updateContact(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
  input: Partial<ContactInput>,
  expectedUpdatedAt?: Date,
) {
  assertCanEdit(actor);
  return inTransaction(exec, async (tx) => {
    const [current] = await tx
      .select()
      .from(contacts)
      .where(liveIn(contacts, scope.propertyId, id))
      .for("update");
    assertFresh("contact", current, expectedUpdatedAt);
    const patch: Partial<Contact> = {};
    if (input.name !== undefined)
      patch.name = requireText(
        input.name,
        "Give it a name: a company or a person.",
      );
    if (input.company !== undefined)
      patch.company = cleanText(input.company, 200);
    if (input.phones !== undefined) patch.phones = cleanMethods(input.phones);
    if (input.emails !== undefined) patch.emails = cleanMethods(input.emails);
    if (input.website !== undefined) patch.website = cleanUrl(input.website);
    if (input.notes !== undefined) patch.notes = cleanText(input.notes);
    if (input.accountNumber !== undefined)
      patch.accountNumber = cleanText(input.accountNumber, 100);
    if (input.inGuide !== undefined) patch.inGuide = input.inGuide;
    const changes = diff(current!, patch);
    if (input.trades !== undefined || input.newTrades?.length) {
      const t = await resolveTrades(tx, scope, input);
      await writeTrades(tx, scope, id, t.trades, t.preferred);
      changes.after.trades = t.trades;
    }
    if (Object.keys(changes.after).length === 0) return current!;
    const [row] = await tx
      .update(contacts)
      .set({ ...patch, updatedAt: new Date(), updatedBy: actor.userId })
      .where(eq(contacts.id, id))
      .returning();
    await cascadeContact(tx, id);
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "contact",
      entityId: id,
      ...changes,
    });
    return row!;
  });
}

export async function deleteContact(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  return inTransaction(exec, (tx) =>
    softDelete(tx, contacts, "contact", scope, id, actor),
  );
}

/** "tel:" link for a phone number as typed. */
export function telHref(value: string): string {
  return `tel:${value.replace(/[^\d+]/g, "")}`;
}
