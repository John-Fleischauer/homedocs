/*
 * A place linked to a paperless tag, against a fake paperless (API v10): pick
 * the tag from the place page, and the documents under it list themselves,
 * alongside any linked one by one.
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import sharp from "sharp";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

let server: Server;
let base = "";

test.beforeAll(async () => {
  const png = await sharp({
    create: { width: 8, height: 8, channels: 3, background: "#888" },
  })
    .png()
    .toBuffer();
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const send = (status: number, body: unknown, type = "application/json") => {
      res.writeHead(status, { "content-type": type });
      res.end(
        type === "application/json" ? JSON.stringify(body) : (body as Buffer),
      );
    };
    if (req.headers.authorization !== "Token pl_e2e") return send(401, {});
    const p = url.pathname;
    if (p === "/api/tags/")
      return send(200, {
        count: 1,
        results: [{ id: 5, name: "Pantry", document_count: 1 }],
      });
    if (p === "/api/tags/5/")
      return send(200, { id: 5, name: "Pantry", document_count: 1 });
    if (p === "/api/correspondents/")
      return send(200, {
        count: 1,
        results: [{ id: 2, name: "Ace Plumbing", document_count: 1 }],
      });
    if (p === "/api/correspondents/2/")
      return send(200, { id: 2, name: "Ace Plumbing", document_count: 1 });
    if (
      p === "/api/documents/" &&
      url.searchParams.get("correspondent__id") === "2"
    ) {
      return send(200, {
        count: 1,
        results: [{ id: 13, title: "Ace invoice", created_date: "2025-02-01" }],
      });
    }
    if (
      p === "/api/documents/" &&
      url.searchParams.get("tags__id__all") === "5"
    ) {
      return send(200, {
        count: 1,
        results: [
          { id: 12, title: "Dishwasher manual", created_date: "2025-01-09" },
        ],
      });
    }
    if (p === "/api/documents/" && url.searchParams.get("query") === "shelf") {
      return send(200, {
        count: 1,
        results: [
          { id: 14, title: "Shelf receipt", created_date: "2025-03-04" },
        ],
      });
    }
    if (p === "/api/documents/") return send(200, { count: 3, results: [] });
    if (p === "/api/documents/14/")
      return send(200, {
        id: 14,
        title: "Shelf receipt",
        created_date: "2025-03-04",
      });
    if (p === "/api/documents/12/")
      return send(200, { id: 12, title: "Dishwasher manual", tags: [5] });
    if (p === "/api/documents/12/thumb/") return send(200, png, "image/png");
    send(404, {});
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(() => new Promise<void>((r) => server.close(() => r())));

test("link a place to its paperless tag and see its documents", async ({
  page,
}) => {
  await page.goto("/settings");
  const paperless = page
    .locator("form")
    .filter({ has: page.getByText("API token") });
  await paperless.locator("[name=baseUrl]").fill(base);
  await paperless.locator("[name=token]").fill("pl_e2e");
  await paperless.getByRole("button", { name: "Connect" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Connected: paperless" }),
  ).toBeVisible();

  await page.goto("/places/new");
  await page.locator("[name=name]").fill("Pantry");
  await page.getByRole("button", { name: "Add Place" }).click();
  await expect(page.getByRole("heading", { name: "Pantry" })).toBeVisible();

  // Every tag shows to browse before anything is typed.
  await page.getByRole("button", { name: "Add Tag Documents" }).click();
  await expect(page.getByRole("textbox", { name: "Search" })).toHaveValue("");
  await page.getByRole("button", { name: /Pantry.*Tag · 1 document/ }).click();

  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await expect(page.getByText("Tag: Pantry")).toBeVisible();
  const doc = page.getByRole("link", { name: /Dishwasher manual/ });
  await expect(doc).toHaveAttribute("href", `${base}/documents/12/details`);
  // The thumbnail loads through the proxy (a broken one would fall back to the icon).
  await expect(doc.locator("img")).toHaveJSProperty("complete", true);
  await expect
    .poll(() =>
      doc.locator("img").evaluate((img: HTMLImageElement) => img.naturalWidth),
    )
    .toBeGreaterThan(0);

  // A document linked on its own joins the same list, ahead of the tag's.
  await page.getByRole("button", { name: "Add Document" }).click();
  await page.getByRole("textbox", { name: "Search" }).fill("shelf");
  await page.getByRole("button", { name: /Shelf receipt/ }).click();
  const docs = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Documents" }) })
    .getByRole("link");
  await expect(docs.filter({ hasText: /receipt|manual/ })).toHaveText([
    /Shelf receipt/,
    /Dishwasher manual/,
  ]);
  await expect(
    page.getByRole("button", { name: "Remove Shelf receipt" }),
  ).toBeVisible();
});

test("a contact lists its paperless correspondent’s documents", async ({
  page,
}) => {
  await page.goto("/contacts/new");
  await page.locator("[name=name]").fill("Ace Plumbing");
  await page.getByRole("button", { name: "Add Contact" }).click();
  await expect(
    page.getByRole("heading", { name: "Ace Plumbing" }),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Add Correspondent Documents" })
    .click();
  await page
    .getByRole("button", { name: /Ace Plumbing.*Correspondent · 1 document/ })
    .click();
  await expect(page.getByRole("heading", { name: "Documents" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ace invoice/ })).toHaveAttribute(
    "href",
    `${base}/documents/13/details`,
  );
  await expect(
    page.getByRole("link", { name: /Open Correspondent/ }),
  ).toHaveAttribute("href", `${base}/documents?correspondent__id__in=2`);

  // Unlinking brings the picker back.
  await page.getByRole("button", { name: /Unlink/ }).click();
  await page
    .getByRole("group", { name: /^Unlink/ })
    .getByRole("button", { name: "Unlink", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Add Correspondent Documents" }),
  ).toBeVisible();
});

test("Settings narrows paperless to the house’s tag", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Pick Tag" }).click();
  await page.getByRole("button", { name: /Pantry.*Tag/ }).click();
  await expect(page.getByText("Only Documents Tagged")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Remove the Pantry filter" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Remove the Pantry filter" }).click();
  await page
    .getByRole("group", { name: "Remove the Pantry filter?" })
    .getByRole("button", { name: "Remove", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Pick Tag" })).toBeVisible();
});
