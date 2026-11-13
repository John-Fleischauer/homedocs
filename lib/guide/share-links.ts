/*
 * Share links: the house guide, for someone without an account.
 *
 * The link is a 256-bit bearer token; only its HMAC is stored. It expires (7
 * days by default, 30 at most), can be revoked, and can carry a PIN that opens
 * the gated parts (codes, address, sensitive sections) when the viewer is not
 * on the home network. Ten wrong PINs lock the link for good — the admin makes
 * a new one. Every view and unlock is recorded.
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { createHmac } from "node:crypto";
import { hashPassword, verifyPassword } from "../auth/password";
import { generateToken, hashToken, tokensMatch } from "../auth/tokens";
import { recordAudit } from "../core/audit";
import { inTransaction } from "../core/internal";
import { cleanText } from "../core/records";
import {
  assertAdmin,
  ValidationError,
  type ActorContext,
  type Executor,
  type PropertyScope,
} from "../core/types";
import { shareLinks, shareLinkViews, spaces } from "../db/schema";
import { absoluteUrl } from "../web/urls";

export const DEFAULT_DAYS = 7;
export const MAX_DAYS = 30;
export const MAX_PIN_FAILURES = 10;
export const UNLOCK_MINUTES = 60;

export type ShareLink = typeof shareLinks.$inferSelect;

export function guideUrl(token: string): string {
  return absoluteUrl(`/g/${token}`);
}

export async function createShareLink(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  input: {
    label: string;
    days?: number;
    pin?: string;
    rootSpaceId?: string | null;
  },
): Promise<{ token: string; url: string; link: ShareLink }> {
  assertAdmin(actor);
  const label = cleanText(input.label, 100);
  if (!label)
    throw new ValidationError(
      "Say who the link is for, like “Sarah – Thanksgiving”.",
    );
  const days = Math.round(input.days ?? DEFAULT_DAYS);
  if (!(days >= 1 && days <= MAX_DAYS))
    throw new ValidationError(`Links last between 1 and ${MAX_DAYS} days.`);
  const pin = (input.pin ?? "").trim();
  if (pin && !/^\d{4,8}$/.test(pin))
    throw new ValidationError("The PIN should be 4 to 8 digits.");

  const token = generateToken();
  return inTransaction(exec, async (tx) => {
    if (input.rootSpaceId) {
      const [s] = await tx
        .select({ id: spaces.id })
        .from(spaces)
        .where(
          and(
            eq(spaces.id, input.rootSpaceId),
            eq(spaces.propertyId, scope.propertyId),
          ),
        );
      if (!s) throw new ValidationError("That place no longer exists.");
    }
    const [link] = await tx
      .insert(shareLinks)
      .values({
        propertyId: scope.propertyId,
        tokenHash: hashToken(token),
        label,
        rootSpaceId: input.rootSpaceId || null,
        pinHash: pin ? await hashPassword(pin) : null,
        expiresAt: new Date(Date.now() + days * 24 * 60 * 60 * 1000),
        createdBy: actor.userId,
      })
      .returning();
    await recordAudit(tx, actor, {
      action: "create",
      entityType: "share_link",
      entityId: link!.id,
      after: { label, days, pin: Boolean(pin) },
    });
    return { token, url: guideUrl(token), link: link! };
  });
}

export type LinkState =
  | { ok: true; link: ShareLink }
  | { ok: false; reason: "missing" | "expired" | "revoked" };

export async function findShareLink(
  exec: Executor,
  token: string,
  now = new Date(),
): Promise<LinkState> {
  if (!token || token.length > 100 || !/^[A-Za-z0-9_-]+$/.test(token))
    return { ok: false, reason: "missing" };
  const hash = hashToken(token);
  const [link] = await exec
    .select()
    .from(shareLinks)
    .where(eq(shareLinks.tokenHash, hash));
  if (!link || !tokensMatch(link.tokenHash, hash))
    return { ok: false, reason: "missing" };
  if (link.revokedAt) return { ok: false, reason: "revoked" };
  if (link.expiresAt <= now) return { ok: false, reason: "expired" };
  return { ok: true, link };
}

export async function revokeShareLink(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  id: string,
) {
  assertAdmin(actor);
  await inTransaction(exec, async (tx) => {
    await tx
      .update(shareLinks)
      .set({ revokedAt: new Date() })
      .where(
        and(eq(shareLinks.id, id), eq(shareLinks.propertyId, scope.propertyId)),
      );
    await recordAudit(tx, actor, {
      action: "delete",
      entityType: "share_link",
      entityId: id,
    });
  });
}

export async function listShareLinks(exec: Executor, scope: PropertyScope) {
  return exec
    .select({
      link: shareLinks,
      views: sql<number>`(select count(*)::int from ${shareLinkViews} v where v.share_link_id = share_links.id and v.event = 'view')`,
    })
    .from(shareLinks)
    .where(eq(shareLinks.propertyId, scope.propertyId))
    .orderBy(desc(shareLinks.createdAt));
}

export async function recentViews(exec: Executor, linkId: string) {
  return exec
    .select()
    .from(shareLinkViews)
    .where(eq(shareLinkViews.shareLinkId, linkId))
    .orderBy(desc(shareLinkViews.at))
    .limit(30);
}

export async function recordView(
  exec: Executor,
  link: ShareLink,
  meta: {
    ip: string | null;
    userAgent: string | null;
    atHome: boolean;
    event?: string;
  },
) {
  const event = meta.event ?? "view";
  await exec.insert(shareLinkViews).values({
    shareLinkId: link.id,
    ip: meta.ip && /^[0-9a-f:.]+$/i.test(meta.ip) ? meta.ip : null,
    userAgent: (meta.userAgent ?? "").slice(0, 300),
    atHome: meta.atHome,
    event,
  });
  if (event === "view") {
    await exec
      .update(shareLinks)
      .set({ lastViewedAt: new Date() })
      .where(eq(shareLinks.id, link.id));
  }
}

export type PinResult = "ok" | "wrong" | "locked" | "no-pin";

/**
 * Check a PIN. Failures are counted in the database (so a restart does not
 * forgive them), and the tenth locks the link permanently.
 */
