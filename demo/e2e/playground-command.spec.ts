import { expect, test, type Page } from '@playwright/test'

async function fillRules(page: Page, value: string): Promise<void> {
  await page.getByTestId('playground-rules').evaluate((element, text) => {
    const editorElement = element as HTMLElement & { __thueppSetValue?: (value: string) => void }
    if (!editorElement.__thueppSetValue) throw new Error('rules Monaco editor is not ready')
    editorElement.__thueppSetValue(text)
  }, value)
}

function collectRuntimeErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => {
    if (message.type() === 'error') errors.push(message.text())
  })
  return errors
}

test('koan detail route renders a usable full-width solve-first playground', async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page)
  await page.goto('/koans/fixed-greet/')

  const pageRoot = page.getByTestId('koans-page')
  const surface = page.getByTestId('playground-full-surface')
  const koanPanel = page.getByTestId('koan-playground-panel')
  const solutions = page.getByTestId('koan-solutions-panel')
  const rules = page.getByTestId('playground-rules')
  const state = page.getByTestId('playground-state')
  const resources = page.getByTestId('resource-sections').first()

  await expect(page.getByTestId('koan-toc')).toHaveCount(0)
  await expect(pageRoot).toHaveClass(/koan-detail-page/)
  await expect(koanPanel).toBeVisible()
  await expect(solutions).toBeVisible()
  await expect(page.getByTestId('koan-run-tests')).toBeVisible()
  await expect(page.getByTestId('koan-test-details-default-state')).toHaveCount(0)
  await page.getByTestId('koan-test-toggle-default-state').click()
  await expect(page.getByTestId('koan-test-details-default-state')).toBeVisible()
  await expect(page.getByTestId('koan-test-resource-fixture-expected-default-state-stdout')).toContainText('"Hello, koan!\\n"')
  await expect(rules).toBeVisible()
  await expect(state).toBeVisible()
  await expect(resources).toBeVisible()
  await expect(koanPanel).not.toHaveAttribute('data-slot', 'card')
  await expect(solutions).not.toHaveAttribute('data-slot', 'card')

  const [pageBox, surfaceBox, koanBox, solutionsBox, rulesBox, stateBox, resourcesBox] = await Promise.all([
    pageRoot.boundingBox(),
    surface.boundingBox(),
    koanPanel.boundingBox(),
    solutions.boundingBox(),
    rules.boundingBox(),
    state.boundingBox(),
    resources.boundingBox(),
  ])
  expect(pageBox?.width ?? 0).toBeGreaterThan(1100)
  expect(surfaceBox?.width ?? 0).toBeGreaterThan(1000)
  expect(surfaceBox?.height ?? 0).toBeGreaterThan(400)
  const pageScroll = await page.evaluate(() => (document.scrollingElement?.scrollHeight ?? 0) - window.innerHeight)
  expect(pageScroll).toBeLessThanOrEqual(1)
  expect(koanBox?.height ?? 0).toBeGreaterThan(180)
  expect(solutionsBox?.height ?? 0).toBeGreaterThan(80)
  expect(rulesBox?.height ?? 0).toBeGreaterThan(250)
  expect(Math.abs((solutionsBox?.x ?? 0) - (koanBox?.x ?? 0))).toBeLessThan(8)
  expect(solutionsBox!.y).toBeGreaterThan(koanBox!.y)
  expect(solutionsBox!.x).toBeLessThan(rulesBox!.x)
  expect(koanBox!.x).toBeLessThan(rulesBox!.x)
  expect(rulesBox!.x).toBeLessThan(stateBox!.x)
  expect(stateBox!.x).toBeLessThan(resourcesBox!.x)

  await page.getByTestId('solution-sort-title').click()
  await expect(page.getByTestId('koan-solutions-table').locator('tbody tr').first()).toContainText('Direct Greeting')
  await page.getByTestId('solution-sort-title').click()
  await expect(page.getByTestId('koan-solutions-table').locator('tbody tr').first()).toContainText('Staged Greeting')
  await page.getByTestId('solution-2026-05-29-direct-greeting').click()
  await expect(page).toHaveURL(/\/koans\/fixed-greet\/2026-05-29-direct-greeting\/?$/)
  expect(runtimeErrors).toEqual([])
})

