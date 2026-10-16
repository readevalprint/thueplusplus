import { expect, test, type Page } from '@playwright/test'

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

test('example menu lists curated groups and has no command search', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')
  const menu = page.getByTestId('test-case-menu')

  await expect(menu.getByTestId('test-case-menu-trigger').filter({ hasText: 'Basic rules' })).toBeVisible()
  await expect(menu.getByTestId('test-case-menu-trigger').filter({ hasText: 'Lisp' })).toBeVisible()
  await expect(page.getByTestId('test-case-command-trigger')).toHaveCount(0)
  await expect(page.getByTestId('test-case-command-input')).toHaveCount(0)

  await menu.getByTestId('test-case-menu-trigger').filter({ hasText: 'Lisp' }).click()
  await expect(page.getByTestId('test-case-menu-case-name').filter({ hasText: 'Closure call' })).toBeVisible()
  await expect(page.getByTestId('test-case-menu-case-description').filter({ hasText: 'zero-argument closure' })).toBeVisible()
  await expect(page.getByTestId('test-case-menu-case-name').filter({ hasText: 'source row beginning with hash' })).toHaveCount(0)
})

test('clicking a curated test case loads rules, state, and resources without running', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')

  await page.getByTestId('test-case-menu-trigger').filter({ hasText: 'Lisp' }).click()
  await page.getByTestId('test-case-menu-case').filter({ hasText: 'Closure call' }).click()

  await expect(page.getByTestId('playground-selected-case')).toContainText('zero arg closure call still evaluates body')
  await expect(page.getByTestId('playground-selected-case')).toContainText('closure_binding_flattening.toml')
  await expect(page.getByTestId('playground-state')).toHaveValue('((fn () 7))')
  await expect(page.getByTestId('resource-output-stdout')).toHaveValue('')
  await expect(page.getByTestId('playground-status')).toContainText('idle')
  await expect(page.getByTestId('terminal')).toHaveCount(0)
})

test('opening a hash-prefixed program keeps the source row in the editor', async ({ page }) => {
  await page.goto('/playground?file=./examples/hash-data/source-hash-rule.tpp')

  await expect(page.getByTestId('playground-rules')).toContainText('#x ::= y')
  await expect(page.getByTestId('playground-rules')).toContainText('^y$ ::> stdout source-row-rule\\n')
  await expect(page.getByTestId('playground-state')).toHaveValue('')
  await expect(page.getByTestId('playground-status')).toContainText('idle')
})

test('step button writes stdout without a shell simulator', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')
  await fillRules(page, 'hello ::> stdout Hello, World!\\n\ndone ::- 0\n\n::=')
  await page.getByTestId('playground-state').fill('hello\ndone')

  await expect(page.getByTestId('playground-run')).toHaveCount(0)
  await page.getByTestId('playground-step').click()
  await expect(page.getByTestId('resource-output-stdout')).toHaveValue('Hello, World!\n')
  await expect(page.getByTestId('resource-output-stderr')).toHaveValue('')
  await expect(page.locator('.state-diff-row')).toHaveCount(2)
  await expect(page.getByTestId('playground-diffs')).toContainText('initial state')
  await expect(page.getByTestId('playground-diffs')).toContainText('hello ::> stdout Hello, World!\\n')
  await expect(page.getByTestId('terminal')).toHaveCount(0)
  await expect(page.getByTestId('playground-reset')).toBeVisible()
})

test('empty history and resources do not show helper labels', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')

  await expect(page.getByTestId('playground-diffs')).not.toContainText('step diffs appear here')
  await expect(page.getByTestId('playground-speed-10')).toContainText('10/s')
  await expect(page.getByTestId('playground-pause')).toHaveAttribute('aria-label', 'Pause')
  await expect(page.getByTestId('playground-pause')).toBeDisabled()
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
  await expect(page.getByTestId('playground-step')).toBeEnabled()
  await expect(page.getByTestId('playground-continue')).toBeEnabled()
  await expect(page.getByTestId('playground-diffs')).toContainText('^div:(?<a>[0-9]+),(?<b>[0-9]+)$ ::! div a b')
  await expect(page.getByTestId('playground-diff-error')).toContainText("Builtin 'div' division by zero")

  await page.getByTestId('playground-state').fill('div:2,1')
  await expect(page.getByTestId('playground-step')).toBeEnabled()
  await expect(page.getByTestId('playground-continue')).toBeEnabled()
  await expect(page.getByTestId('playground-step')).toHaveAttribute('title', 'Step forward')
  await expect(page.getByTestId('playground-continue')).toHaveAttribute('title', 'Play')
})

