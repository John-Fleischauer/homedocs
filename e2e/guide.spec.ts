/*
 * The house guide from the outside: a housesitter with a link and no account.
 * Codes and the address stay hidden away from home, open with the PIN, and
 * never reach the offline copy; a turned-off link stops working.
 */

import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

let link = "";

test("the family sets up the guide and makes a link", async ({ page }) => {
  await page.goto("/fixtures/new");
  await page.locator("[name=name]").fill("Main water shutoff");
  await page.getByLabel("Show on House Guide").check();
  await page
    .locator("[name=guideNote]")
    .fill("Basement, behind the furnace. Quarter turn.");
  await page.getByRole("button", { name: "Add Fixture" }).click();

  await page.goto("/guide/codes/new");
  await page.locator("[name=kind]").selectOption("alarm");
  await page.locator("[name=label]").fill("Front door alarm");
  await page.locator("[name=value]").fill("4815");
  // Switching kind must not leave the Wi-Fi default ("anyone with the link").
  await expect(page.locator("[name=gate]")).toHaveValue("home_or_pin");
  await page.getByRole("button", { name: "Save" }).click();

  await page.goto("/guide");
  await expect(page.getByText("4815")).toHaveCount(0);
  await page.getByRole("link", { name: "Show" }).click();
  await expect(page.getByText("4815")).toBeVisible();

  await page.goto("/share");
  await page.locator("[name=label]").fill("Sarah");
  await page.locator("[name=pin]").fill("246810");
  await page.getByRole("button", { name: "Make Link" }).click();
  link = (await page.locator("code").first().textContent())!.trim();
  expect(link).toMatch(/\/g\/[A-Za-z0-9_-]{40,}$/);
});

test("away from home: hidden until the PIN", async ({ browser }) => {
  const ctx = await browser.newContext({
    storageState: undefined,
    extraHTTPHeaders: { "x-forwarded-for": "203.0.113.50" },
  });
  const page = await ctx.newPage();
  await page.goto(link);
  await expect(page.getByText("Main water shutoff")).toBeVisible();
  await expect(page.getByText("4815")).toHaveCount(0);

  await page.getByLabel("PIN").fill("000000");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText(/PIN isn’t right/)).toBeVisible();

  await page.getByLabel("PIN").fill("246810");
  await page.getByRole("button", { name: "Unlock" }).click();
  await expect(page.getByText("4815")).toBeVisible();

  const offline = await page.request.get(`${link}/offline`);
  const html = await offline.text();
  expect(html).toContain("Main water shutoff");
  expect(html).not.toContain("4815");
  await ctx.close();
});

test("a turned-off link stops working", async ({ page, browser }) => {
  await page.goto("/share");
  await page.getByRole("button", { name: "Turn Off" }).click();
  await page
    .getByRole("group", { name: "Turn Off this link?" })
    .getByRole("button", { name: "Turn Off" })
    .click();
  await expect(page.getByText("Expired or Off")).toBeVisible();

  const ctx = await browser.newContext({ storageState: undefined });
  const res = await (await ctx.newPage()).goto(link);
  expect(res?.status()).toBe(404);
  expect((await ctx.request.get(`${link}/offline`)).status()).toBe(410);
  await ctx.close();
});
