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
  await expect(page.getByTestId('playground-diffs')).toContainText('#1 row 1')
  await expect(page.getByTestId('playground-diffs')).toContainText('hello ::> stdout Hello, World!\\n')
  await expect(page.getByTestId('terminal')).toHaveCount(0)
  await expect(page.getByTestId('playground-reset')).toHaveCount(0)
})

test('empty history and resources do not show helper labels', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')

  await expect(page.getByTestId('playground-diffs')).not.toContainText('step diffs appear here')
  await expect(page.getByTestId('playground-continue-speed')).toHaveValue('10')
  await expect(page.getByTestId('playground-pause')).toContainText('Pause')
  await expect(page.getByTestId('playground-pause')).toBeDisabled()
  await expect(page.getByTestId('playground-continue-speed')).toContainText('1/s')
  await expect(page.getByTestId('playground-continue-speed')).toContainText('5/s')
  await expect(page.getByTestId('playground-continue-speed')).toContainText('10/s')
  await expect(page.getByTestId('resource-section-stdin')).toContainText('stdin')
  await expect(page.getByTestId('resource-section-stdin')).not.toContainText('input')
  await expect(page.getByTestId('resource-section-stdin')).not.toContainText('read')
  await expect(page.getByTestId('resource-section-stdout')).toContainText('stdout')
  await expect(page.getByTestId('resource-section-stdout')).not.toContainText('output')
  await expect(page.getByTestId('resource-section-stdout')).not.toContainText('write')
})

test('failed matched builtin appears in state history', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')
  await fillRules(page, '^div:(?<a>[0-9]+),(?<b>[0-9]+)$ ::! div a b')
  await page.getByTestId('playground-state').fill('div:1,0')

  await page.getByTestId('playground-step').click()
  await expect(page.getByTestId('playground-status')).toContainText('exited 1')
  await expect(page.getByTestId('playground-step')).toBeDisabled()
  await expect(page.getByTestId('playground-continue')).toBeDisabled()
  await expect(page.getByTestId('playground-step')).toHaveAttribute('title', /Program exited/)
  await expect(page.getByTestId('playground-continue')).toHaveAttribute('title', /Program exited/)
  await expect(page.getByTestId('playground-diffs')).toContainText('#1 row 1')
  await expect(page.getByTestId('playground-diff-error')).toContainText("Builtin 'div' division by zero")

  await page.getByTestId('playground-state').fill('div:2,1')
  await expect(page.getByTestId('playground-step')).toBeEnabled()
  await expect(page.getByTestId('playground-continue')).toBeEnabled()
  await expect(page.getByTestId('playground-step')).toHaveAttribute('title', 'Step')
  await expect(page.getByTestId('playground-continue')).toHaveAttribute('title', 'Continue')
})

test('parse-time builtin errors appear in state history', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')
  await fillRules(page, '^(?<a>\\d+),(?<b>\\d+)$ ::! nope a b')
  await page.getByTestId('playground-state').fill('1,2')

  await page.getByTestId('playground-step').click()
  await expect(page.getByTestId('playground-status')).toContainText('exited 1')
  await expect(page.getByTestId('resource-output-stderr')).toHaveValue("Line 1: Unknown builtin 'nope'")
  await expect(page.getByTestId('playground-diffs')).toContainText('#1 row 1')
  await expect(page.getByTestId('playground-diffs')).toContainText('^(?<a>\\d+),(?<b>\\d+)$ ::! nope a b')
  await expect(page.getByTestId('playground-diff-error')).toContainText("Line 1: Unknown builtin 'nope'")

  await expect(page.getByTestId('playground-step')).toBeDisabled()
  await page.getByTestId('playground-state').fill('2,3')
  await page.getByTestId('playground-step').click()
  await expect(page.getByTestId('resource-output-stderr')).toHaveValue("Line 1: Unknown builtin 'nope'\nLine 1: Unknown builtin 'nope'")
})

test('timeline click restores state and step prunes future rows', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')
  await fillRules(page, '^start$ ::= middle\n^middle$ ::= done')
  await page.getByTestId('playground-state').fill('start')

  await page.getByTestId('playground-continue').click()
  await expect(page.locator('.state-diff-entry')).toHaveCount(2)
  await expect(page.getByTestId('playground-status')).toContainText('exited 0')
  await expect(page.locator('.state-diff-entry').nth(0)).toContainText('^start$ ::= middle')
  await expect(page.locator('.state-diff-entry').nth(1)).toContainText('^middle$ ::= done')
  await expect(page.getByTestId('playground-state')).toHaveValue('done')

  await page.locator('.state-diff-entry').nth(0).click()
  await expect(page.getByTestId('playground-state')).toHaveValue('middle')
  await expect(page.getByTestId('playground-status')).toContainText('checkpoint #1')
  await expect(page.locator('.state-diff-entry').nth(1)).toHaveAttribute('data-future', 'true')

  await page.getByTestId('playground-undo').click()
  await expect(page.getByTestId('playground-state')).toHaveValue('start')
  await expect(page.getByTestId('playground-status')).toContainText('checkpoint initial')

  await page.locator('.state-diff-entry').nth(0).click()
  await fillRules(page, '^middle$ ::= branch')
  await page.getByTestId('playground-step').click()
  await expect(page.locator('.state-diff-entry')).toHaveCount(2)
  await expect(page.getByTestId('playground-diffs')).not.toContainText('^middle$ ::= done')
  await expect(page.getByTestId('playground-diffs')).toContainText('^middle$ ::= branch')
  await expect(page.getByTestId('playground-state')).toHaveValue('branch')
})

test('stdin submit resumes the last step command', async ({ page }) => {
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

  await expect(page.getByTestId('playground-auto')).toHaveCount(0)
  await page.getByTestId('playground-continue').click()
  await expect(page.getByTestId('resource-output-stdout')).toHaveValue('Guess:\nPlease enter digits only.\nGuess:\nToo low.\nGuess:\nToo high.\nGuess:\nCorrect!\n', { timeout: 5000 })
  await expect(page.getByTestId('resource-input-stdin')).toHaveValue('')
  await expect(page.getByTestId('resource-input-random')).toHaveValue('')
})
