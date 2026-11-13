/*
 * Homebox and paperless through a fake server that answers in their documented
 * shapes (Homebox 0.26 entities, paperless API v10). What matters most: tokens
 * go in the right header and never anywhere else, a picked link is fetched
 * server-side, the thumbnail proxy only serves linked ids, and a deleted or
 * refused record is reported rather than crashing a page.
 */

import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { eq, sql } from "drizzle-orm";
import { externalRefs } from "../lib/db/schema";
import {
  addFixtureFromHomebox,
  homeboxItemsHere,
  linkedThumb,
  linkPicked,
  listIntegrations,
  documentsFor,
  paperlessDocsFor,
  requirePaperlessTag,
  unrequirePaperlessTag,
  refreshStale,
  saveIntegration,
  searchSystem,
} from "../lib/integrations/integrations";
import { createContact } from "../lib/contacts/contacts";
import { createProject } from "../lib/projects/projects";
import { listSystems } from "../lib/systems/systems";
import { createSpace } from "../lib/places/places";
import { listFixtures } from "../lib/fixtures/fixtures";
import { parseExternalUrl } from "../lib/links/links";
import { createFixture } from "../lib/fixtures/fixtures";
import { db, resetBetweenTests } from "./helpers/db";
import { household } from "./helpers/fixtures";

resetBetweenTests();
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), "homedocs-int-"));

const ITEM = "0b8e1f5c-1d2a-4c6e-9a51-3e0f2b7c9d11";
const THUMB = "7d1e2f3a-4b5c-4d6e-8f90-a1b2c3d4e5f6";
const BASEMENT = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const DEHUMIDIFIER = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
/** A thumbnail Homebox lists but will not serve. */
const GONE_THUMB = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d";
const LOCATION_TYPE = { id: "lt", name: "global.location", isLocation: true };
const ITEM_TYPE = { id: "it", name: "Item", isLocation: false };
let png: Buffer;
const seen: {
  url: string;
  auth: string | undefined;
  accept: string | undefined;
}[] = [];
let deleted = false;
let server: Server;
let base = "";

