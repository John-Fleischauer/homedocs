/*
 * Server-side clients for Homebox and paperless-ngx.
 *
 * Every call goes through the server, never the browser: Homebox has no CORS
 * setup for third-party origins, and a token in the browser is a token anyone
 * with the page can read. Only fixed paths on the admin-configured base URL are
 * ever requested, with ids validated first — nothing a visitor types becomes
 * part of a URL.
 *
 * Targets:
 *   Homebox ≥ 0.26 — `/api/v1/entities` (0.26 replaced /items and /locations),
 *     long-lived `hb_` API keys sent as `Authorization: Bearer`.
 *   paperless-ngx, API version 10 — `Authorization: Token`, and the version is
 *     pinned in Accept so a server upgrade cannot reshape responses under us.
 *
 * These shapes come from the projects' published API docs and have not been
 * exercised against every version; parsing is deliberately defensive.
 */

export type System = "homebox" | "paperless";

export class IntegrationError extends Error {
  constructor(
    message: string,
    readonly kind: "auth" | "missing" | "unreachable" | "unexpected",
  ) {
    super(message);
  }
}

export type Connection = {
  system: System;
  baseUrl: string;
  token: string;
  /** paperless: tag ids every listed or searched document must also have (the house's tag). */
  requiredTags?: number[];
};

/** "&tags__id__all=4,9" for the house's required tags, plus any `also`; "" when there are none. */
function requiredTagsParam(conn: Connection, also: number[] = []): string {
  const ids = [...new Set([...also, ...(conn.requiredTags ?? [])])].filter(
    (t) => Number.isInteger(t),
  );
  return ids.length ? `&tags__id__all=${ids.join(",")}` : "";
}

export type Hit = {
  externalId: string;
  title: string;
  subtitle: string;
  url: string;
  hasThumb: boolean;
};

const TIMEOUT_MS = 8_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/*
 * A paperless document is its number. A paperless *filter* — a tag, or a
 * correspondent — is stored as "tag:<number>" or "correspondent:<number>", so
 * it never collides with a document: linking one means "everything filed
 * under it".
 */
const PL_DOC = /^\d{1,12}$/;
const PL_FILTER = /^(tag|correspondent):(\d{1,12})$/;

export type PaperlessFilterKind = "tag" | "correspondent";

export function validExternalId(system: System, id: string): boolean {
  return system === "homebox"
    ? UUID.test(id)
    : PL_DOC.test(id) || PL_FILTER.test(id);
}

/** What a stored paperless link filters on, or null when it is one document. */
export function paperlessFilter(
  externalId: string,
): { kind: PaperlessFilterKind; id: number } | null {
  const m = PL_FILTER.exec(externalId);
  return m ? { kind: m[1] as PaperlessFilterKind, id: Number(m[2]) } : null;
}

function base(conn: Connection): string {
  return conn.baseUrl.replace(/\/+$/, "");
}

function headers(
  conn: Connection,
  accept = "application/json",
): Record<string, string> {
  return conn.system === "homebox"
    ? { Authorization: `Bearer ${conn.token}`, Accept: accept }
    : {
        Authorization: `Token ${conn.token}`,
        Accept:
          accept === "application/json"
            ? "application/json; version=10"
            : accept,
      };
}

