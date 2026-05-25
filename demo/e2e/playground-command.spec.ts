import { expect, test, type Page } from '@playwright/test'

async function fillRules(page: Page, value: string): Promise<void> {
  await page.getByTestId('playground-rules').evaluate((element, text) => {
    const editorElement = element as HTMLElement & { __thueppSetValue?: (value: string) => void }
    if (!editorElement.__thueppSetValue) throw new Error('rules Monaco editor is not ready')
    editorElement.__thueppSetValue(text)
  }, value)
}

test('playground selector searches by path/case but not input', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')
  await page.getByTestId('test-case-command-trigger').click()
  const search = page.getByTestId('test-case-command-input')

  await search.fill('closure_binding_flattening zero arg')
  await expect(page.getByTestId('test-case-option').first()).toBeVisible()
  await expect(page.getByTestId('test-case-option-path').first()).toContainText('closure_binding_flattening.toml')
  await expect(page.getByTestId('test-case-option-name').first()).toContainText('zero arg')
  await expect(page.getByTestId('test-case-option-input-preview').first()).toContainText('fn')

  await search.fill('100')
  await expect(page.getByTestId('test-case-command-empty')).toBeVisible()
})

test('clicking a test case loads rules, state, and resources without running', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')

  await page.getByTestId('test-case-command-trigger').click()
  await page.getByTestId('test-case-command-input').fill('zero arg closure call still evaluates body')
  await page.getByTestId('test-case-option').first().click()

  await expect(page.getByTestId('playground-state')).toHaveValue('((fn () 7))')
  await expect(page.getByTestId('resource-output-stdout')).toHaveValue('')
  await expect(page.getByTestId('playground-status')).toContainText('idle')
  await expect(page.getByTestId('terminal')).toHaveCount(0)
})

test('step button writes stdout without a shell simulator', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')
  await fillRules(page, 'hello ::> stdout Hello, World!\\n\ndone ::- 0\n\n::=')
  await page.getByTestId('playground-state').fill('hello\ndone')

  await expect(page.getByTestId('playground-run')).toHaveCount(0)
  await page.getByTestId('playground-step').click()
  await expect(page.getByTestId('resource-output-stdout')).toHaveValue('Hello, World!\n')
  await expect(page.getByTestId('resource-output-stderr')).toHaveValue('')
  await expect(page.getByTestId('terminal')).toHaveCount(0)
  await expect(page.getByTestId('playground-reset')).toHaveCount(0)
})

test('stdin submit respects the auto checkbox', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')
  await fillRules(page, 'PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*\n^read$ ::= got:@IN@\n@IN@ ::< 30 stdin\n^got:(?<data>$PCT)$ ::> stdout {{data|pctdec}}\\n')
  await page.getByTestId('playground-state').fill('read')

  await page.getByTestId('resource-input-stdin').fill('Ada')
  await expect(page.getByTestId('stdin-send')).toHaveCount(0)
  await expect(page.getByTestId('stdin-queue')).toHaveCount(0)
  await expect(page.getByTestId('resource-ready-stdin')).toHaveCount(0)

  await page.getByTestId('playground-step').click()
  await page.getByTestId('playground-step').click()
  await expect(page.getByTestId('playground-status')).toContainText('waiting for stdin')
  await expect(page.getByTestId('resource-input-stdin')).toBeFocused()
  await expect(page.getByTestId('playground-state')).toHaveValue(/got:@IN@/)
  await expect(page.getByTestId('resource-output-stdout')).toHaveValue('')

  await page.getByTestId('resource-submit-stdin').click()
  await expect(page.getByTestId('playground-state')).toHaveValue('got:Ada')
  await expect(page.getByTestId('resource-output-stdout')).toHaveValue('')

  await page.getByTestId('playground-step').click()
  await expect(page.getByTestId('resource-output-stdout')).toHaveValue('Ada\n')
  await expect(page.getByTestId('resource-input-stdin')).toHaveValue('')
})

test('resource sections are derived from rules and stdio is pinned', async ({ page }) => {
  await page.goto('/playground?file=./examples/guess-number/guess-number.tpp')

  await expect(page.getByTestId('playground-js-procs')).toHaveCount(0)
  await expect(page.getByTestId('resource-section-stdin')).toBeVisible()
  await expect(page.getByTestId('resource-section-stdout')).toBeVisible()
  await expect(page.getByTestId('resource-section-stderr')).toBeVisible()
  await expect(page.getByTestId('resource-section-random')).toContainText('random')
  await page.getByTestId('resource-input-random').fill('7')
  await page.getByTestId('resource-input-stdin').fill('x\n3\n8\n7')
  await page.getByTestId('resource-submit-random').click()
  await page.getByTestId('resource-submit-stdin').click()

  await page.getByTestId('playground-auto').check()
  await page.getByTestId('playground-step').click()
  await expect(page.getByTestId('resource-output-stdout')).toHaveValue('Guess:\nPlease enter digits only.\nGuess:\nToo low.\nGuess:\nToo high.\nGuess:\nCorrect!\n')
  await expect(page.getByTestId('resource-input-stdin')).toHaveValue('')
  await expect(page.getByTestId('resource-input-random')).toHaveValue('')
})