beforeAll(async () => {
  png = await sharp({
    create: { width: 64, height: 64, channels: 3, background: "#336699" },
  })
    .png()
    .toBuffer();
  server = createServer((req: IncomingMessage, res) => {
    seen.push({
      url: req.url ?? "",
      auth: req.headers.authorization,
      accept: req.headers.accept,
    });
    const send = (status: number, body: unknown, type = "application/json") => {
      res.writeHead(status, { "content-type": type });
      res.end(
        type === "application/json" ? JSON.stringify(body) : (body as Buffer),
      );
    };
    const url = new URL(req.url ?? "/", "http://x");
    const hbAuth = req.headers.authorization === "Bearer hb_good";
    const plAuth = req.headers.authorization === "Token pl_good";
    if (url.pathname.startsWith("/hb/api/v1")) {
      if (!hbAuth) return send(401, { error: "unauthorized" });
      const p = url.pathname.slice("/hb/api/v1".length);
      if (p === "/status") return send(200, { build: { version: "v0.26.2" } });
      if (p === "/entities" && url.searchParams.get("isLocation") === "true") {
        return send(200, {
          items: [
            {
              id: BASEMENT,
              name: "Basement",
              entityType: LOCATION_TYPE,
              itemCount: 2,
            },
          ],
          total: 1,
        });
      }
      if (
        p === "/entities" &&
        url.searchParams.getAll("parentIds").includes(BASEMENT)
      ) {
        const items = [
          {
            id: DEHUMIDIFIER,
            name: "Dehumidifier",
            parent: { id: BASEMENT, name: "Basement" },
            entityType: ITEM_TYPE,
          },
          {
            id: ITEM,
            name: "Water heater",
            parent: { id: BASEMENT, name: "Basement" },
            entityType: ITEM_TYPE,
          },
        ];
        return send(200, { items, page: 1, pageSize: 100, total: 2 });
      }
      if (p === `/entities/${BASEMENT}`)
        return send(200, {
          id: BASEMENT,
          name: "Basement",
          entityType: LOCATION_TYPE,
        });
      if (p === `/entities/${DEHUMIDIFIER}`) {
        return send(200, {
          id: DEHUMIDIFIER,
          name: "Dehumidifier",
          parent: { name: "Basement" },
          entityType: ITEM_TYPE,
          thumbnailId: GONE_THUMB,
          imageId: THUMB,
        });
      }
      if (p === `/entities/${DEHUMIDIFIER}/attachments/${THUMB}`)
        return send(200, png, "image/png");
      if (p === "/entities") {
        const q = url.searchParams.get("q") ?? "";
        const items = url.searchParams.has("parentIds")
          ? []
          : q.includes("heater") || !q
            ? [
                {
                  id: ITEM,
                  name: "Water heater",
                  parent: { name: "Basement" },
                  thumbnailId: THUMB,
                },
              ]
            : [];
        return send(200, { items, page: 1, pageSize: 20, total: items.length });
      }
      if (p === `/entities/${ITEM}`)
        return deleted
          ? send(404, {})
          : send(200, {
              id: ITEM,
              name: "Water heater",
              parent: { name: "Basement" },
              thumbnailId: THUMB,
            });
      if (p === `/entities/${ITEM}/attachments/${THUMB}`)
        return send(200, png, "image/png");
      return send(404, {});
    }
    if (url.pathname.startsWith("/pl/api")) {
      if (!plAuth) return send(401, { detail: "Invalid token." });
      const p = url.pathname.slice("/pl/api".length);
      if (p === "/tags/" || p === "/correspondents/") {
        const all =
          p === "/tags/"
            ? [
                { id: 7, name: "Garage", document_count: 2 },
                { id: 8, name: "Panel upgrade", document_count: 0 },
              ]
            : [{ id: 3, name: "Ace Plumbing", document_count: 1 }];
        const q = (url.searchParams.get("name__icontains") ?? "").toLowerCase();
        const results = all.filter((t) => t.name.toLowerCase().includes(q));
        return send(200, { count: results.length, results });
      }
      if (p === "/tags/7/")
        return send(200, { id: 7, name: "Garage", document_count: 2 });
      if (p === "/tags/8/")
        return send(200, { id: 8, name: "Panel upgrade", document_count: 0 });
      if (p === "/tags/4/")
        return send(200, { id: 4, name: "4846 Elm", document_count: 40 });
      if (
        p === "/documents/" &&
        url.searchParams.get("tags__id__all") === "7,4"
      ) {
        return send(200, {
          count: 1,
          results: [
            {
              id: 43,
              title: "Garage door opener manual",
              created_date: "2025-03-02",
            },
          ],
        });
      }
      if (p === "/correspondents/3/")
        return send(200, { id: 3, name: "Ace Plumbing", document_count: 1 });
      if (
        p === "/documents/" &&
        url.searchParams.get("correspondent__id") === "3"
      ) {
        return send(200, {
          count: 1,
          results: [
            { id: 45, title: "Ace invoice", created_date: "2025-06-01" },
          ],
        });
      }
      if (p === "/documents/" && url.searchParams.get("tags__id__all") === "8")
        return send(200, { count: 0, results: [] });
      if (p === "/documents/45/")
        return send(200, {
          id: 45,
          title: "Ace invoice",
          tags: [],
          correspondent: 3,
        });
      if (p === "/documents/45/thumb/") return send(200, png, "image/png");
      if (
        p === "/documents/" &&
        url.searchParams.get("tags__id__all") === "7"
      ) {
        return send(200, {
          count: 2,
          results: [
            {
              id: 43,
              title: "Garage door opener manual",
              created_date: "2025-03-02",
            },
            {
              id: 42,
              title: "Water heater manual",
              created_date: "2024-05-01",
            },
          ],
        });
      }
      if (p === "/documents/43/")
        return send(200, {
          id: 43,
          title: "Garage door opener manual",
          tags: [7, 4],
        });
      if (p === "/documents/43/thumb/") return send(200, png, "image/png");
      if (p === "/documents/44/")
        return send(200, { id: 44, title: "Tax return", tags: [9] });
      if (p === "/documents/44/thumb/") return send(200, png, "image/png");
      if (p === "/documents/") {
        if (
          url.searchParams.get("page_size") === "1" &&
          !url.searchParams.get("query")
        )
          return send(200, { count: 1234, results: [] });
        return send(200, {
          count: 1,
          results: [
            {
              id: 42,
              title: "Water heater manual",
              created_date: "2024-05-01",
            },
          ],
        });
      }
      if (p === "/documents/42/")
        return send(200, {
          id: 42,
          title: "Water heater manual",
          created_date: "2024-05-01",
        });
      if (p === "/documents/42/thumb/") return send(200, png, "image/png");
      return send(404, {});
    }
    send(404, {});
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe("connecting", () => {
  it("refuses a bad token without saving, and saves a good one sealed", async () => {
    const { scope, admin } = await household();
    await expect(
      saveIntegration(db, scope, admin, "homebox", {
        baseUrl: `${base}/hb`,
        token: "hb_bad",
      }),
    ).rejects.toThrow(/refused/);
    expect(await listIntegrations(db, scope)).toEqual([]);

    const ok = await saveIntegration(db, scope, admin, "homebox", {
      baseUrl: `${base}/hb`,
      token: "hb_good",
    });
    expect(ok.summary).toBe("Homebox v0.26.2");
    const [row] = [
      ...(await db.execute(sql`select sealed_token from integrations`)),
    ] as { sealed_token: string }[];
    expect(row!.sealed_token).not.toContain("hb_good");
    // The token is never in the audit log.
    expect(
      JSON.stringify([...(await db.execute(sql`select * from audit_log`))]),
    ).not.toContain("hb_good");
  });

  it("warns when the paperless token can see a lot", async () => {
    const { scope, admin } = await household();
    const r = await saveIntegration(db, scope, admin, "paperless", {
      baseUrl: `${base}/pl`,
      token: "pl_good",
    });
    expect(r.summary).toMatch(/1234 documents/);
    expect(r.warning).toMatch(/only sees home documents/);
    // API version pinned.
    expect(
      seen
        .filter((s) => s.url.startsWith("/pl/"))
        .every((s) => s.accept?.includes("version=10")),
    ).toBe(true);
  });

  it("is admin-only", async () => {
    const { scope, member } = await household();
    await expect(
      saveIntegration(db, scope, member, "homebox", {
        baseUrl: `${base}/hb`,
        token: "hb_good",
      }),
    ).rejects.toThrow(/Only an admin/);
  });
});

describe("linking and thumbnails", () => {
  it("searches, links a picked item, and proxies only linked thumbnails", async () => {
    const { scope, admin, member } = await household();
    await saveIntegration(db, scope, admin, "homebox", {
      baseUrl: `${base}/hb`,
      token: "hb_good",
    });
    await saveIntegration(db, scope, admin, "paperless", {
      baseUrl: `${base}/pl`,
      token: "pl_good",
    });
    const heater = await createFixture(db, scope, member, {
      name: "Water heater",
    });

    const hits = await searchSystem(db, scope, "homebox", "heater");
    expect(hits[0]).toMatchObject({
      externalId: ITEM,
      title: "Water heater",
      subtitle: "Basement",
    });

    // Not linked yet: the proxy refuses to fetch it.
    expect(await linkedThumb(db, scope, "paperless", "42")).toBeNull();

    await linkPicked(
      db,
      scope,
      member,
      { kind: "fixture", id: heater.id },
      "homebox",
      ITEM,
    );
    await linkPicked(
      db,
      scope,
      member,
      { kind: "fixture", id: heater.id },
      "paperless",
      "42",
    );
    const thumb = await linkedThumb(db, scope, "homebox", ITEM);
    expect((await sharp(thumb!).metadata()).format).toBe("jpeg");
    expect(await linkedThumb(db, scope, "paperless", "42")).not.toBeNull();
    // A path-traversal id is refused before any request.
    expect(await linkedThumb(db, scope, "paperless", "../../admin")).toBeNull();

    const [doc] = await db
      .select()
      .from(externalRefs)
      .where(eq(externalRefs.system, "paperless"));
    expect(doc!.url).toBe(`${base}/pl/documents/42/details`);
  });

  it("has no picture for a location without one, and falls back to the full image when the thumbnail is gone", async () => {
    const { scope, admin, member } = await household();
    await saveIntegration(db, scope, admin, "homebox", {
      baseUrl: `${base}/hb`,
      token: "hb_good",
    });
    const room = await createSpace(db, scope, member, { name: "Basement" });
    await linkPicked(
      db,
      scope,
      member,
      { kind: "space", id: room.id },
      "homebox",
      BASEMENT,
    );
    expect(await linkedThumb(db, scope, "homebox", BASEMENT)).toBeNull();

    const dehumidifier = await createFixture(db, scope, member, {
      name: "Dehumidifier",
    });
    await linkPicked(
      db,
      scope,
      member,
      { kind: "fixture", id: dehumidifier.id },
      "homebox",
      DEHUMIDIFIER,
    );
    const thumb = await linkedThumb(db, scope, "homebox", DEHUMIDIFIER);
    expect((await sharp(thumb!).metadata()).format).toBe("jpeg");
  });

  it("lists the documents under a place’s paperless tag, with their thumbnails and no others", async () => {
    const { scope, admin, member } = await household();
    await saveIntegration(db, scope, admin, "paperless", {
      baseUrl: `${base}/pl`,
      token: "pl_good",
    });
    const garage = await createSpace(db, scope, member, { name: "Garage" });
    const owner = { kind: "space" as const, id: garage.id };
    expect(await paperlessDocsFor(db, scope, owner, "tag")).toEqual({
      state: "none",
    });

    // An empty search lists every tag to browse; typing narrows it.
    expect(
      (await searchSystem(db, scope, "paperless", "", "tag")).map(
        (t) => t.title,
      ),
    ).toEqual(["Garage", "Panel upgrade"]);
    const [tag] = await searchSystem(db, scope, "paperless", "gar", "tag");
    expect(tag).toMatchObject({
      externalId: "tag:7",
      title: "Garage",
      subtitle: "Tag · 2 documents",
      url: `${base}/pl/documents?tags__id__all=7`,
    });
    await linkPicked(
      db,
      scope,
      member,
      { kind: "space", id: garage.id },
      "paperless",
      tag!.externalId,
    );

    const here = await paperlessDocsFor(db, scope, owner, "tag");
    expect(here).toMatchObject({
      state: "ok",
      total: 2,
      filter: { title: "Garage" },
    });
    if (here.state !== "ok") throw new Error("unreachable");
    expect(here.documents.map((d) => d.title)).toEqual([
      "Garage door opener manual",
      "Water heater manual",
    ]);

    // A document under the linked tag gets a thumbnail; one that isn't, and the tag itself, don't.
    expect(await linkedThumb(db, scope, "paperless", "43")).not.toBeNull();
    expect(await linkedThumb(db, scope, "paperless", "44")).toBeNull();
    expect(await linkedThumb(db, scope, "paperless", "tag:7")).toBeNull();

    // Picking another tag replaces the first.
    await linkPicked(db, scope, member, owner, "paperless", "tag:8");
    expect(await paperlessDocsFor(db, scope, owner, "tag")).toMatchObject({
      state: "ok",
      total: 0,
      filter: { title: "Panel upgrade" },
    });
    const live = await db
      .select()
      .from(externalRefs)
      .where(eq(externalRefs.spaceId, garage.id));
    expect(live.filter((r) => !r.deletedAt).map((r) => r.externalId)).toEqual([
      "tag:8",
    ]);
  });

  it("narrows every Documents list to the house’s own tag", async () => {
    const { scope, admin, member } = await household();
    await saveIntegration(db, scope, admin, "paperless", {
      baseUrl: `${base}/pl`,
      token: "pl_good",
    });
    const garage = await createSpace(db, scope, member, { name: "Garage" });
    const owner = { kind: "space" as const, id: garage.id };
    await linkPicked(db, scope, member, owner, "paperless", "tag:7");

    await expect(
      requirePaperlessTag(db, scope, member, "tag:4"),
    ).rejects.toThrow();
    await expect(
      requirePaperlessTag(db, scope, admin, "correspondent:3"),
    ).rejects.toThrow(/tag/);
    await requirePaperlessTag(db, scope, admin, "tag:4");
    expect(
      (await listIntegrations(db, scope)).find((i) => i.system === "paperless")
        ?.requiredTags,
    ).toEqual([{ id: 4, name: "4846 Elm" }]);

    // The old house's water heater manual (42) drops out, here and in paperless's own list.
    const docs = await paperlessDocsFor(db, scope, owner, "tag");
    expect(docs).toMatchObject({
      state: "ok",
      total: 1,
      filter: { url: `${base}/pl/documents?tags__id__all=7,4` },
    });
    expect(docs.state === "ok" && docs.documents.map((d) => d.title)).toEqual([
      "Garage door opener manual",
    ]);
    await searchSystem(db, scope, "paperless", "manual");
    expect(seen.at(-1)!.url).toContain("tags__id__all=4");

    await unrequirePaperlessTag(db, scope, admin, 4);
    expect(await paperlessDocsFor(db, scope, owner, "tag")).toMatchObject({
      state: "ok",
      total: 2,
    });
  });

  it("lists a contact’s documents by paperless correspondent, and a system’s or project’s by tag", async () => {
    const { scope, admin, member } = await household();
    await saveIntegration(db, scope, admin, "paperless", {
      baseUrl: `${base}/pl`,
      token: "pl_good",
    });
    const ace = await createContact(db, scope, member, {
      name: "Ace Plumbing",
    });
    const [corr] = await searchSystem(
      db,
      scope,
      "paperless",
      "",
      "correspondent",
    );
    expect(corr).toMatchObject({
      externalId: "correspondent:3",
      subtitle: "Correspondent · 1 document",
      url: `${base}/pl/documents?correspondent__id__in=3`,
    });
    await linkPicked(
      db,
      scope,
      member,
      { kind: "contact", id: ace.id },
      "paperless",
      corr!.externalId,
    );
    const docs = await paperlessDocsFor(
      db,
      scope,
      { kind: "contact", id: ace.id },
      "correspondent",
    );
    expect(docs.state === "ok" && docs.documents.map((d) => d.title)).toEqual([
      "Ace invoice",
    ]);
    // Filed under a linked correspondent: its thumbnail is reachable.
    expect(await linkedThumb(db, scope, "paperless", "45")).not.toBeNull();

    const water = (await listSystems(db, scope)).find(
      (s) => s.name === "Water & plumbing",
    )!;
    await linkPicked(
      db,
      scope,
      member,
      { kind: "system", id: water.id },
      "paperless",
      "tag:7",
    );
    expect(
      await paperlessDocsFor(
        db,
        scope,
        { kind: "system", id: water.id },
        "tag",
      ),
    ).toMatchObject({ state: "ok", total: 2 });
    const panel = await createProject(db, scope, member, {
      title: "Panel upgrade",
    });
    await linkPicked(
      db,
      scope,
      member,
      { kind: "project", id: panel.id },
      "paperless",
      "tag:8",
    );
    expect(
      await paperlessDocsFor(
        db,
        scope,
        { kind: "project", id: panel.id },
        "tag",
      ),
    ).toMatchObject({ state: "ok", filter: { title: "Panel upgrade" } });
  });

  it("lists linked documents first, then the rest of the tag’s, each once", async () => {
    const { scope, admin, member } = await household();
    await saveIntegration(db, scope, admin, "paperless", {
      baseUrl: `${base}/pl`,
      token: "pl_good",
    });
    const garage = await createSpace(db, scope, member, { name: "Garage" });
    const owner = { kind: "space" as const, id: garage.id };
    expect(await documentsFor(db, scope, owner, "tag")).toEqual({
      connected: true,
      documents: [],
      filter: null,
    });

    // Water heater manual (42) is linked on its own and also filed under Garage (7).
    const linked = await linkPicked(
      db,
      scope,
      member,
      owner,
      "paperless",
      "42",
    );
    await linkPicked(db, scope, member, owner, "paperless", "tag:7");
    const docs = await documentsFor(db, scope, owner, "tag");
    expect(docs.documents.map((d) => [d.title, d.linkId])).toEqual([
      ["Water heater manual", linked.id],
      ["Garage door opener manual", null],
    ]);
    expect(docs.filter).toMatchObject({
      title: "Garage",
      total: 2,
      shown: 2,
      error: null,
    });

    // A fixture follows no tag: just what is linked to it.
    const heater = await createFixture(db, scope, member, {
      name: "Water heater",
    });
    await linkPicked(
      db,
      scope,
      member,
      { kind: "fixture", id: heater.id },
      "paperless",
      "42",
    );
    const own = await documentsFor(db, scope, {
      kind: "fixture",
      id: heater.id,
    });
    expect(own).toMatchObject({
      filter: null,
      documents: [{ title: "Water heater manual", hasThumb: true }],
    });
  });

  it("marks a deleted item as missing, keeping its title", async () => {
    const { scope, admin, member } = await household();
    await saveIntegration(db, scope, admin, "homebox", {
      baseUrl: `${base}/hb`,
      token: "hb_good",
    });
    const heater = await createFixture(db, scope, member, {
      name: "Water heater",
    });
    const ref = await linkPicked(
      db,
      scope,
      member,
      { kind: "fixture", id: heater.id },
      "homebox",
      ITEM,
    );
    await db
      .update(externalRefs)
      .set({ lastCheckedAt: new Date(Date.now() - 2 * 86_400_000) })
      .where(eq(externalRefs.id, ref.id));
    deleted = true;
    try {
      await refreshStale(db, scope, [ref.id], 5000);
    } finally {
      deleted = false;
    }
    const [after] = await db
      .select()
      .from(externalRefs)
      .where(eq(externalRefs.id, ref.id));
    expect(after).toMatchObject({ status: "missing", title: "Water heater" });
  });
});

describe("a place linked to a Homebox location", () => {
  it("lists what Homebox keeps there and adds an item as a linked fixture in one step", async () => {
    const { scope, admin, member, viewer } = await household();
    await saveIntegration(db, scope, admin, "homebox", {
      baseUrl: `${base}/hb`,
      token: "hb_good",
    });
    const basement = await createSpace(db, scope, member, { name: "Basement" });
    expect(await homeboxItemsHere(db, scope, basement.id)).toEqual({
      state: "none",
    });

    const [loc] = await searchSystem(
      db,
      scope,
      "homebox",
      "basement",
      "location",
    );
    expect(seen.at(-1)!.url).toContain("isLocation=true");
    expect(loc).toMatchObject({
      externalId: BASEMENT,
      url: `${base}/hb/location/${BASEMENT}`,
      subtitle: "2 items",
    });
    await linkPicked(
      db,
      scope,
      member,
      { kind: "space", id: basement.id },
      "homebox",
      BASEMENT,
    );

    // The water heater is already a fixture somewhere and linked; the dehumidifier isn't.
    const heater = await createFixture(db, scope, member, {
      name: "Water heater",
      spaceId: basement.id,
    });
    await linkPicked(
      db,
      scope,
      member,
      { kind: "fixture", id: heater.id },
      "homebox",
      ITEM,
    );
    let here = await homeboxItemsHere(db, scope, basement.id);
    expect(here.state).toBe("ok");
    if (here.state !== "ok") return;
    expect(here.location.title).toBe("Basement");
    expect(here.items.map((i) => [i.title, i.fixture?.name ?? null])).toEqual([
      ["Dehumidifier", null],
      ["Water heater", "Water heater"],
    ]);

    await expect(
      addFixtureFromHomebox(db, scope, viewer, basement.id, DEHUMIDIFIER),
    ).rejects.toThrow();
    await expect(
      addFixtureFromHomebox(db, scope, member, basement.id, BASEMENT),
    ).rejects.toThrow(/location, not an item/);
    const added = await addFixtureFromHomebox(
      db,
      scope,
      member,
      basement.id,
      DEHUMIDIFIER,
    );
    expect(added).toMatchObject({ name: "Dehumidifier", spaceId: basement.id });
    const [ref] = await db
      .select()
      .from(externalRefs)
      .where(eq(externalRefs.fixtureId, added.id));
    expect(ref).toMatchObject({
      system: "homebox",
      externalId: DEHUMIDIFIER,
      url: `${base}/hb/item/${DEHUMIDIFIER}`,
    });

    here = await homeboxItemsHere(db, scope, basement.id);
    expect(here.state === "ok" && here.items.every((i) => i.fixture)).toBe(
      true,
    );
    expect(
      (await listFixtures(db, scope, { spaceId: basement.id }))
        .map((t) => t.name)
        .sort(),
    ).toEqual(["Dehumidifier", "Water heater"]);
  });

  it("shows an empty list for a location Homebox no longer has items in", async () => {
    const { scope, admin, member } = await household();
    await saveIntegration(db, scope, admin, "homebox", {
      baseUrl: `${base}/hb`,
      token: "hb_good",
    });
    const attic = await createSpace(db, scope, member, { name: "Attic" });
    const gone = "9f8e7d6c-5b4a-4392-8170-6f5e4d3c2b1a";
    await db.insert(externalRefs).values({
      propertyId: scope.propertyId,
      system: "homebox",
      externalId: gone,
      url: `${base}/hb/location/${gone}`,
      title: "Attic",
      spaceId: attic.id,
    });
    const here = await homeboxItemsHere(db, scope, attic.id);
    // The fake answers an unknown parent with an empty item list, as Homebox does.
    expect(here.state === "ok" ? here.items : here).toEqual([]);
  });
});

describe("pasted links", () => {
  it("recognises Homebox, paperless and Home Assistant addresses", () => {
    expect(parseExternalUrl(`https://hb.example/item/${ITEM}`)).toMatchObject({
      system: "homebox",
      externalId: ITEM,
    });
    expect(
      parseExternalUrl("https://docs.example/documents/42/details"),
    ).toMatchObject({ system: "paperless", externalId: "42" });
    expect(
      parseExternalUrl("https://ha.example/config/devices/device/abc123"),
    ).toMatchObject({ system: "homeassistant", externalId: "device:abc123" });
    expect(
      parseExternalUrl(
        "https://ha.example/history?entity_id=light.living_room",
      ),
    ).toMatchObject({ externalId: "entity:light.living_room" });
    expect(parseExternalUrl("https://example.com/whatever")).toBeNull();
  });
});
