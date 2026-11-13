/*
 * Systems as the family meets them: the fixture form picks the system as you
 * type, the fixture links to it, the system page leads with the shutoff, Home
 * has a tile for it, and the house guide groups the emergency card by it.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("a shutoff lands in Water & plumbing, and the system hands it over", async ({
  page,
}) => {
  await page.goto("/fixtures/new");
  await page.locator("[name=name]").fill("Main water shutoff");
  await page.locator("[name=category]").fill("Shutoff valve");
  const system = page.getByRole("combobox", { name: "System" });
  await expect(system.locator("option:checked")).toHaveText("Water & plumbing");
  await page.getByText("Show on House Guide").click();
  await page
    .locator("[name=guideNote]")
    .fill("Red handle, quarter turn clockwise.");
  await page.getByRole("button", { name: "Add Fixture" }).click();
  await expect(
    page.getByRole("heading", { name: "Main water shutoff" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Water & plumbing" }).click();
  await expect(
    page.getByRole("heading", { name: "Water & plumbing" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Key Fixtures" }),
  ).toBeVisible();
  await expect(
    page.getByText("Red handle, quarter turn clockwise."),
  ).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  const serious = results.violations.filter(
    (v) => v.impact === "serious" || v.impact === "critical",
  );
  expect(serious.map((v) => `${v.id} — ${v.nodes[0]?.target}`)).toEqual([]);

  // The + menu on a system page starts a fixture already in it.
  await page.getByRole("button", { name: "Add Something" }).click();
  await page.getByRole("menuitem", { name: /Fixture/ }).click();
  await expect(
    page.getByRole("combobox", { name: "System" }).locator("option:checked"),
  ).toHaveText("Water & plumbing");

  await page.goto("/");
  await expect(
    page.getByRole("link", {
      name: /Water & plumbing.*fixtures? · [0-9]+ on the guide/,
    }),
  ).toBeVisible();

  await page.goto("/guide");
  await expect(
    page.getByRole("heading", { name: "Water & plumbing", level: 3 }),
  ).toBeVisible();
});

test("a choice made by hand sticks while typing, and the family can add a system", async ({
  page,
}) => {
  await page.goto("/fixtures/new");
  const system = page.getByRole("combobox", { name: "System" });
  await system.selectOption({ label: "Electrical" });
  await page.locator("[name=name]").fill("Water heater breaker");
  await expect(system.locator("option:checked")).toHaveText("Electrical");

  await page.goto("/systems/new");
  await page.locator("[name=name]").fill("Pool");
  await page.getByText("Pool", { exact: true }).click();
  await page.getByRole("button", { name: "Add System" }).click();
  await expect(page.getByRole("heading", { name: "Pool" })).toBeVisible();
  await expect(page.getByText("None yet")).toBeVisible();
  await page.goto("/systems");
  await expect(
    page.getByRole("link", { name: /Pool.*Nothing yet/ }),
  ).toBeVisible();
});
