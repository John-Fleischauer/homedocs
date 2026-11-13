/*
 * Stored connections, linking from the picker, the thumbnail cache, and the
 * lazy "is this still there?" check.
 */

import { and, eq, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { recordAudit } from "../core/audit";
import { inTransaction, liveIn } from "../core/internal";
import { cleanUrl } from "../core/records";
import {
  assertAdmin,
  assertCanEdit,
  ValidationError,
  type ActorContext,
  type Executor,
  type PropertyScope,
} from "../core/types";
import { seal, tryUnseal } from "../crypto/sealed";
import { externalRefs, fixtures, integrations } from "../db/schema";
import { OWNER_TABLES, type Owner } from "../files/attachments";
import { dataDir } from "../files/store";
import { listLinks } from "../links/links";
import { createFixture } from "../fixtures/fixtures";
import {
  fetchRemote,
  fetchThumb,
  IntegrationError,
  documentFiling,
  documentsFiled,
  filteredDocumentsUrl,
  isHomeboxLocation,
  itemsInLocation,
  paperlessFilter,
  probe,
  searchRemote,
  validExternalId,
  type Connection,
  type Hit,
  type PaperlessFilterKind,
  type SearchKind,
  type System,
} from "./clients";

export const SYSTEMS: System[] = ["homebox", "paperless"];
export const SYSTEM_NAME: Record<System, string> = {
  homebox: "Homebox",
  paperless: "paperless",
};

export async function listIntegrations(exec: Executor, scope: PropertyScope) {
  const rows = await exec
    .select()
    .from(integrations)
    .where(eq(integrations.propertyId, scope.propertyId));
  // The sealed token stays in this module.
  return rows.map((row) => {
    const { sealedToken, ...rest } = row;
    void sealedToken;
    return rest;
  });
}

export async function connectionFor(
  exec: Executor,
  scope: PropertyScope,
  system: System,
): Promise<Connection | null> {
  const [row] = await exec
    .select()
    .from(integrations)
    .where(
      and(
        eq(integrations.propertyId, scope.propertyId),
        eq(integrations.system, system),
      ),
    );
  if (!row) return null;
  const opened = tryUnseal(row.sealedToken);
  if (!("value" in opened)) return null;
  return {
    system,
    baseUrl: row.baseUrl,
    token: opened.value,
    requiredTags: row.requiredTags.map((t) => t.id),
  };
}

/**
 * Require a paperless tag on every document homedocs lists or searches — the
 * house's own tag, when paperless also holds another home's papers. Its name
 * is fetched from paperless, not taken from the browser.
 */
export async function requirePaperlessTag(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  externalId: string,
) {
  assertAdmin(actor);
  const f = paperlessFilter(externalId);
  if (f?.kind !== "tag") throw new ValidationError("Pick a paperless tag.");
  const conn = await connectionFor(exec, scope, "paperless");
  if (!conn) throw new ValidationError("paperless isn’t connected.");
  let hit: Hit;
  try {
    hit = await fetchRemote(conn, externalId);
  } catch (err) {
    if (err instanceof IntegrationError) throw new ValidationError(err.message);
    throw err;
  }
  await setRequiredTags(exec, scope, actor, (tags) => [
    ...tags.filter((t) => t.id !== f.id),
    { id: f.id, name: hit.title.slice(0, 200) },
  ]);
}

export async function unrequirePaperlessTag(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  tagId: number,
) {
  assertAdmin(actor);
  await setRequiredTags(exec, scope, actor, (tags) =>
    tags.filter((t) => t.id !== tagId),
  );
}

async function setRequiredTags(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  change: (
    tags: { id: number; name: string }[],
  ) => { id: number; name: string }[],
) {
  await inTransaction(exec, async (tx) => {
    const where = and(
      eq(integrations.propertyId, scope.propertyId),
      eq(integrations.system, "paperless"),
    );
    const [row] = await tx
      .select({ id: integrations.id, requiredTags: integrations.requiredTags })
      .from(integrations)
      .where(where)
      .for("update");
    if (!row) throw new ValidationError("paperless isn’t connected.");
    const requiredTags = change(row.requiredTags);
    await tx
      .update(integrations)
      .set({ requiredTags, updatedAt: new Date(), updatedBy: actor.userId })
      .where(where);
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "integration",
      entityId: row.id,
      before: { requiredTags: row.requiredTags },
      after: { requiredTags },
    });
  });
}