async function request(
  conn: Connection,
  path: string,
  accept?: string,
): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${base(conn)}${path}`, {
      headers: headers(conn, accept),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new IntegrationError(
      `Couldn’t reach ${conn.system === "homebox" ? "Homebox" : "paperless"}.`,
      "unreachable",
    );
  }
  if (res.status === 401 || res.status === 403) {
    throw new IntegrationError(
      "The saved token was refused. Reconnect in Settings.",
      "auth",
    );
  }
  if (res.status === 404) throw new IntegrationError("Not found.", "missing");
  if (!res.ok)
    throw new IntegrationError(
      `Unexpected answer (${res.status}).`,
      "unexpected",
    );
  return res;
}

async function json<T>(conn: Connection, path: string): Promise<T> {
  const res = await request(conn, path);
  try {
    return (await res.json()) as T;
  } catch {
    throw new IntegrationError(
      "The answer was not JSON — is the address right?",
      "unexpected",
    );
  }
}

// ─── Homebox ─────────────────────────────────────────────────────────────────

type HbEntity = {
  id: string;
  name?: string;
  description?: string;
  parent?: { id?: string; name?: string } | null;
  location?: { id?: string; name?: string } | null;
  entityType?: { name?: string; isLocation?: boolean } | string | null;
  itemCount?: number;
  thumbnailId?: string | null;
  imageId?: string | null;
};

const TRANSLATION_KEY = /^[a-z_]+(\.[a-z_]+)+$/i;

function hbIsLocation(e: HbEntity): boolean {
  return typeof e.entityType === "object" && e.entityType?.isLocation === true;
}

function hbHit(conn: Connection, e: HbEntity): Hit {
  const place = e.parent?.name ?? e.location?.name ?? "";
  const raw =
    typeof e.entityType === "string"
      ? e.entityType
      : (e.entityType?.name ?? "");
  // Homebox's built-in types are named by translation key ("global.location"); only a family's own type names say anything.
  const type = TRANSLATION_KEY.test(raw) ? "" : raw;
  const location = hbIsLocation(e);
  const count =
    location && typeof e.itemCount === "number"
      ? `${e.itemCount} item${e.itemCount === 1 ? "" : "s"}`
      : "";
  return {
    externalId: e.id,
    title: e.name || (location ? "Untitled location" : "Untitled item"),
    subtitle: [place, type, count].filter(Boolean).join(" · "),
    // The UI route says which kind of record this is; see isHomeboxLocation().
    url: `${base(conn)}/${location ? "location" : "item"}/${e.id}`,
    hasThumb: Boolean(e.thumbnailId || e.imageId),
  };
}

// ─── paperless ───────────────────────────────────────────────────────────────

type PlDoc = {
  id: number;
  title?: string;
  created?: string;
  created_date?: string;
  original_file_name?: string;
};

type PlNamed = { id: number; name?: string; document_count?: number };

const FILTER = {
  // API path, the documents filter for the API, and the one paperless's own document list reads.
  tag: {
    path: "/api/tags/",
    api: "tags__id__all",
    ui: "tags__id__all",
    word: "Tag",
  },
  correspondent: {
    path: "/api/correspondents/",
    api: "correspondent__id",
    ui: "correspondent__id__in",
    word: "Correspondent",
  },
} as const;

function plFilterHit(
  conn: Connection,
  kind: PaperlessFilterKind,
  t: PlNamed,
): Hit {
  const n =
    typeof t.document_count === "number"
      ? `${t.document_count} document${t.document_count === 1 ? "" : "s"}`
      : "";
  const f = FILTER[kind];
  return {
    externalId: `${kind}:${t.id}`,
    title: t.name || `${f.word} #${t.id}`,
    subtitle: [f.word, n].filter(Boolean).join(" · "),
    url: `${base(conn)}/documents?${f.ui}=${t.id}`,
    hasThumb: false,
  };
}

function plHit(conn: Connection, d: PlDoc): Hit {
  const created = (d.created_date ?? d.created ?? "").slice(0, 10);
  return {
    externalId: String(d.id),
    title: d.title || d.original_file_name || `Document #${d.id}`,
    subtitle: created ? `Added ${created}` : "",
    url: `${base(conn)}/documents/${d.id}/details`,
    hasThumb: true,
  };
}

// ─── the shared surface ──────────────────────────────────────────────────────

