import { expect, test, type Page } from '@playwright/test'

const viewports = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
]

async function expectShell(page: Page, width: number): Promise<void> {
  await expect(page.getByTestId('page-hero')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rewrite a string until it stops.' })).toBeVisible()
  await expect(page.getByTestId('page-details')).toBeVisible()
  await expect(page.getByTestId('app-shell')).toBeVisible()
  await expect(page.getByTestId('toc-trigger')).toHaveCount(0)
  if (width >= 1280) {
    await expect(page.getByTestId('site-nav')).toBeVisible()
    await expect(page.getByTestId('page-sidebar')).toBeVisible()
    await expect(page.getByTestId('aside-trigger')).toBeHidden()
    await expect(page.getByTestId('site-nav').getByRole('link', { name: 'Reference' })).toBeVisible()
    return
  }
  await expect(page.getByTestId('site-nav')).toBeHidden()
  await expect(page.getByTestId('page-sidebar')).toBeHidden()
  await page.getByTestId('nav-trigger').click()
  await expect(page.getByTestId('site-nav')).toBeVisible()
  await expect(page.getByTestId('site-nav').getByRole('link', { name: 'Hosts' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('site-nav')).toBeHidden()
  await page.getByTestId('aside-trigger').click()
  await expect(page.getByTestId('page-sidebar')).toBeVisible()
  await expect(page.getByTestId('page-sidebar').getByRole('link', { name: 'A program' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('page-sidebar')).toBeHidden()
}

for (const viewport of viewports) {
  test(`${viewport.name} learn page uses the shell for that width`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/learn')
    await expectShell(page, viewport.width)
  })
}

test('theme toggle switches light and dark', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/learn')
  await page.getByTestId('theme-toggle').click()
  await page.getByTestId('theme-dark').click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByTestId('theme-toggle').click()
  await page.getByTestId('theme-light').click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('mobile theme toggle switches light and dark', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.getByTestId('theme-toggle').click()
  await page.getByTestId('theme-dark').click()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('heading', { name: 'A rewrite language built on RE2.' })).toBeVisible()
  await page.getByTestId('theme-toggle').click()
  await page.getByTestId('theme-light').click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
})

test('embed has no site chrome', async ({ page }) => {
  await page.goto('/embed?file=./examples/hello/hello.tpp&section=state')
  await expect(page.getByTestId('app-shell')).toHaveCount(0)
  await expect(page.getByTestId('nav-trigger')).toHaveCount(0)
  await expect(page.getByTestId('playground-workbench')).toBeVisible()
  await expect(page.getByTestId('page-hero')).toHaveCount(0)
})

test('a page without an aside uses the full content width', async ({ page }) => {
  for (const width of [375, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 })
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'A rewrite language built on RE2.' })).toBeVisible()
    await expect(page.getByTestId('page-sidebar')).toHaveCount(0)
    await expect(page.getByTestId('aside-trigger')).toHaveCount(0)
  }
})

test('deep links render their own heading', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  for (const [path, heading] of [
    ['/reference', 'Operators, resources, and limits.'],
    ['/hosts', 'Go, Python, and JavaScript.'],
    ['/guests', 'Languages written in Thue++.'],
    ['/tasks', 'Programs with a finish line.'],
    ['/playground', 'Run it in the browser.'],
  ] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
    await expect(page.getByTestId('page-details')).toBeVisible()
    await expect(page.getByTestId('page-sidebar')).toHaveCount(0)
  }
})