/** Save (and test) a connection. A blank token keeps the stored one. */
export async function saveIntegration(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  system: System,
  input: { baseUrl: string; token?: string },
): Promise<{ summary: string; warning?: string }> {
  assertAdmin(actor);
  const baseUrl = cleanUrl(input.baseUrl).replace(/\/+$/, "");
  if (!baseUrl)
    throw new ValidationError(
      "Enter the address you open it at, like https://homebox.example.com.",
    );
  const existing = await connectionFor(exec, scope, system);
  const token = input.token?.trim() || existing?.token;
  if (!token) throw new ValidationError("Paste an API token.");
  if (system === "homebox" && !token.startsWith("hb_")) {
    throw new ValidationError(
      "Use a Homebox API key (it starts with hb_) — make one under your Homebox profile.",
    );
  }

  let result: { summary: string; warning?: string };
  try {
    result = await probe({ system, baseUrl, token });
  } catch (err) {
    if (err instanceof IntegrationError)
      throw new ValidationError(`Not saved: ${err.message}`);
    throw err;
  }

  await inTransaction(exec, async (tx) => {
    const values = {
      baseUrl,
      sealedToken: seal(token),
      lastStatus: result.summary,
      lastCheckedAt: new Date(),
      updatedAt: new Date(),
      updatedBy: actor.userId,
    };
    await tx
      .insert(integrations)
      .values({ ...values, propertyId: scope.propertyId, system })
      .onConflictDoUpdate({
        target: [integrations.propertyId, integrations.system],
        set: values,
      });
    // The token is never written to the audit log.
    await recordAudit(tx, actor, {
      action: "update",
      entityType: "integration",
      entityId: scope.propertyId,
      after: { system, baseUrl },
    });
  });
  return result;
}

export async function removeIntegration(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  system: System,
) {
  assertAdmin(actor);
  await exec
    .delete(integrations)
    .where(
      and(
        eq(integrations.propertyId, scope.propertyId),
        eq(integrations.system, system),
      ),
    );
}

export async function searchSystem(
  exec: Executor,
  scope: PropertyScope,
  system: System,
  query: string,
  kind?: SearchKind,
): Promise<Hit[]> {
  const conn = await connectionFor(exec, scope, system);
  if (!conn)
    throw new ValidationError(
      `${SYSTEM_NAME[system]} isn’t connected. An admin can connect it in Settings.`,
    );
  const browsable = kind === "tag" || kind === "correspondent";
  if (!query.trim() && !browsable) return [];
  try {
    return await searchRemote(conn, query, kind);
  } catch (err) {
    if (err instanceof IntegrationError) throw new ValidationError(err.message);
    throw err;
  }
}

/**
 * Link a record picked in the search sheet. The title is fetched again here
 * rather than taken from the browser: what gets stored is what the other app
 * says, not what a request claimed.
 */
