import { expect, test, type Page } from '@playwright/test'

async function openExamples(page: Page): Promise<void> {
  await page.getByTestId('playground-examples-trigger').click()
}

async function showOutput(page: Page): Promise<void> {
  await expect(page.getByTestId('playground-panel-resources')).toBeVisible()
}

async function fillRules(page: Page, value: string): Promise<void> {
  const rules = page.getByTestId('playground-rules')
  await expect.poll(async () => rules.evaluate(element => {
    const editorElement = element as HTMLElement & { __thueppSetValue?: (next: string) => void }
    return typeof editorElement.__thueppSetValue === 'function'
  }), { timeout: 10_000 }).toBe(true)
  await rules.evaluate((element, text) => {
    const editorElement = element as HTMLElement & { __thueppSetValue?: (next: string) => void }
    if (!editorElement.__thueppSetValue) throw new Error('rules Monaco editor is not ready')
    editorElement.__thueppSetValue(text)
  }, value)
}

test('a tiny program runs and the status bar shows steps, probes, and state', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')
  await page.getByTestId('playground-end').click()
  await showOutput(page)
  await expect(page.getByTestId('resource-output-stdout')).toHaveValue('Hello, World!\n')
  await expect(page.getByTestId('playground-status')).toContainText('exited 0')
  const limits = page.getByTestId('playground-applied-limits')
  await expect(limits).toContainText('steps ')
  await expect(limits).toContainText('/1000000')
  await expect(limits).toContainText('probes ')
  await expect(limits).toContainText('state ')
  await expect(limits).toContainText('/8388608')
})

test('a step limit stops a looping program', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')
  await fillRules(page, '^a$ ::= a\n\n::=\na\n')
  await page.getByTestId('playground-state').fill('a')
  await page.getByTestId('playground-settings-trigger').click()
  await page.getByTestId('playground-max-steps-1000').click()
  await page.getByTestId('playground-settings-trigger').click()
  await page.getByTestId('playground-end').click()
  await expect(page.getByTestId('playground-status')).toContainText('exited 10')
  await expect(page.getByTestId('playground-applied-limits')).toContainText('steps 1000/1000')
})

test('one lisp example loads without running it', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')
  await openExamples(page)
  await page.getByTestId('test-case-menu-trigger').filter({ hasText: 'Lisp' }).click()
  await page.getByTestId('test-case-menu-case').filter({ hasText: 'Closure call' }).click()
  await expect(page.getByTestId('playground-selected-case')).toContainText('closure_binding_flattening.toml')
  await expect(page.getByTestId('playground-state')).toHaveValue('((fn () 7))')
  await expect(page.getByTestId('playground-status')).toContainText('idle')
})
