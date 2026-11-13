/*
 * The standards' phone check (design.md, Layout): the main screens load in
 * WebKit at 360px, and none scrolls sideways. Runs in the `webkit-phone`
 * project (playwright.config.ts), after the journeys have filled the house in.
 */

import { expect, test } from '@playwright/test'

const SCREENS = [
  '/',
  '/places',
  '/fixtures',
  '/parts',
  '/systems',
  '/contacts',
  '/projects',
  '/notes',
  '/search?q=bulb',
  '/guide',
  '/share',
  '/family',
  '/settings',
  '/more',
  '/deleted',
  '/notes/new',
  '/fixtures/new',
  '/projects/new',
]

/* The touch rules (the 16px field floor, no focus on load) key on a coarse
   pointer, so the project must emulate one. */
test('the phone is a touch screen 360px wide', async ({ page }) => {
  await page.goto('/')
  expect(await page.evaluate(() => window.matchMedia('(pointer: coarse)').matches)).toBe(true)
  expect(await page.evaluate(() => window.innerWidth)).toBe(360)
})

for (const scheme of ['light', 'dark'] as const) {
  test.describe(`at 360px, ${scheme}`, () => {
    test.use({ colorScheme: scheme })
    for (const path of SCREENS) {
      test(`${path} does not scroll sideways`, async ({ page }) => {
        const response = await page.goto(path)
        expect(response?.ok()).toBe(true)
        await expect(page.locator('main')).toBeVisible()
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
        expect(overflow).toBe(0)
      })
    }
  })
}
