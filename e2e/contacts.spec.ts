/*
 * What contacts do is the family's own list: trim it (no HOA here), and a
 * trade typed on a contact becomes a chip for the next one.
 */

import { expect, test } from "@playwright/test";

test.describe.configure({ mode: "serial" });

test("the list of what contacts do can be edited, and typed trades join it", async ({
  page,
}) => {
  await page.goto("/contacts/new");
  await expect(page.getByText("HVAC", { exact: true })).toBeVisible();
  await expect(page.getByText("HOA", { exact: true })).toBeVisible();

  await page.getByRole("link", { name: "Edit List" }).click();
  await expect(page.getByRole("heading", { name: "Trades" })).toBeVisible();
  await page.getByRole("button", { name: "Remove HOA" }).click();
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status")).toHaveText("Saved");

  await page.goto("/contacts/new");
  await expect(page.getByText("HOA", { exact: true })).toHaveCount(0);
  await page.locator("[name=name]").fill("Sooty Sweeps");
  await page.locator("[name=customTrades]").fill("Chimney sweep");
  await page.getByRole("button", { name: "Add Contact" }).click();
  await expect(
    page.getByRole("heading", { name: "Sooty Sweeps" }),
  ).toBeVisible();
  await expect(page.getByText("Chimney sweep", { exact: true })).toBeVisible();

  await page.goto("/contacts/new");
  await expect(page.getByText("Chimney sweep", { exact: true })).toBeVisible();
});