export async function checkPin(
  exec: Executor,
  link: ShareLink,
  pin: string,
): Promise<PinResult> {
  if (!link.pinHash) return "no-pin";
  if (link.lockedAt || link.pinFailures >= MAX_PIN_FAILURES) return "locked";
  const typed = pin.trim();
  if (/^\d{4,8}$/.test(typed) && (await verifyPassword(link.pinHash, typed)))
    return "ok";
  const [row] = await exec
    .update(shareLinks)
    .set({
      pinFailures: sql`${shareLinks.pinFailures} + 1`,
      lockedAt: sql`case when ${shareLinks.pinFailures} + 1 >= ${MAX_PIN_FAILURES} then now() else ${shareLinks.lockedAt} end`,
    })
    .where(eq(shareLinks.id, link.id))
    .returning({ failures: shareLinks.pinFailures });
  return (row?.failures ?? 0) >= MAX_PIN_FAILURES ? "locked" : "wrong";
}

// ─── the unlock cookie ───────────────────────────────────────────────────────

function unlockMac(linkId: string, until: number): string {
  const secret = process.env.SESSION_SECRET ?? "";
  if (secret.length < 32) throw new Error("SESSION_SECRET must be set");
  return createHmac("sha256", secret)
    .update(`guide-unlock:${linkId}:${until}`)
    .digest("base64url");
}

/** A cookie value proving the PIN was entered for this link, good for an hour. */
export function unlockCookie(
  linkId: string,
  now = Date.now(),
): { value: string; maxAge: number } {
  const until = now + UNLOCK_MINUTES * 60 * 1000;
  return {
    value: `${until}.${unlockMac(linkId, until)}`,
    maxAge: UNLOCK_MINUTES * 60,
  };
}

export function unlockValid(
  linkId: string,
  value: string | undefined,
  now = Date.now(),
): boolean {
  if (!value) return false;
  const [untilText, mac] = value.split(".");
  const until = Number(untilText);
  if (!Number.isFinite(until) || until <= now || !mac) return false;
  return tokensMatch(mac, unlockMac(linkId, until));
}

export function unlockCookieName(linkId: string): string {
  return `hd_unlock_${linkId.replace(/-/g, "")}`;
}

/** Link-preview fetchers (iMessage, Slack, WhatsApp…) get a stub and are not counted. */
export function isPreviewBot(userAgent: string | null): boolean {
  return /bot|crawler|spider|preview|facebookexternalhit|slack|whatsapp|telegram|discord|skype|linkedin|embedly|pinterest|redditbot|applebot|inspectiontool/i.test(
    userAgent ?? "",
  );
}
