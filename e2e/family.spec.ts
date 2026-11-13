/*
 * An admin adds someone straight from the Family page, with no invite link,
 * and they can sign in.
 */

import { expect, test } from "@playwright/test";

test("add someone directly, and they sign in", async ({ page, browser }) => {
  await page.goto("/family");
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Add Person" }) });
  await form.locator("[name=displayName]").fill("Grandma");
  await form.locator("[name=email]").fill("grandma@example.test");
  await form.locator("[name=role]").selectOption("viewer");
  await form.getByRole("button", { name: "Add Person" }).click();
  await expect(page.getByText("Grandma can sign in now.")).toBeVisible();
  await expect(
    page.getByText("grandma@example.test · not signed in yet"),
  ).toBeVisible();

  await form.locator("[name=displayName]").fill("Kid");
  await form.locator("[name=email]").fill("kid@example.test");
  await form.locator("[name=password]").fill("correct horse battery");
  await form.getByRole("button", { name: "Add Person" }).click();
  await expect(page.getByText("Kid can sign in now.")).toBeVisible();

  const fresh = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const kid = await fresh.newPage();
  await kid.goto("/login");
  await kid.locator("[name=email]").fill("kid@example.test");
  await kid.locator("[name=password]").fill("correct horse battery");
  await kid.getByRole("button", { name: /Sign In/ }).click();
  await expect(kid).not.toHaveURL(/\/login/);
  await kid.goto("/more");
  await expect(kid.getByRole("link", { name: /Family/ })).toHaveCount(0);
  await fresh.close();
});

test("/sso, the launch URL for Pocket ID, goes straight in when signed in", async ({
  page,
  browser,
}) => {
  await page.goto("/sso");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Home" })).toBeAttached();

  // Signed out it starts a sign-on; with none configured here, that ends at the login page saying so.
  const fresh = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const out = await fresh.newPage();
  await out.goto("/sso");
  await expect(out).toHaveURL(/\/login\?error=sso-unavailable/);
  await fresh.close();
});