test('parse-time builtin errors appear in state history', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')
  await fillRules(page, '^(?<a>\\d+),(?<b>\\d+)$ ::! nope a b')
  await page.getByTestId('playground-state').fill('1,2')

  await page.getByTestId('playground-step').click()
  await expect(page.getByTestId('playground-status')).toContainText('exited 1')
  await expect(page.getByTestId('resource-output-stderr')).toHaveValue("Line 1: Unknown builtin 'nope'")
  await expect(page.getByTestId('playground-diffs')).toContainText('initial state')
  await expect(page.getByTestId('playground-diffs')).toContainText('^(?<a>\\d+),(?<b>\\d+)$ ::! nope a b')
  await expect(page.getByTestId('playground-diff-error')).toContainText("Line 1: Unknown builtin 'nope'")

  await expect(page.getByTestId('playground-step')).toBeEnabled()
  await page.getByTestId('playground-state').fill('2,3')
  await page.getByTestId('playground-step').click()
  await expect(page.getByTestId('resource-output-stderr')).toHaveValue("Line 1: Unknown builtin 'nope'\nLine 1: Unknown builtin 'nope'")
})

test('timeline click restores state and step prunes future rows', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')
  await fillRules(page, '^start$ ::= middle\n^middle$ ::= done')
  await page.getByTestId('playground-state').fill('start')

  await page.getByTestId('playground-continue').click()
  await expect(page.locator('.state-diff-row')).toHaveCount(3)
  await expect(page.getByTestId('playground-status')).toContainText('exited 0')
  await expect(page.locator('.state-diff-row').nth(0)).toContainText('initial state')
  await expect(page.locator('.state-diff-row').nth(1)).toContainText('^start$ ::= middle')
  await expect(page.locator('.state-diff-row').nth(2)).toContainText('^middle$ ::= done')
  await expect(page.getByTestId('playground-state')).toHaveValue('done')

  await page.locator('.state-diff-row').nth(0).click()
  await expect(page.getByTestId('playground-state')).toHaveValue('start')
  await expect(page.getByTestId('playground-status')).toContainText('checkpoint initial')
  await expect(page.locator('.state-diff-row').nth(1)).toHaveAttribute('data-future', 'true')
  await expect(page.getByTestId('playground-undo')).toBeDisabled()

  await page.locator('.state-diff-row').nth(1).click()
  await fillRules(page, '^middle$ ::= branch')
  await page.getByTestId('playground-step').click()
  await expect(page.locator('.state-diff-row')).toHaveCount(3)
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
  await expect(page.getByTestId('resource-input-random')).toHaveJSProperty('tagName', 'TEXTAREA')
  await expect(page.getByTestId('resource-submit-random')).toBeDisabled()
  await expect(page.getByTestId('resource-submit-stdin')).toBeDisabled()

  await expect(page.getByTestId('playground-auto')).toHaveCount(0)
  await page.getByTestId('playground-continue').click()

  await expect(page.getByTestId('playground-status')).toContainText('waiting for random')
  await expect(page.getByTestId('resource-submit-random')).toBeEnabled()
  await expect(page.getByTestId('resource-submit-stdin')).toBeDisabled()
  await page.getByTestId('resource-input-random').fill('7')
  await page.getByTestId('resource-submit-random').click()

  await expect(page.getByTestId('playground-status')).toContainText('waiting for stdin')
  await expect(page.getByTestId('resource-submit-random')).toBeDisabled()
  await expect(page.getByTestId('resource-submit-stdin')).toBeEnabled()
  for (const guess of ['x', '3', '8', '7']) {
    await page.getByTestId('resource-input-stdin').fill(guess)
    await page.getByTestId('resource-submit-stdin').click()
  }

  await expect(page.getByTestId('resource-output-stdout')).toHaveValue('Guess:\nPlease enter digits only.\nGuess:\nToo low.\nGuess:\nToo high.\nGuess:\nCorrect!\n', { timeout: 5000 })
  await expect(page.getByTestId('resource-input-stdin')).toHaveValue('')
  await expect(page.getByTestId('resource-input-random')).toHaveValue('')
})

test('embed route starts on requested section and opens full playground with current file', async ({ page }) => {
  await page.goto('/embed?file=./examples/hello/hello.tpp&section=state&tab=stderr&editable=0')

  await expect(page.getByTestId('playground-header')).toHaveCount(0)
  await expect(page.getByTestId('playground-compact-surface')).toBeVisible()
  await expect(page.getByTestId('embed-section-panel')).toContainText('state')
  await expect(page.getByTestId('playground-state')).toHaveValue('START')
  await expect(page.getByTestId('embed-open-full')).toHaveAttribute('href', /\/playground\?file=.*hello\.tpp/)
})

test('playground compact mode hides the page header and embed header=1 shows it', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp&mode=compact&section=trace')
  await expect(page.getByTestId('playground-header')).toHaveCount(0)
  await expect(page.getByTestId('playground-compact-surface')).toBeVisible()
  await expect(page.getByTestId('embed-section-panel')).toContainText('trace')

  await page.goto('/embed?file=./examples/hello/hello.tpp&header=1')
  await expect(page.getByTestId('playground-header')).toBeVisible()
  await expect(page.getByTestId('test-case-menu')).toHaveCount(0)
  await expect(page.getByTestId('playground-compact-surface')).toBeVisible()
})

test('embed run executes through the shared worker path and writes stdout', async ({ page }) => {
  await page.goto('/embed?file=./examples/hello/hello.tpp&section=output&tab=stdout&controls=run')

  await page.getByTestId('embed-run').click()
  await expect(page.getByTestId('resource-output-stdout')).toHaveValue('Hello, World!\n', { timeout: 5000 })
})
