/*
 * The standards' phone check (design.md, Layout): the main screens load in
 * WebKit at 360px, and none scrolls sideways. Runs in the `webkit-phone`
 * project (playwright.config.ts), after the journeys have filled the house in,
 * so the detail pages below have a record to show. One colour scheme: a theme
 * swaps colours, never widths.
 */

import { expect, test, type Page } from "@playwright/test";

const SCREENS = [
  "/",
  "/add",
  "/places",
  "/fixtures",
  "/parts",
  "/systems",
  "/contacts",
  "/projects",
  "/notes",
  "/search?q=bulb",
  "/guide",
  "/share",
  "/family",
  "/settings",
  "/more",
  "/deleted",
  "/places/new",
  "/fixtures/new",
  "/parts/new",
  "/systems/new",
  "/contacts/new",
  "/notes/new",
  "/projects/new",
];

/* One record of each kind, found from its list: the journeys made them. A
   project page also carries the to-do list's date field. */
const DETAILS = [
  "places",
  "fixtures",
  "parts",
  "systems",
  "contacts",
  "notes",
  "projects",
];

async function noSidewaysScroll(page: Page, path: string) {
  // Still signed in: a bounce to /login would measure the wrong page.
  expect(new URL(page.url()).pathname).toBe(path.split("?")[0]);
  await expect(page.locator("main")).toBeVisible();
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
}

/* The touch rules (the 16px field floor, no focus on load) key on a coarse
   pointer, so the project must emulate one. */
test("the phone is a touch screen 360px wide", async ({ page }) => {
  await page.goto("/");
  expect(
    await page.evaluate(() => window.matchMedia("(pointer: coarse)").matches),
  ).toBe(true);
  expect(await page.evaluate(() => window.innerWidth)).toBe(360);
});

for (const path of SCREENS) {
  test(`${path} does not scroll sideways`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.ok()).toBe(true);
    await noSidewaysScroll(page, path);
  });
}

for (const kind of DETAILS) {
  test(`a ${kind} page does not scroll sideways`, async ({ page }) => {
    await page.goto(`/${kind}`);
    const href = await page
      .locator(
        `main a[href^="/${kind}/"]:not([href$="/new"]):not([href*="/series"]):not([href*="/trades"])`,
      )
      .first()
      .getAttribute("href");
    expect(href).toBeTruthy();
    await page.goto(href!);
    await noSidewaysScroll(page, href!);
  });
}
