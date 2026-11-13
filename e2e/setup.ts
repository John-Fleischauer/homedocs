import { expect, test as setup } from "@playwright/test";
import { ADMIN, AUTH_FILE } from "./world";

/* First run: the setup page creates the admin and the home. */
setup("create the first account", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/setup/);
  await page.locator("[name=homeName]").fill(ADMIN.home);
  await page.locator("[name=displayName]").fill(ADMIN.name);
  await page.locator("[name=email]").fill(ADMIN.email);
  await page.locator("[name=password]").fill(ADMIN.password);
  await page.getByRole("button", { name: "Create Account" }).click();
  await expect(page.getByRole("link", { name: ADMIN.home })).toBeVisible();
  await page.context().storageState({ path: AUTH_FILE });
});
