/*
 * A place linked to its Homebox location, against a fake Homebox 0.26: pick
 * the location from the place page, see what Homebox keeps there, and add an
 * item as a fixture with one tap.
 */

import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

const GARAGE = "3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f";
const MOWER = "5e6f7a8b-9c0d-4e1f-8a2b-3c4d5e6f7a8b";
// Homebox names its built-in types by translation key; they should never reach the screen.
const LOCATION = { id: "lt", name: "global.location", isLocation: true };
const ITEM = { id: "it", name: "global.item", isLocation: false };
let server: Server;
let base = "";

test.beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://x");
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    if (req.headers.authorization !== "Bearer hb_e2e") return send(401, {});
    const p = url.pathname;
    if (p === "/api/v1/status")
      return send(200, { build: { version: "v0.26.2" } });
    if (
      p === "/api/v1/entities" &&
      url.searchParams.get("isLocation") === "true"
    ) {
      return send(200, {
        items: [
          { id: GARAGE, name: "Garage", entityType: LOCATION, itemCount: 1 },
        ],
        total: 1,
      });
    }
    if (
      p === "/api/v1/entities" &&
      url.searchParams.get("parentIds") === GARAGE
    ) {
      return send(200, {
        items: [
          {
            id: MOWER,
            name: "Lawn mower",
            parent: { id: GARAGE, name: "Garage" },
            entityType: ITEM,
          },
        ],
        total: 1,
      });
    }
    if (p === "/api/v1/entities") return send(200, { items: [], total: 0 });
    if (p === `/api/v1/entities/${GARAGE}`)
      return send(200, { id: GARAGE, name: "Garage", entityType: LOCATION });
    if (p === `/api/v1/entities/${MOWER}`)
      return send(200, {
        id: MOWER,
        name: "Lawn mower",
        parent: { name: "Garage" },
        entityType: ITEM,
      });
    send(404, {});
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(() => new Promise<void>((r) => server.close(() => r())));

test("link a place to its Homebox location and add what is kept there", async ({
  page,
}) => {
  await page.goto("/settings");
  const homebox = page
    .locator("form")
    .filter({ has: page.getByText("API key") });
  await homebox.locator("[name=baseUrl]").fill(base);
  await homebox.locator("[name=token]").fill("hb_e2e");
  await homebox.getByRole("button", { name: "Connect" }).click();
  await expect(
    page.getByText("Connected: Homebox v0.26.2", { exact: true }),
  ).toBeVisible();

  await page.goto("/places/new");
  await page.locator("[name=name]").fill("Garage");
  await page.getByRole("button", { name: "Add Place" }).click();
  await expect(page.getByRole("heading", { name: "Garage" })).toBeVisible();

  // The search starts from the place's own name.
  await page.getByRole("button", { name: "Link Homebox Location" }).click();
  await expect(page.getByRole("textbox", { name: "Search" })).toHaveValue(
    "Garage",
  );
  await expect(
    page.getByRole("button", { name: /Garage.*1 item/ }),
  ).not.toContainText("global.");
  await page.getByRole("button", { name: /Garage.*1 item/ }).click();

  await expect(
    page.getByRole("heading", { name: "In Homebox · Garage" }),
  ).toBeVisible();
  await expect(page.getByText("Not in homedocs")).toBeVisible();
  await expect(page.getByText(/global\./)).toHaveCount(0);
  await page.getByRole("button", { name: "Add Lawn mower as fixture" }).click();
  await expect(
    page.getByRole("link", { name: "Fixture: Lawn mower" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Fixture: Lawn mower" }).click();
  await expect(page.getByRole("heading", { name: "Lawn mower" })).toBeVisible();
  await expect(page.getByText("Homebox · Garage")).toBeVisible();
});