test('koan run tests reports passing and failing browser results', async ({ page }) => {
  const runtimeErrors = collectRuntimeErrors(page)
  await page.goto('/koans/binary-not/')

  await fillRules(page, '@IN@ ::< 1 stdin\n^0$ ::= OUT1\\nEXIT\n^1$ ::= OUT0\\nEXIT\nOUT1 ::> stdout 1\\n\nOUT0 ::> stdout 0\\n\n^EXIT$ ::- 0\n::=\n@IN@')
  await page.getByTestId('koan-run-tests').click()

  await expect(page.getByTestId('koan-results-summary')).toContainText('2 passing', { timeout: 5000 })
  await expect(page.getByTestId('koan-test-zero-to-one')).toHaveAttribute('data-status', 'pass')
  await expect(page.getByTestId('koan-test-one-to-zero')).toHaveAttribute('data-status', 'pass')
  await expect(page.getByTestId('koan-debug-zero-to-one')).toHaveCount(0)

  await fillRules(page, '0 ::= 1')
  await page.getByTestId('koan-run-tests').click()

  await expect(page.getByTestId('koan-results-summary')).toContainText('0 passing · 2 failing', { timeout: 5000 })
  await expect(page.getByTestId('koan-test-zero-to-one')).toHaveAttribute('data-status', 'fail')
  await expect(page.getByTestId('koan-test-details-zero-to-one')).toBeVisible()
  await expect(page.getByTestId('koan-test-resource-input-zero-to-one-stdin')).toContainText('"0\\n"')
  await expect(page.getByTestId('koan-test-resource-diff-zero-to-one-stdout')).toContainText('stdout differs')
  await expect(page.getByTestId('koan-test-resource-expected-zero-to-one-stdout')).toContainText('"1\\n"')
  await expect(page.getByTestId('koan-test-resource-actual-zero-to-one-stdout')).toContainText('""')
  await page.getByTestId('koan-test-toggle-zero-to-one').click()
  await expect(page.getByTestId('koan-test-details-zero-to-one')).toHaveCount(0)
  expect(runtimeErrors).toEqual([])
})

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

test('command palette can load top-level manifest tests without dropping hash-prefixed source rows', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp')

  await page.getByTestId('test-case-command-trigger').click()
  await page.getByTestId('test-case-command-input').fill('source row beginning with hash')
  await page.getByTestId('test-case-option').first().click()

  await expect(page.getByTestId('test-case-command-current')).toContainText('source_hash_rule.toml')
  await expect(page.getByTestId('playground-rules')).toContainText('#x ::= y')
  await expect(page.getByTestId('playground-rules')).toContainText('^y$ ::> stdout source-row-rule\\n')
  await expect(page.getByTestId('playground-state')).toHaveValue('#x')
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
  await expect(page.getByTestId('playground-diffs')).toContainText('#1 row 1')
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
  await expect(page.getByTestId('playground-diffs')).toContainText('#1 row 1')
  await expect(page.getByTestId('playground-diffs')).toContainText('^(?<a>\\d+),(?<b>\\d+)$ ::! nope a b')
  await expect(page.getByTestId('playground-diff-error')).toContainText("Line 1: Unknown builtin 'nope'")

  await expect(page.getByTestId('playground-step')).toBeEnabled()
  await page.getByTestId('playground-state').fill('2,3')
  await page.getByTestId('playground-step').click()
  await expect(page.getByTestId('resource-output-stderr')).toHaveValue("Line 1: Unknown builtin 'nope'\nLine 1: Unknown builtin 'nope'")
})

test('state history click restores state and step prunes future rows', async ({ page }) => {
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

test('playground compact mode and embed header query params are observable', async ({ page }) => {
  await page.goto('/playground?file=./examples/hello/hello.tpp&mode=compact&section=trace')
  await expect(page.getByTestId('playground-header')).toBeVisible()
  await expect(page.getByTestId('playground-compact-surface')).toBeVisible()
  await expect(page.getByTestId('embed-section-panel')).toContainText('trace')

  await page.goto('/embed?file=./examples/hello/hello.tpp&header=1')
  await expect(page.getByTestId('playground-header')).toBeVisible()
  await expect(page.getByTestId('test-selector')).toHaveCount(0)
  await expect(page.getByTestId('playground-compact-surface')).toBeVisible()
})

test('embed run executes through the shared worker path and writes stdout', async ({ page }) => {
  await page.goto('/embed?file=./examples/hello/hello.tpp&section=output&tab=stdout&controls=run')

  await page.getByTestId('embed-run').click()
  await expect(page.getByTestId('resource-output-stdout')).toHaveValue('Hello, World!\n', { timeout: 5000 })
})

test('embed demo lists preset embed examples', async ({ page }) => {
  await page.goto('/embed/demo')

  await expect(page.getByRole('heading', { name: 'Compact Thue++ playground embeds' })).toBeVisible()
  await expect(page.getByText('Output-focused runnable snippet')).toBeVisible()
  await expect(page.getByTestId('playground-compact-surface')).toHaveCount(3)
})
