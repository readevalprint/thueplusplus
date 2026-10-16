import { expect, test } from '@playwright/test'

test('guests leaderboard invites autoresearch', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/guests')
  await expect(page.getByRole('heading', { level: 1, name: 'Languages written in Thue++.' })).toBeVisible()
  await expect(page.getByTestId('page-hero-graphic')).toBeVisible()
  await expect(page.getByRole('link', { name: 'See the tasks' })).toBeVisible()
  await expect(page.getByRole('columnheader', { name: 'Passed' })).toBeVisible()
  await expect(page.getByTestId('guest-improve')).toContainText(/autoresearch/i)
  await expect(page.getByTestId('benchmark-readout')).toContainText('go native')
  await expect(page.getByTestId('benchmark-readout')).toContainText('wasm (node)')
  await expect(page.locator('body')).not.toContainText(/RE2/)
  await expect(page.getByText('Placeholder')).toHaveCount(0)
  await expect(page.getByTestId('rule-readout')).toContainText('9e3bdd81f38b')
  await page.getByTestId('rule-chart-slider').fill('0')
  await expect(page.getByTestId('rule-readout')).not.toContainText('9e3bdd81f38b')
})

test('tasks index shows the finish line', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/tasks')
  await expect(page.getByRole('heading', { level: 1, name: 'Programs with a finish line.' })).toBeVisible()
  await expect(page.getByTestId('page-hero-graphic')).toBeVisible()
  await expect(page.getByTestId('task-index')).toBeVisible()
})

test('mobile guests page keeps the hero and the leaderboard', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/guests')
  await expect(page.getByTestId('page-hero')).toBeVisible()
  await expect(page.getByTestId('guest-leaderboard')).toBeVisible()
  await expect(page.getByTestId('page-sidebar')).toBeHidden()
  await page.getByTestId('menu-toggle').click()
  await expect(page.getByTestId('site-menu').getByRole('link', { name: 'Tasks' })).toBeVisible()
})

test('guests chart headings are deep links', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/guests#host-time')
  await expect(page.getByRole('heading', { level: 3, name: 'Host time' })).toBeInViewport()
  await expect(page.getByTestId('benchmark-readout')).toContainText('wasm (node)')
})