export async function linkPicked(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  owner: Owner,
  system: System,
  externalId: string,
) {
  assertCanEdit(actor);
  if (!validExternalId(system, externalId))
    throw new ValidationError("That isn’t a record I can link.");
  const conn = await connectionFor(exec, scope, system);
  if (!conn)
    throw new ValidationError(`${SYSTEM_NAME[system]} isn’t connected.`);
  let hit: Hit;
  try {
    hit = await fetchRemote(conn, externalId);
  } catch (err) {
    if (err instanceof IntegrationError) throw new ValidationError(err.message);
    throw err;
  }
  const { table, column } = OWNER_TABLES[owner.kind];
  return inTransaction(exec, async (tx) => {
    const found = await tx
      .select({ id: table.id })
      .from(table as never)
      .where(liveIn(table, scope.propertyId, owner.id));
    if (found.length === 0)
      throw new ValidationError("That record no longer exists.");
    // A record follows one tag (or one correspondent): picking another replaces it.
    const filter = paperlessFilter(hit.externalId);
    if (filter) {
      const before = await filterRefOf(tx, scope, owner, filter.kind);
      if (before) {
        await tx
          .update(externalRefs)
          .set({ deletedAt: new Date(), updatedBy: actor.userId })
          .where(eq(externalRefs.id, before.id));
      }
    }
    const [row] = await tx
      .insert(externalRefs)
      .values({
        propertyId: scope.propertyId,
        system,
        externalId: hit.externalId,
        url: hit.url,
        title: hit.title.slice(0, 200),
        subtitle: hit.subtitle.slice(0, 200),
        status: "ok",
        lastCheckedAt: new Date(),
        [column]: owner.id,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await recordAudit(tx, actor, {
      action: "link",
      entityType: "external_ref",
      entityId: row!.id,
      after: {
        system,
        externalId: hit.externalId,
        owner: `${owner.kind}:${owner.id}`,
      },
    });
    return row!;
  });
}

// ─── a place's Homebox location ──────────────────────────────────────────────

/** The Homebox location a place is linked to, if any (the first, if several). */
export async function homeboxLocationOf(
  exec: Executor,
  scope: PropertyScope,
  spaceId: string,
) {
  const refs = await exec
    .select()
    .from(externalRefs)
    .where(
      and(
        eq(externalRefs.propertyId, scope.propertyId),
        eq(externalRefs.spaceId, spaceId),
        eq(externalRefs.system, "homebox"),
        isNull(externalRefs.deletedAt),
      ),
    );
  return refs.find((r) => isHomeboxLocation(r.url)) ?? null;
}

export type HomeboxHere =
  | { state: "none" }
  | {
      state: "error";
      location: { title: string; url: string };
      message: string;
    }
  | {
      state: "ok";
      location: { title: string; url: string };
      total: number;
      items: (Hit & { fixture: { id: string; name: string } | null })[];
    };

/**
 * What Homebox has stored in the location this place is linked to, each item
 * marked with the fixture already linked to it, so the rest can be added in one tap.
 */
export async function homeboxItemsHere(
  exec: Executor,
  scope: PropertyScope,
  spaceId: string,
): Promise<HomeboxHere> {
  const ref = await homeboxLocationOf(exec, scope, spaceId);
  if (!ref) return { state: "none" };
  const location = { title: ref.title, url: ref.url };
  const conn = await connectionFor(exec, scope, "homebox");
  if (!conn)
    return {
      state: "error",
      location,
      message: "Homebox isn’t connected. An admin can connect it in Settings.",
    };
  let found: { hits: Hit[]; total: number };
  try {
    found = await itemsInLocation(conn, ref.externalId);
  } catch (err) {
    if (!(err instanceof IntegrationError)) throw err;
    return {
      state: "error",
      location,
      message:
        err.kind === "missing"
          ? "That location is no longer in Homebox."
          : err.message,
    };
  }
  const ids = found.hits.map((h) => h.externalId);
  const linked = ids.length
    ? await exec
        .select({
          externalId: externalRefs.externalId,
          id: fixtures.id,
          name: fixtures.name,
        })
        .from(externalRefs)
        .innerJoin(fixtures, eq(fixtures.id, externalRefs.fixtureId))
        .where(
          and(
            eq(externalRefs.propertyId, scope.propertyId),
            eq(externalRefs.system, "homebox"),
            inArray(externalRefs.externalId, ids),
            isNotNull(externalRefs.fixtureId),
            isNull(externalRefs.deletedAt),
            isNull(fixtures.deletedAt),
          ),
        )
    : [];
  const byId = new Map(
    linked.map((l) => [l.externalId, { id: l.id, name: l.name }]),
  );
  return {
    state: "ok",
    location,
    total: found.total,
    items: found.hits.map((h) => ({
      ...h,
      fixture: byId.get(h.externalId) ?? null,
    })),
  };
}

// ─── a place's paperless tag ─────────────────────────────────────────────────

/** The live paperless tag or correspondent a record follows, if any. */
export async function filterRefOf(
  exec: Executor,
  scope: PropertyScope,
  owner: Owner,
  kind: PaperlessFilterKind,
) {
  const { column } = OWNER_TABLES[owner.kind];
  const refs = await exec
    .select()
    .from(externalRefs)
    .where(
      and(
        eq(externalRefs.propertyId, scope.propertyId),
        eq(externalRefs[column], owner.id),
        eq(externalRefs.system, "paperless"),
        isNull(externalRefs.deletedAt),
      ),
    );
  return refs.find((r) => paperlessFilter(r.externalId)?.kind === kind) ?? null;
}

export type PaperlessDocs =
  | { state: "none" }
  | {
      state: "error";
      filter: { id: string; title: string; url: string };
      message: string;
    }
  | {
      state: "ok";
      filter: { id: string; title: string; url: string };
      total: number;
      documents: Hit[];
    };

/**
 * The documents paperless has filed under the tag (or, for a contact, the
 * correspondent) a record follows, so a place, project, system or contact
 * lists its manuals, receipts and invoices without anyone linking them one by
 * one. Filing in paperless is the only upkeep.
 */
export async function paperlessDocsFor(
  exec: Executor,
  scope: PropertyScope,
  owner: Owner,
  kind: PaperlessFilterKind,
): Promise<PaperlessDocs> {
  const ref = await filterRefOf(exec, scope, owner, kind);
  if (!ref) return { state: "none" };
  const conn = await connectionFor(exec, scope, "paperless");
  const filter = {
    id: ref.id,
    title: ref.title,
    url: (conn && filteredDocumentsUrl(conn, ref.externalId)) || ref.url,
  };
  if (!conn)
    return {
      state: "error",
      filter,
      message:
        "paperless isn’t connected. An admin can connect it in Settings.",
    };
  let found: { hits: Hit[]; total: number };
  try {
    found = await documentsFiled(conn, ref.externalId);
  } catch (err) {
    if (!(err instanceof IntegrationError)) throw err;
    const gone =
      kind === "tag"
        ? "That tag is no longer in paperless."
        : "That correspondent is no longer in paperless.";
    return {
      state: "error",
      filter,
      message: err.kind === "missing" ? gone : err.message,
    };
  }
  return { state: "ok", filter, total: found.total, documents: found.hits };
}

/** One row of a record's Documents: linked on its own (`linkId`), or filed under the record's tag or correspondent. */
export type DocumentRow = Hit & { linkId: string | null; status: string };

export type Documents = {
  connected: boolean;
  documents: DocumentRow[];
  /** The tag or correspondent the record follows; `total` counts everything filed under it, `shown` the newest fetched. */
  filter: null | {
    id: string;
    title: string;
    url: string;
    total: number;
    shown: number;
    error: string | null;
  };
};

/**
 * Everything a record's Documents section lists: the paperless documents
 * linked to it one by one, then the rest of what is filed under its tag or
 * correspondent (`kind`), newest first. A document that is both shows once,
 * as linked, so it can still be removed. Linked documents not checked in a
 * day are re-checked first.
 */
export async function documentsFor(
  exec: Executor,
  scope: PropertyScope,
  owner: Owner,
  kind?: PaperlessFilterKind,
): Promise<Documents> {
  const connected = (await connectionFor(exec, scope, "paperless")) !== null;
  const own = async () =>
    (await listLinks(exec, scope, owner)).filter(
      (l) => l.system === "paperless" && !paperlessFilter(l.externalId),
    );
  let links = await own();
  if (links.length && connected) {
    await refreshStale(
      exec,
      scope,
      links.map((l) => l.id),
    );
    links = await own();
  }
  const documents: DocumentRow[] = links.map((l) => ({
    externalId: l.externalId,
    title: l.title,
    subtitle: l.subtitle,
    url: l.url,
    hasThumb: connected && l.status === "ok",
    linkId: l.id,
    status: l.status,
  }));

  const filed =
    kind && connected
      ? await paperlessDocsFor(exec, scope, owner, kind)
      : ({ state: "none" } as const);
  if (filed.state === "none") return { connected, documents, filter: null };
  if (filed.state === "error")
    return {
      connected,
      documents,
      filter: { ...filed.filter, total: 0, shown: 0, error: filed.message },
    };
  const linked = new Set(documents.map((d) => d.externalId));
  for (const d of filed.documents) {
    if (!linked.has(d.externalId))
      documents.push({ ...d, linkId: null, status: "ok" });
  }
  return {
    connected,
    documents,
    filter: {
      ...filed.filter,
      total: filed.total,
      shown: filed.documents.length,
      error: null,
    },
  };
}

/**
 * Add a Homebox item to a place as a fixture, linked back to the item. The
 * name comes from Homebox (fetched here, not taken from the browser), and the
 * fixture and its link are written together.
 */
export async function addFixtureFromHomebox(
  exec: Executor,
  scope: PropertyScope,
  actor: ActorContext,
  spaceId: string,
  externalId: string,
) {
  assertCanEdit(actor);
  if (!validExternalId("homebox", externalId))
    throw new ValidationError("That isn’t a Homebox item.");
  const conn = await connectionFor(exec, scope, "homebox");
  if (!conn) throw new ValidationError("Homebox isn’t connected.");
  let hit: Hit;
  try {
    hit = await fetchRemote(conn, externalId);
  } catch (err) {
    if (err instanceof IntegrationError) throw new ValidationError(err.message);
    throw err;
  }
  if (isHomeboxLocation(hit.url))
    throw new ValidationError("That’s a Homebox location, not an item.");
  return inTransaction(exec, async (tx) => {
    const fixture = await createFixture(tx, scope, actor, {
      name: hit.title.slice(0, 200),
      spaceId,
    });
    const [row] = await tx
      .insert(externalRefs)
      .values({
        propertyId: scope.propertyId,
        system: "homebox",
        externalId: hit.externalId,
        url: hit.url,
        title: hit.title.slice(0, 200),
        subtitle: hit.subtitle.slice(0, 200),
        status: "ok",
        lastCheckedAt: new Date(),
        fixtureId: fixture.id,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      })
      .returning();
    await recordAudit(tx, actor, {
      action: "link",
      entityType: "external_ref",
      entityId: row!.id,
      after: {
        system: "homebox",
        externalId: hit.externalId,
        owner: `fixture:${fixture.id}`,
      },
    });
    return fixture;
  });
}

// ─── keeping links honest ────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Re-check links not looked at in a day: a deleted item shows "No longer
 * there" (keeping its last known title), a refused token shows "Reconnect".
 * Bounded in time so a slow server never holds a page up for long.
 */
export async function refreshStale(
  exec: Executor,
  scope: PropertyScope,
  refIds: string[],
  budgetMs = 1500,
) {
  if (refIds.length === 0) return;
  const stale = await exec
    .select()
    .from(externalRefs)
    .where(
      and(
        eq(externalRefs.propertyId, scope.propertyId),
        isNull(externalRefs.deletedAt),
        or(
          isNull(externalRefs.lastCheckedAt),
          lt(externalRefs.lastCheckedAt, new Date(Date.now() - DAY_MS)),
        ),
      ),
    );
  const work = stale
    .filter((r) => refIds.includes(r.id) && r.system !== "homeassistant")
    .map(async (ref) => {
      const conn = await connectionFor(exec, scope, ref.system as System);
      if (!conn) return;
      let patch: Partial<typeof externalRefs.$inferSelect> = {
        lastCheckedAt: new Date(),
      };
      try {
        const hit = await fetchRemote(conn, ref.externalId);
        patch = {
          ...patch,
          status: "ok",
          title: hit.title.slice(0, 200),
          subtitle: hit.subtitle.slice(0, 200),
        };
      } catch (err) {
        if (!(err instanceof IntegrationError)) throw err;
        if (err.kind === "missing") patch.status = "missing";
        else if (err.kind === "auth") patch.status = "auth_error";
        else return; // unreachable: try again next time, change nothing
      }
      await exec
        .update(externalRefs)
        .set(patch)
        .where(eq(externalRefs.id, ref.id));
    });
  await Promise.race([
    Promise.allSettled(work),
    new Promise((r) => setTimeout(r, budgetMs)),
  ]);
}

// ─── thumbnails ──────────────────────────────────────────────────────────────

const THUMB_TTL_MS = DAY_MS;

/**
 * Whether a paperless document is filed under a tag or correspondent some
 * record follows — what makes it reachable from that record's Documents list.
 * Asked of paperless, not the browser.
 */
async function underLinkedFilter(
  exec: Executor,
  scope: PropertyScope,
  docId: string,
): Promise<boolean> {
  if (paperlessFilter(docId)) return false;
  const refs = await exec
    .select({ externalId: externalRefs.externalId })
    .from(externalRefs)
    .where(
      and(
        eq(externalRefs.propertyId, scope.propertyId),
        eq(externalRefs.system, "paperless"),
        isNull(externalRefs.deletedAt),
      ),
    );
  const filters = refs
    .map((r) => paperlessFilter(r.externalId))
    .filter((f) => f !== null);
  if (filters.length === 0) return false;
  const conn = await connectionFor(exec, scope, "paperless");
  if (!conn) return false;
  try {
    const filed = await documentFiling(conn, docId);
    // Only what a Documents list could have shown: the house's required tags too.
    if (!(conn.requiredTags ?? []).every((t) => filed.tags.includes(t)))
      return false;
    return filters.some((f) =>
      f.kind === "tag"
        ? filed.tags.includes(f.id)
        : filed.correspondent === f.id,
    );
  } catch {
    return false;
  }
}

/**
 * A linked record's thumbnail, through our server and cached on disk. Only ids
 * that a live link in this property points at (or, for paperless, documents
 * under a linked tag or correspondent) are ever fetched, so this cannot be used to browse the other app.
 */
export async function linkedThumb(
  exec: Executor,
  scope: PropertyScope,
  system: System,
  externalId: string,
): Promise<Buffer | null> {
  if (!validExternalId(system, externalId)) return null;
  const [ref] = await exec
    .select({ id: externalRefs.id })
    .from(externalRefs)
    .where(
      and(
        eq(externalRefs.propertyId, scope.propertyId),
        eq(externalRefs.system, system),
        eq(externalRefs.externalId, externalId),
        isNull(externalRefs.deletedAt),
      ),
    )
    .limit(1);
  if (
    !ref &&
    !(
      system === "paperless" &&
      (await underLinkedFilter(exec, scope, externalId))
    )
  )
    return null;

  const path = join(dataDir(), "ext-cache", `${system}-${externalId}.jpg`);
  try {
    const info = await stat(path);
    if (Date.now() - info.mtimeMs < THUMB_TTL_MS) return await readFile(path);
  } catch {
    // not cached yet
  }
  const conn = await connectionFor(exec, scope, system);
  if (!conn) return null;
  try {
    const raw = await fetchThumb(conn, externalId);
    if (!raw) return null;
    // Re-encoded: whatever came back is proven to be an image, and small.
    const jpeg = await sharp(raw)
      .resize({
        width: 480,
        height: 480,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 78 })
      .toBuffer();
    await mkdir(join(dataDir(), "ext-cache"), { recursive: true });
    await writeFile(path, jpeg);
    return jpeg;
  } catch {
    return null;
  }
}
