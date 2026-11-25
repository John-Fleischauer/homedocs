/*
 * The journeys homedocs exists for, on a phone, in the order a family would
 * build up their house record. Each "question" test asserts the answer is one
 * search and one tap away.
 */

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

/* Answer a field the way a person would: pick from its dropdown, or type. */
async function answer(page: Page, name: string, value: string) {
  const field = page.locator(`[name="${name}"]`);
  if ((await field.evaluate((el) => el.tagName)) === "SELECT")
    await field.selectOption(value);
  else await field.fill(value);
}

async function create(
  page: Page,
  path: string,
  fill: Record<string, string>,
  submit: string | RegExp = /^(Add|Save)/,
) {
  await page.goto(path);
  for (const [name, value] of Object.entries(fill))
    await answer(page, name, value);
  await page.getByRole("button", { name: submit }).click();
}

test("build the house: places, a light and its bulb", async ({ page }) => {
  await create(page, "/places/new", { name: "Living room" }, "Add Place");
  await expect(
    page.getByRole("heading", { name: "Living room" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Add Fixture" }).click();
  await page.locator("[name=name]").fill("Overhead light");
  await page.getByRole("button", { name: "Add Fixture" }).click();
  await expect(
    page.getByRole("heading", { name: "Overhead light" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "Add Part" }).click();
  await page.getByRole("link", { name: "Light Bulb" }).click();
  await answer(page, "f_base", "E26");
  await answer(page, "f_shape", "A19");
  await answer(page, "f_color_temp", "2700K");
  await page.locator("[name=quantity]").fill("3");
  await page.getByRole("button", { name: /Add to Overhead light/ }).click();
  await expect(page.getByText("A19 E26 2700K bulb · 3 bulbs")).toBeVisible();
});

test("home leads with places and the parts the house takes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: /Living room.*1 fixture/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: /A19 E26 2700K bulb.*Overhead light/ }),
  ).toBeVisible();
});

test("the + menu adds right where you are", async ({ page }) => {
  await page.goto("/places");
  await page.getByRole("link", { name: "Living room" }).click();
  await expect(
    page.getByRole("heading", { name: "Living room" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Add Something" }).click();
  const fixture = page.getByRole("menuitem", { name: /^Fixture/ });
  await expect(fixture).toHaveAttribute(
    "href",
    /\/fixtures\/new\?space=[0-9a-f-]{36}$/,
  );
  await page.keyboard.press("Escape");
  await expect(fixture).toHaveCount(0);
});

test("a new fixture asks for a photo, and password managers stay out of the form", async ({
  page,
}) => {
  await page.goto("/fixtures/new");
  await expect(page.locator("[name=name]")).toHaveAttribute(
    "data-1p-ignore",
    "",
  );
  await expect(page.locator("[name=name]")).toHaveAttribute(
    "autocomplete",
    "off",
  );
  await page.locator("[name=name]").fill("Kitchen sink shutoff");
  await page.getByRole("button", { name: "Add Fixture" }).click();
  await expect(page.getByRole("button", { name: /Add Photo/ })).toBeVisible();
});

test("question 1: what bulb does the living room light take?", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("searchbox", { name: "Search Everything" })
    .fill("living room bulb");
  await page.keyboard.press("Enter");
  await page.getByRole("link", { name: /Overhead light/ }).click(); // one tap
  await expect(page.getByText("A19 E26 2700K bulb · 3 bulbs")).toBeVisible();
});

test("mulch: what we used, and the lesson for next time", async ({ page }) => {
  await create(page, "/places/new", { name: "Front flowerbed" }, "Add Place");
  await page.getByRole("link", { name: "Add Part" }).click();
  await page.getByRole("link", { name: "Landscaping" }).click();
  await page.locator("[name=f_product]").fill("Brown hardwood mulch");
  await page.locator("[name=quantity]").fill("12");
  await page.getByRole("button", { name: /Add to Front flowerbed/ }).click();

  await page.getByRole("link", { name: "Add Entry" }).click();
  await page.locator("[name=title]").fill("Spring mulch");
  await page
    .locator("[name=supplyId]")
    .selectOption({ label: "Brown hardwood mulch" });
  await page.locator("[name=quantity]").fill("12");
  // Picked, and already the part's own unit.
  await answer(page, "unit", "bag");
  await page.locator("[name=nextTime]").fill("Needed 3 more bags");
  await page.getByRole("button", { name: "Save Entry" }).click();

  await page.getByRole("button", { name: /Set Amount Needed to 15/ }).click();
  await expect(
    page.getByText(/Amount needed for Front flowerbed: 15 bags/),
  ).toBeVisible();
});

test("question 2: how many bags does the front bed take?", async ({ page }) => {
  await page.goto("/search?q=front+flowerbed");
  await page
    .getByRole("link", { name: /Front flowerbed/ })
    .first()
    .click(); // one tap
  await expect(
    page.getByText(/Next Time:.*Needed 3 more bags/).first(),
  ).toBeVisible();
  await expect(page.getByText(/actually needs 15 bags/)).toBeVisible();
});

test("question 3: which paint is in the bedroom?", async ({ page }) => {
  await create(page, "/places/new", { name: "Bedroom" }, "Add Place");
  await page.getByRole("link", { name: "Add Part" }).click();
  await page.getByRole("link", { name: "Paint Colour" }).click();
  await answer(page, "f_brand", "Sherwin-Williams");
  await page.locator("[name=f_color_code]").fill("SW 7015");
  await page.locator("[name=f_color_name]").fill("Repose Gray");
  await page.locator("[name=surface]").fill("walls");
  await answer(page, "finish", "Eggshell");
  await page.getByRole("button", { name: /Add to Bedroom/ }).click();

  await page.goto("/search?q=bedroom+paint");
  await page
    .getByRole("link", { name: /Bedroom|Sherwin/ })
    .first()
    .click();
  await expect(
    page.getByText(/Sherwin-Williams SW 7015 Repose Gray/).first(),
  ).toBeVisible();
  await expect(page.getByText(/walls, Eggshell/)).toBeVisible();
});

// A 1×1 PNG: enough for the server to re-encode and store.
const PIXEL = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

test("a paint can’s label: its details, then a photo of it", async ({
  page,
}) => {
  await create(
    page,
    "/parts/new?category=paint",
    {
      f_brand: "Sherwin-Williams",
      f_order: "0582820",
      f_product_line: "ProMar 200 Zero",
      f_sheen: "Flat",
      f_color_name: "CM Gris",
      f_color_code: "Custom match",
      f_formula: "B1-Black 2 3 1 1",
      f_base: "Extra White",
      f_product_number: "B30W12651",
    },
    "Add Part",
  );
  await expect(page.getByText("B30W12651")).toBeVisible();

  // The page has to render again with the photo on it.
  await page
    .locator("input[type=file]")
    .setInputFiles({ name: "label.png", mimeType: "image/png", buffer: PIXEL });
  const photo = page.getByRole("img", { name: "Photo" });
  await expect(photo).toBeVisible();

  // Asked in place (standards design.md): Cancel first, then the real thing.
  await page.getByRole("button", { name: "Remove this photo" }).click();
  const ask = page.getByRole("group", { name: "Remove this photo?" });
  await expect(ask.getByRole("button", { name: "Cancel" })).toBeFocused();
  await ask.getByRole("button", { name: "Cancel" }).click();
  await expect(ask).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Remove this photo" }),
  ).toBeFocused();
  await page.getByRole("button", { name: "Remove this photo" }).click();
  await ask.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(photo).toHaveCount(0);
});

test("question 4: who is our plumber?", async ({ page }) => {
  await page.goto("/contacts/new");
  await page.locator("[name=name]").fill("Ace Plumbing");
  await page.locator("[name=phoneValue]").first().fill("(555) 123-4567");
  await page.getByText("Plumber", { exact: true }).click();
  await page
    .getByRole("group", { name: "Go-To For" })
    .getByLabel("Plumber")
    .check();
  await page.getByRole("button", { name: "Add Contact" }).click();
  await expect(
    page.getByRole("heading", { name: "Ace Plumbing" }),
  ).toBeVisible();

  await page.goto("/");
  // On Home, with a call button — zero taps to the number.
  await expect(
    page.getByRole("link", { name: "Call Ace Plumbing" }),
  ).toHaveAttribute("href", "tel:5551234567");
});

test("a project with a quote and a to-do list", async ({ page }) => {
  await create(
    page,
    "/projects/new",
    { title: "Replace electrical panel" },
    "Add Project",
  );
  await page
    .getByRole("textbox", { name: "New To-Do" })
    .fill("2 outlets in the garage");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("2 outlets in the garage")).toBeVisible();

  await page.getByRole("button", { name: "Add Quote" }).click();
  await page.locator("[name=amount]").fill("2400");
  await page.getByRole("button", { name: "Add Quote" }).click();
  await expect(page.getByText("$2,400.00")).toBeVisible();
  await page.getByRole("button", { name: "Accept" }).click();
  await expect(page.getByRole("combobox", { name: "Status" })).toHaveValue(
    "scheduled",
  );
});

test("a filter bought at two stores, one in person and one online", async ({
  page,
}) => {
  await page.goto("/parts/new?category=filter");
  await answer(page, "f_size", "20x25x1");
  // Picked from the known stores, found by typing part of the name.
  await page.getByLabel("Store 1", { exact: true }).fill("dep");
  await page.getByRole("option", { name: "Home Depot" }).click();
  await expect(page.getByLabel("Store 1", { exact: true })).toHaveValue(
    "Home Depot",
  );
  await page
    .getByRole("radiogroup", { name: "Store 1: Where It’s Bought" })
    .getByRole("radio", { name: "In Store" })
    .click();
  await page.getByRole("button", { name: "Add Store" }).click();
  await page
    .getByLabel("Store 2 link")
    .fill("https://www.amazon.com/dp/B000000000");
  await page
    .getByRole("radiogroup", { name: "Store 2: Where It’s Bought" })
    .getByRole("radio", { name: "Online" })
    .click();
  await page.getByRole("button", { name: "Add Part" }).click();

  const stores = page.locator("#where-to-buy");
  await expect(stores.getByText("Home Depot")).toBeVisible();
  await expect(stores.getByText("In store", { exact: true })).toBeVisible();
  // Named from its link; opens it.
  const amazon = stores.getByRole("link", { name: /Amazon/ });
  await expect(amazon).toHaveAttribute(
    "href",
    "https://www.amazon.com/dp/B000000000",
  );
  await expect(amazon).toContainText("Online · amazon.com");

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} — ${v.nodes[0]?.target}`),
  ).toEqual([]);
});

test("a bulb's details are picked, not typed, and an unusual one still fits", async ({
  page,
}) => {
  await page.goto("/parts/new?category=bulb");
  await answer(page, "f_base", "GU10");
  // Not on the list: "Other…" opens a box for it.
  await page.getByLabel("Shape", { exact: true }).selectOption("Other…");
  await page.getByLabel("Shape, other").fill("R20");
  await answer(page, "f_color_temp", "3000K");
  await page
    .getByRole("group", { name: "Dimmable" })
    .getByText("Yes", { exact: true })
    .click();
  await page.getByRole("button", { name: "Add Part" }).click();

  await expect(
    page.getByRole("heading", { name: "R20 GU10 3000K bulb" }),
  ).toBeVisible();
  await expect(page.getByText("Dimmable", { exact: true })).toBeVisible();

  // Editing opens on what was saved, the unusual shape included.
  await page.getByRole("link", { name: "Edit" }).click();
  await expect(page.getByLabel("Shape, other")).toHaveValue("R20");
  await expect(
    page.getByRole("group", { name: "Dimmable" }).getByLabel("Yes"),
  ).toBeChecked();
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .analyze();
  expect(
    results.violations
      .filter((v) => v.impact === "serious" || v.impact === "critical")
      .map((v) => `${v.id} — ${v.nodes[0]?.target}`),
  ).toEqual([]);
});

test("main pages have no serious accessibility problems", async ({ page }) => {
  for (const path of [
    "/",
    "/places",
    "/projects",
    "/contacts",
    "/more",
    "/parts",
    "/search?q=bulb",
    "/guide",
    "/settings",
  ]) {
    await page.goto(path);
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();
    const serious = results.violations.filter(
      (v) => v.impact === "serious" || v.impact === "critical",
    );
    expect(
      serious.map((v) => `${path}: ${v.id} — ${v.nodes[0]?.target}`),
    ).toEqual([]);
  }
});
