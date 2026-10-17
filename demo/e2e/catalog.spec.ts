import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

function summaryTip(): string {
  const summary = JSON.parse(readFileSync(new URL('../src/generated/summary.json', import.meta.url), 'utf8')) as {
    entries: { commit: string }[]
  }
  return summary.entries[summary.entries.length - 1].commit.slice(0, 12)
}

test('sandboxed projects are cards and metrics keep the charts', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/projects')
  await expect(page.getByRole('heading', { level: 1, name: 'Sandboxed projects.' })).toBeVisible()
  await expect(page.getByTestId('project-card').first()).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/\bguest\b/i)
  await expect(page.locator('body')).not.toContainText(/RE2/)
  await page.goto('/metrics')
  await expect(page.getByRole('heading', { level: 1, name: 'What each commit measured.' })).toBeVisible()
  await expect(page.getByTestId('page-hero-graphic')).toBeVisible()
  await expect(page.getByTestId('language-card').first()).toBeVisible()
  await expect(page.getByTestId('problem-card').first()).toBeVisible()
  await expect(page.getByTestId('benchmark-readout')).toContainText('go native')
  await expect(page.getByTestId('benchmark-readout')).toContainText('wasm (node)')
  await expect(page.locator('body')).not.toContainText(/RE2/)
  await expect(page.locator('body')).not.toContainText(/\bguest\b/i)
  await expect(page.getByText('Placeholder')).toHaveCount(0)
  await expect(page.getByTestId('time-chart')).toContainText('go native')
  await expect(page.getByTestId('benchmark-readout')).toContainText('× go')
  await expect(page.getByTestId('benchmark-readout')).not.toContainText(' ms')
  await expect(page.getByTestId('benchmark-readout')).toContainText(summaryTip())
})

test('problems index shows the finish line', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/problems')
  await expect(page.getByRole('heading', { level: 1, name: 'Programs with a finish line.' })).toBeVisible()
  await expect(page.getByTestId('page-hero-graphic')).toBeVisible()
  await expect(page.getByTestId('problem-index')).toBeVisible()
  await expect(page.getByTestId('program-leaderboard')).toBeVisible()
  await expect(page.getByTestId('program-improve')).toContainText(/autoresearch/i)
})

test('mobile projects page keeps the hero and the cards', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/projects')
  await expect(page.getByTestId('page-hero')).toBeVisible()
  await expect(page.getByTestId('project-cards')).toBeVisible()
  await expect(page.getByTestId('page-sidebar')).toBeHidden()
  await page.getByTestId('menu-toggle').click()
  await expect(page.getByTestId('site-menu').getByRole('link', { name: /Sandboxed projects/ })).toBeVisible()
})

test('metrics chart headings are deep links', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/metrics#host-time')
  await expect(page.getByRole('heading', { level: 3, name: 'Host time' })).toBeInViewport()
  await expect(page.getByTestId('benchmark-readout')).toContainText('wasm (node)')
})