/** What "Test connection" reports: a version, a document count — or throws. */
export async function probe(
  conn: Connection,
): Promise<{ summary: string; warning?: string }> {
  if (conn.system === "homebox") {
    const status = await json<{
      build?: { version?: string };
      version?: string;
    }>(conn, "/api/v1/status");
    const version = status.build?.version ?? status.version ?? "unknown";
    // Prove the key works and the 0.26 entities API exists.
    await json(conn, "/api/v1/entities?pageSize=1");
    const old = /^v?0\.(\d+)\./.exec(version);
    return {
      summary: `Homebox ${version}`,
      warning:
        old && Number(old[1]) < 26
          ? "homedocs needs Homebox 0.26 or newer."
          : undefined,
    };
  }
  const page = await json<{ count?: number }>(
    conn,
    "/api/documents/?page_size=1",
  );
  const count = page.count ?? 0;
  return {
    summary: `paperless — this token can see ${count} document${count === 1 ? "" : "s"}`,
    // Anyone in the family can search through this token, so it should not see the tax returns.
    warning:
      count > 500
        ? "That’s a lot of documents. Everyone who can edit homedocs can search them — consider a paperless user that only sees home documents."
        : undefined,
  };
}

/** A stored Homebox link is a location (a room, a shelf) rather than an item. */
export function isHomeboxLocation(url: string): boolean {
  return /\/location\/[0-9a-f-]{36}$/i.test(url);
}

export type SearchKind = "location" | PaperlessFilterKind;

/**
 * Search Homebox items, or its locations (rooms, shelves, bins); paperless
 * documents, or its tags or correspondents. Tags and correspondents are a short
 * list, so an empty query lists them all to browse.
 */
export async function searchRemote(
  conn: Connection,
  query: string,
  kind?: SearchKind,
): Promise<Hit[]> {
  const q = encodeURIComponent(query.trim().slice(0, 100));
  if (conn.system === "homebox") {
    const narrow = kind === "location" ? "&isLocation=true" : "";
    const page = await json<{ items?: HbEntity[] }>(
      conn,
      `/api/v1/entities?q=${q}${narrow}&pageSize=20&orderBy=name`,
    );
    return (page.items ?? [])
      .filter((e) => UUID.test(e.id))
      .map((e) => hbHit(conn, e));
  }
  if (kind === "tag" || kind === "correspondent") {
    const named = q ? `name__icontains=${q}&` : "";
    const page = await json<{ results?: PlNamed[] }>(
      conn,
      `${FILTER[kind].path}?${named}page_size=100&ordering=name`,
    );
    return (page.results ?? [])
      .filter((t) => Number.isInteger(t.id))
      .map((t) => plFilterHit(conn, kind, t));
  }
  const page = await json<{ results?: PlDoc[] }>(
    conn,
    `/api/documents/?query=${q}&page_size=20${requiredTagsParam(conn)}`,
  );
  return (page.results ?? [])
    .filter((d) => Number.isInteger(d.id))
    .map((d) => plHit(conn, d));
}

/** The query for a filter's documents, with the house's required tags folded in. */
function filterQuery(
  conn: Connection,
  f: { kind: PaperlessFilterKind; id: number },
  side: "api" | "ui",
): string {
  if (f.kind === "tag") return requiredTagsParam(conn, [f.id]).slice(1);
  return `${FILTER.correspondent[side]}=${f.id}${requiredTagsParam(conn)}`;
}

/** paperless's own document list for a tag or correspondent, narrowed the same way homedocs narrows it. */
export function filteredDocumentsUrl(
  conn: Connection,
  filterRef: string,
): string | null {
  const f = paperlessFilter(filterRef);
  return f ? `${base(conn)}/documents?${filterQuery(conn, f, "ui")}` : null;
}

/** What a paperless document is filed under: its tag ids and its correspondent. */
export async function documentFiling(
  conn: Connection,
  docId: string,
): Promise<{ tags: number[]; correspondent: number | null }> {
  if (conn.system !== "paperless" || !PL_DOC.test(docId))
    throw new IntegrationError("Not found.", "missing");
  const doc = await json<{ tags?: number[]; correspondent?: number | null }>(
    conn,
    `/api/documents/${docId}/`,
  );
  return {
    tags: (doc.tags ?? []).filter((t) => Number.isInteger(t)),
    correspondent: Number.isInteger(doc.correspondent)
      ? (doc.correspondent as number)
      : null,
  };
}

