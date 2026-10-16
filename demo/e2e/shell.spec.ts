import { expect, test, type Page } from '@playwright/test'

const viewports = [
  { name: '390', width: 390, height: 844 },
  { name: '768', width: 768, height: 1024 },
  { name: '1024', width: 1024, height: 768 },
  { name: '1440', width: 1440, height: 900 },
]

async function expectDocsShell(page: Page, width: number): Promise<void> {
  await expect(page.getByTestId('app-shell')).toBeVisible()
  await expect(page.getByTestId('page-hero')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Rewrite a string until it stops.' })).toBeVisible()
  await expect(page.getByTestId('page-details')).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByTestId('github-link')).toBeVisible()
  if (width >= 1024) {
    await expect(page.getByTestId('menu-toggle')).toBeHidden()
    await expect(page.getByTestId('site-nav').getByRole('button', { name: 'Docs' })).toBeVisible()
    await expect(page.getByTestId('site-nav').getByRole('link', { name: 'Playground' })).toBeVisible()
    await page.getByTestId('site-nav').getByRole('button', { name: 'Docs' }).click()
    await expect(page.getByTestId('site-nav').getByRole('link', { name: 'Language reference' })).toBeVisible()
    await expect(page.getByTestId('page-sidebar')).toBeVisible()
    await expect(page.getByTestId('page-sidebar').getByRole('link', { name: 'A program' })).toHaveAttribute('aria-current', 'location')
    await expect(page.getByTestId('contents-toggle')).toBeHidden()
    return
  }
  await expect(page.getByTestId('site-nav').getByRole('button', { name: 'Docs' })).toBeHidden()
  await expect(page.getByTestId('page-sidebar')).toBeHidden()
  await page.getByTestId('menu-toggle').click()
  await expect(page.getByTestId('site-menu').getByRole('link', { name: /Quick start/ })).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId('site-menu').getByRole('link', { name: /Quick start/ })).toBeHidden()
  await page.getByTestId('contents-toggle').click()
  await expect(page.getByTestId('page-sidebar').getByRole('link', { name: 'A program' })).toBeVisible()
  await page.getByTestId('contents-toggle').click()
  await expect(page.getByTestId('page-sidebar')).toBeHidden()
}

for (const viewport of viewports) {
  test(`${viewport.name} learn page uses the docs shell`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/docs/guides')
    await expectDocsShell(page, viewport.width)
  })

  test(`${viewport.name} switches dark and light`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height })
    await page.goto('/docs/guides')
    await expect(page.locator('html')).toHaveClass(/dark/)
    await page.getByTestId('theme-toggle').click()
    await page.getByTestId('theme-light').click()
    await expect(page.locator('html')).not.toHaveClass(/dark/)
    await expect(page.getByRole('heading', { name: 'Rewrite a string until it stops.' })).toBeVisible()
    await page.getByTestId('theme-toggle').click()
    await page.getByTestId('theme-dark').click()
    await expect(page.locator('html')).toHaveClass(/dark/)
  })
}

test('home keeps the landing copy and stays dark by default', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await expect(page.locator('html')).toHaveClass(/dark/)
  await expect(page.getByRole('heading', { level: 1, name: 'Thue++' })).toBeVisible()
  await expect(page.getByText('The safest, smallest, sandbox.')).toBeVisible()
  await expect(page.getByTestId('landing-languages')).toContainText('Available in go, python, js, rust, cpp, and soon erlang, ocaml, perl, ruby, haskell')
  await expect(page.getByTestId('rewrite-motif')).toBeVisible()
  await expect(page.locator('body')).not.toContainText(/RE2/)
})

test('playground is outside the docs shell in both themes', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/playground')
  await expect(page.getByTestId('app-shell')).toHaveCount(0)
  await expect(page.getByTestId('playground-standalone')).toBeVisible()
  await expect(page.locator('html')).toHaveClass(/dark/)
  await page.getByTestId('theme-toggle').click()
  await page.getByTestId('theme-light').click()
  await expect(page.locator('html')).not.toHaveClass(/dark/)
  await expect(page.getByTestId('site-header')).toBeVisible()
  await expect(page.getByTestId('playground-toolbar')).toBeVisible()
  await expect(page.getByTestId('app-shell')).toHaveCount(0)
})

test('embed has no site chrome', async ({ page }) => {
  await page.goto('/embed?file=./examples/hello/hello.tpp&section=state')
  await expect(page.getByTestId('app-shell')).toHaveCount(0)
  await expect(page.getByTestId('contents-toggle')).toHaveCount(0)
  await expect(page.getByTestId('playground-workbench')).toBeVisible()
  await expect(page.getByTestId('page-hero')).toHaveCount(0)
})

test('scroll spy highlights the section in view', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 640 })
  await page.goto('/docs/guides')
  const sidebar = page.getByTestId('page-sidebar')
  await expect(sidebar.getByRole('link', { name: 'A program' })).toHaveAttribute('aria-current', 'location')
  await page.evaluate(() => {
    const heading = document.getElementById('operators')
    if (!heading) throw new Error('missing operators')
    const top = heading.getBoundingClientRect().top + window.scrollY
    window.scrollTo(0, Math.max(0, top - 80))
  })
  await expect(sidebar.getByRole('link', { name: 'Operators' })).toHaveAttribute('aria-current', 'location')
  await expect(sidebar.getByRole('link', { name: 'A program' })).not.toHaveAttribute('aria-current', 'location')
})

test('deep links render their own heading', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  for (const [path, heading] of [
    ['/docs/language', 'Operators, resources, and limits.'],
    ['/install', 'Install a host.'],
    ['/install/rust', 'Rust.'],
    ['/projects', 'Sandboxed projects.'],
    ['/metrics', 'What each commit measured.'],
    ['/tasks', 'Programs with a finish line.'],
  ] as const) {
    await page.goto(path)
    await expect(page.getByRole('heading', { level: 1, name: heading })).toBeVisible()
  }
  await page.goto('/playground')
  await expect(page.getByTestId('site-header')).toBeVisible()
  await expect(page.getByTestId('site-nav').getByRole('link', { name: 'Playground' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByTestId('playground-toolbar')).toBeVisible()
  await expect(page.getByTestId('app-shell')).toHaveCount(0)
  await page.goto('/docs/guides')
  await expect(page.getByTestId('page-details')).toBeVisible()
})
