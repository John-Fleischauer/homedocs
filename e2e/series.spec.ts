/*
 * A series as the family meets it: pine straw in the back yard every spring.
 * Set it up once, start this year's, change what this year needed, send the
 * lasting change back (after a confirmation that says what changes), and next
 * year starts from it.
 */

import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

test.describe.configure({ mode: 'serial' })

async function noSeriousProblems(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  const serious = results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')
  expect(serious.map((v) => `${v.id} — ${v.nodes[0]?.target}`)).toEqual([])
}

async function addMaterial(page: Page, fill: { quantity: string; notes: string; oneOff?: boolean }) {
  await page.getByRole('button', { name: 'Add Material' }).click()
  await page.getByRole('combobox', { name: 'Part' }).selectOption({ label: 'Pine straw' })
  await page.locator('[name=quantity]').fill(fill.quantity)
  await page.locator('[name=notes]').fill(fill.notes)
  if (fill.oneOff) await page.getByRole('checkbox', { name: 'Only This Project' }).last().check()
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await expect(page.getByText(fill.notes, { exact: true })).toBeVisible()
}

test('set up the pine straw series', async ({ page }) => {
  await page.goto('/parts/new?category=landscaping')
  await page.locator('[name=name]').fill('Pine straw')
  await page.locator('[name=units]').fill('roll, bale')
  await page.getByRole('button', { name: 'Add Part' }).click()
  await expect(page.getByRole('heading', { name: 'Pine straw' })).toBeVisible()
  await expect(page.getByText('roll, bale')).toBeVisible()

  await page.goto('/projects/series/new')
  await page.locator('[name=title]').fill('Back yard pine straw')
  await page.locator('[name=howTo]').fill('Unroll along the stair edge first.')
  await page.getByRole('button', { name: 'Add Series' }).click()
  await expect(page.getByRole('heading', { name: 'Back yard pine straw' })).toBeVisible()

  await addMaterial(page, { quantity: '8', notes: 'around the stairs' })
  await addMaterial(page, { quantity: '5', notes: 'around the deck' })
  await page.getByRole('textbox', { name: 'New To-Do' }).fill('Rake out old straw')
  await page.getByRole('button', { name: 'Add', exact: true }).first().click()
  await expect(page.getByText('Rake out old straw')).toBeVisible()
  await noSeriousProblems(page)
})

test('this year: a one-off roll, and the stairs only took 7, sent back to the series', async ({ page }) => {
  await page.goto('/projects')
  await page.getByRole('link', { name: /Back yard pine straw/ }).first().click()
  await page.getByRole('link', { name: 'Start Project' }).click()
  await expect(page.locator('[name=title]')).toHaveValue(/^Back yard pine straw \d{4}$/)
  await page.getByRole('button', { name: 'Start Project' }).click()

  await expect(page.getByText('Unroll along the stair edge first.')).toBeVisible()
  await expect(page.getByText('Pine straw · 8 rolls')).toBeVisible()
  await expect(page.getByText('Pine straw · 5 rolls')).toBeVisible()

  await addMaterial(page, { quantity: '1', notes: 'flowerbeds', oneOff: true })
  await expect(page.getByText('This Project Only')).toBeVisible()

  const stairs = page.getByRole('listitem').filter({ hasText: 'around the stairs' })
  await stairs.getByRole('button', { name: 'Edit' }).click()
  await page.locator('li [name=quantity]').fill('7')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(stairs.getByText('was 8 rolls')).toBeVisible()
  await expect(page.getByText('1 difference from Back yard pine straw')).toBeVisible()

  // The one modal confirm: it lists what the series will change.
  await stairs.getByRole('button', { name: 'Update Series' }).click()
  const ask = page.getByRole('dialog', { name: 'Update the Series?' })
  await expect(ask).toContainText('Pine straw (around the stairs): 8 rolls → 7 rolls')
  await ask.getByRole('button', { name: 'Update Series' }).click()
  await expect(ask).toBeHidden()
  await expect(stairs.getByText('was 8 rolls')).toHaveCount(0)
  await expect(page.getByText(/differences? from/)).toHaveCount(0)
  await noSeriousProblems(page)

  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText(/^Done/).first()).toBeVisible()
})

test('next year starts from 7 and 5, without the flowerbed roll', async ({ page }) => {
  await page.goto('/projects')
  await page.getByRole('link', { name: /Back yard pine straw.*projects?/ }).click()
  await expect(page.getByText(/Done · 7 rolls around the stairs/)).toBeVisible() // last year's round, in the history
  await page.getByRole('link', { name: 'Start Project' }).click()
  await page.getByRole('button', { name: 'Start Project' }).click()

  await expect(page.getByText('Pine straw · 7 rolls')).toBeVisible()
  await expect(page.getByText('Pine straw · 5 rolls')).toBeVisible()
  await expect(page.getByText('flowerbeds')).toHaveCount(0)
  await expect(page.getByText('Rake out old straw')).toBeVisible()
})