/** The documents filed under a paperless tag or correspondent, newest first. Capped like itemsInLocation. */
export async function documentsFiled(
  conn: Connection,
  filterRef: string,
  limit = 50,
): Promise<{ hits: Hit[]; total: number }> {
  const f = paperlessFilter(filterRef);
  if (conn.system !== "paperless" || !f)
    throw new IntegrationError("Not found.", "missing");
  const page = await json<{ results?: PlDoc[]; count?: number }>(
    conn,
    `/api/documents/?${filterQuery(conn, f, "api")}&page_size=${limit}&ordering=-created`,
  );
  const hits = (page.results ?? [])
    .filter((d) => Number.isInteger(d.id))
    .map((d) => plHit(conn, d));
  return {
    hits,
    total: typeof page.count === "number" ? page.count : hits.length,
  };
}

/**
 * The items directly inside a Homebox location — not sub-locations, which
 * Homebox 0.26 leaves out of item queries. Capped: a place with more than
 * this is a storage room, and search is the better tool there.
 */
export async function itemsInLocation(
  conn: Connection,
  locationId: string,
  limit = 100,
): Promise<{ hits: Hit[]; total: number }> {
  if (conn.system !== "homebox" || !UUID.test(locationId))
    throw new IntegrationError("Not found.", "missing");
  const page = await json<{ items?: HbEntity[]; total?: number }>(
    conn,
    `/api/v1/entities?parentIds=${locationId}&pageSize=${limit}&orderBy=name`,
  );
  const hits = (page.items ?? [])
    .filter((e) => UUID.test(e.id) && !hbIsLocation(e))
    .map((e) => hbHit(conn, e));
  return {
    hits,
    total: typeof page.total === "number" ? page.total : hits.length,
  };
}

export async function fetchRemote(
  conn: Connection,
  externalId: string,
): Promise<Hit> {
  if (!validExternalId(conn.system, externalId))
    throw new IntegrationError("Not found.", "missing");
  if (conn.system === "homebox")
    return hbHit(
      conn,
      await json<HbEntity>(conn, `/api/v1/entities/${externalId}`),
    );
  const f = paperlessFilter(externalId);
  if (f)
    return plFilterHit(
      conn,
      f.kind,
      await json<PlNamed>(conn, `${FILTER[f.kind].path}${f.id}/`),
    );
  return plHit(conn, await json<PlDoc>(conn, `/api/documents/${externalId}/`));
}

/** The thumbnail bytes, or null when the record has none. */
export async function fetchThumb(
  conn: Connection,
  externalId: string,
): Promise<Buffer | null> {
  if (!validExternalId(conn.system, externalId))
    throw new IntegrationError("Not found.", "missing");
  if (conn.system === "homebox") {
    const e = await json<HbEntity>(conn, `/api/v1/entities/${externalId}`);
    // The small thumbnail first; if Homebox won't serve it, the full image (resized on our side).
    for (const attachment of [e.thumbnailId, e.imageId]) {
      if (!attachment || !UUID.test(attachment)) continue;
      try {
        const res = await request(
          conn,
          `/api/v1/entities/${externalId}/attachments/${attachment}`,
          "image/*",
        );
        return Buffer.from(await res.arrayBuffer());
      } catch (err) {
        if (err instanceof IntegrationError && err.kind === "auth") throw err;
      }
    }
    return null;
  }
  if (!PL_DOC.test(externalId)) return null; // a tag or correspondent has no picture
  const res = await request(
    conn,
    `/api/documents/${externalId}/thumb/`,
    "image/*",
  );
  return Buffer.from(await res.arrayBuffer());
}
