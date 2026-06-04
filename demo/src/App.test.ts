// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { runWithWorker } from './wasm'

vi.mock('./RulesMonacoEditor.vue', async () => {
  const { defineComponent, h, onMounted } = await import('vue')
  return {
    default: defineComponent({
      props: { modelValue: { type: String, default: '' }, highlightLine: { type: Number, default: undefined } },
      emits: ['update:modelValue', 'paste', 'ready'],
      setup(props, { emit, attrs }) {
        onMounted(() => emit('ready'))
        return () => h('textarea', {
          ...attrs,
          'data-current-match-line': props.highlightLine || undefined,
          value: props.modelValue,
          spellcheck: 'false',
          wrap: 'off',
          onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
          onPaste: (event: Event) => emit('paste', (event.target as HTMLTextAreaElement).value),
        })
      },
    }),
  }
})

vi.mock('./ReadmeCodeEditor.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { code: { type: String, default: '' }, language: { type: String, default: 'thuepp' }, lineNumberStart: { type: Number, default: 1 } },
      setup(props, { attrs }) {
        return () => h('pre', {
          ...attrs,
          'data-language': props.language,
          'data-line-start': props.lineNumberStart,
        }, props.code)
      },
    }),
  }
})

import App from './App.vue'
import { challenges, validateChallengeTestManifest } from './challenges/data'
import { runChallengeTests } from './challenges/runChallengeTests'

vi.mock('./wasm', async () => {
  return {
    runWithWorker: vi.fn(),
  }
})

const mockedRunWithWorker = vi.mocked(runWithWorker)

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(promiseResolve => {
    resolve = promiseResolve
  })
  return { promise, resolve }
}


function programState(wrapper: ReturnType<typeof mount>): string {
  const rules = wrapper.get('[data-test="playground-rules"]')
  const currentState = rules.attributes('data-current-state')
  if (currentState !== undefined) return currentState
  const source = (rules.element as HTMLTextAreaElement).value
  const rows = source.split(/\r?\n/)
  const separator = rows.findIndex(row => row.trim() === '::=')
  if (separator < 0) return ''
  return rows.slice(separator + 1).join('\n').replace(/\n+$/, '')
}

function sourceProgramState(wrapper: ReturnType<typeof mount>): string {
  return (wrapper.get('[data-test="playground-initial-state"]').element as HTMLTextAreaElement).value
}

async function setProgramState(wrapper: ReturnType<typeof mount>, state: string): Promise<void> {
  await wrapper.get('[data-test="playground-initial-state"]').setValue(state)
  await flush()
}

async function mountApp(options?: Parameters<typeof mount>[1]): Promise<ReturnType<typeof mount>> {
  const wrapper = mount(App, options)
  await flush()
  await flush()
  return wrapper
}

describe('Go-WASM demo UI', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    document.body.innerHTML = ''
    window.localStorage.clear()
    mockedRunWithWorker.mockReset()
    if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = vi.fn()
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('renders the repository README as the site index with Monaco-backed thue fences', async () => {
    const wrapper = await mountApp()

    expect(wrapper.get('[data-test="readme-index"]').text()).toContain('Thue++')
    const topbar = wrapper.get('[data-test="site-topbar"]')
    expect(topbar.text()).toContain('Docs')
    expect(topbar.text()).toContain('Playground')
    expect(topbar.text()).toContain('Challenges')
    expect(topbar.text()).toContain('GitLab')
    expect(topbar.text()).toContain('Twitter')
    expect(topbar.get('nav a[href="/"]').attributes('aria-current')).toBe('page')
    expect(topbar.get('nav a[href="/playground"]').attributes('aria-current')).toBeUndefined()
    const challengeMenu = topbar.get('[data-test="site-nav-challenges"]')
    const challengeTrigger = challengeMenu.get('[data-slot="navigation-menu-trigger"]')
    expect(challengeTrigger.attributes('data-active')).toBeUndefined()
    await challengeTrigger.trigger('click')
    await flush()
    const challengeMenuLinks = wrapper.findAll('[data-slot="navigation-menu-content"] a')
    expect(challengeMenuLinks.map(link => link.attributes('href'))).toEqual(['/challenges', ...challenges.map(challenge => challenge.path)])
    expect(challengeMenuLinks.map(link => link.text())).toEqual(['All Challenges', ...challenges.map(challenge => challenge.title)])
    expect(topbar.find('a[href="https://gitlab.com/thuelang/thueplusplus"]').exists()).toBe(true)
    expect(topbar.find('a[href="https://x.com/thuelang"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Start with a string and rules that rewrite it')
    const thueBlocks = wrapper.findAll('[data-test="readme-thue-code"]')
    expect(thueBlocks.length).toBeGreaterThan(5)
    expect(thueBlocks[0].text()).toContain('^hello (?<name>[A-Za-z]+)$ ::= hi {{name}}')
    expect(thueBlocks[0].attributes('data-language')).toBe('thuepp')
    expect(thueBlocks[0].attributes('data-line-start')).toBe('1')
    const lispBlocks = wrapper.findAll('[data-test="readme-lisp-code"]')
    expect(lispBlocks.length).toBeGreaterThan(5)
    expect(lispBlocks[0].attributes('data-language')).toBe('clojure')
    expect(lispBlocks[0].text()).toContain('(add (mul 2 3) 4)')
    expect(wrapper.find('[data-test="run-demo"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('thuepp-readme-example')
    const toc = wrapper.get('[data-test="readme-toc"]')
    expect(toc.text()).toContain('Rules')
    expect(toc.text()).toContain('Lisp eval: explicit scope as sandbox')
    expect(toc.get('a[aria-current="location"]').attributes('href')).toBe('#thue')
    expect(getComputedStyle(wrapper.get('[data-test="readme-index"]').element).paddingBottom).toBeTruthy()
  })

  it('rejects invalid challenge manifests in browser data validation', () => {
    const validCase = {
      name: 'valid',
      resources: {
        stdin: { buffer: 'input\n' },
        stdout: { expected_output: 'ok\n' },
      },
      exit_code: 0,
    }

    const invalids: Array<[unknown, string]> = [
      [{ cases: [validCase], extra: true }, 'unknown top-level keys: extra'],
      [{ cases: [{ ...validCase, state: 'START' }] }, 'unknown keys: state'],
      [{ cases: [{ name: 'missing exit', resources: { stdout: { expected_output: 'ok\n' } } }] }, 'missing required keys: exit_code'],
      [{ cases: [{ ...validCase, resources: {} }] }, 'must contain non-empty resources object'],
      [{ cases: [{ ...validCase, resources: { file: { expected_output: 'nope\n' } } }] }, 'resource file expected_output is supported only for stdout or stderr'],
      [{ cases: [{ ...validCase, resources: { stdout: { expected_output: 42 } } }] }, 'resource stdout expected_output must be a string'],
    ]

    invalids.forEach(([manifest, message]) => {
      expect(() => validateChallengeTestManifest(manifest, 'bad.json')).toThrow(message)
    })
  })

  it('serves the challenges index route with pilot challenge links', async () => {
    window.history.pushState({}, '', '/challenges/')
    const wrapper = await mountApp()

    const topbar = wrapper.get('[data-test="site-topbar"]')
    const challengeTrigger = topbar.get('[data-test="site-nav-challenges"] [data-slot="navigation-menu-trigger"]')
    expect(challengeTrigger.attributes('data-active')).toBe('')
    await challengeTrigger.trigger('click')
    await flush()
    expect(wrapper.get('[data-slot="navigation-menu-content"] a[href="/challenges"]').attributes('aria-current')).toBe('page')
    expect(topbar.get('nav a[href="/"]').attributes('aria-current')).toBeUndefined()
    expect(wrapper.get('[data-test="challenge-02_fixed-greet"]').attributes('href')).toBe('/challenges/02_fixed-greet/')
    expect(wrapper.get('[data-test="challenge-03_binary-not"]').attributes('href')).toBe('/challenges/03_binary-not/')
    expect(wrapper.find('[data-test="challenges-workflow"]').exists()).toBe(false)
  })

  it('serves challenge solutions index and solution detail routes', async () => {
    const solutionId = '2026-05-29-direct-greeting'
    window.history.pushState({}, '', '/challenges/02_fixed-greet/solutions')
    const indexWrapper = await mountApp()

    const topbar = indexWrapper.get('[data-test="site-topbar"]')
    const challengeTrigger = topbar.get('[data-test="site-nav-challenges"] [data-slot="navigation-menu-trigger"]')
    expect(challengeTrigger.attributes('data-active')).toBe('')
    await challengeTrigger.trigger('click')
    await flush()
    expect(topbar.text()).toContain('Challenges')
    expect(indexWrapper.get('[data-slot="navigation-menu-content"] a[href="/challenges"]').attributes('aria-current')).toBeUndefined()
    expect(indexWrapper.get('[data-test="site-nav-challenge-02_fixed-greet"]').attributes('aria-current')).toBe('page')
    expect(indexWrapper.get('[data-test="challenge-solutions-02_fixed-greet"]').text()).toContain('Fixed Greet Solutions')
    expect(indexWrapper.get('[data-test="challenge-solutions-table"]').text()).toContain('Direct Greeting')
    expect(indexWrapper.get(`[data-test="solution-${solutionId}"]`).attributes('role')).toBe('link')
    expect(document.title).toBe('Fixed Greeting Solutions — Thue++ Challenge')
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe('https://thuelang.org/challenges/02_fixed-greet/solutions')

    window.history.pushState({}, '', `/challenges/02_fixed-greet/solutions/${solutionId}`)
    const detailWrapper = await mountApp()

    expect(detailWrapper.find(`[data-test="challenge-solution-${solutionId}"]`).exists()).toBe(true)
    expect(detailWrapper.find('[data-test="challenge-breadcrumbs"]').exists()).toBe(false)
    expect(detailWrapper.get('[data-test="challenge-solution-source"]').text()).toContain('title: Direct Greeting')
    expect(detailWrapper.get('[data-test="challenge-solution-source"]').text()).toContain('^START$ ::= OUT\\nEXIT')
    expect(detailWrapper.get('h2#solution-source').text()).toBe('Direct Greeting')
    expect(document.title).toBe('Direct Greeting — Fixed Greeting — Thue++ Challenge Solution')
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(`https://thuelang.org/challenges/02_fixed-greet/solutions/${solutionId}`)
  })

  it('runs challenge tests from the playground rules editor and shows expected output diffs', async () => {
    window.history.pushState({}, '', '/challenges/02_fixed-greet/')
    mockedRunWithWorker.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', evalCheckCount: 1, cumulativeStateBytes: 5, trace: [] })
    const wrapper = await mountApp()

    expect(wrapper.find('[data-test="challenge-playground-panel"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="challenge-test-default-state"]').text()).toContain('default state')
    expect(wrapper.find('[data-test="challenge-title-nav"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="challenge-solutions-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="challenge-breadcrumbs"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="playground-rules"]').element).toBeInstanceOf(HTMLTextAreaElement)
    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toContain('Goal: print exactly Hello, challenge!')
    expect(wrapper.get('[data-test="challenge-readme"]').text()).toContain('Write a Thue++ program')
    expect(wrapper.find('[data-test="challenge-load-hint"]').exists()).toBe(false)
    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).not.toContain('title:')
    expect(programState(wrapper)).toBe('START')
    expect(wrapper.find('[data-test="challenge-attempt"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="challenge-test-default-state"]').text()).not.toContain('"Hello, challenge!\\n"')
    expect(wrapper.find('[data-test="challenge-test-details-default-state"]').exists()).toBe(false)
    await wrapper.get('[data-test="challenge-test-toggle-default-state"]').trigger('click')
    await flush()
    expect(wrapper.get('[data-test="challenge-test-details-default-state"]').text()).toContain('fixture')
    expect(wrapper.get('[data-test="challenge-test-resource-fixture-expected-default-state-stdout"]').text()).toContain('Hello, challenge!')

    await wrapper.get('[data-test="playground-rules"]').setValue('^START$ ::= OUT')
    await wrapper.get('[data-test="challenge-auto-tests"]').setValue(true)
    await wrapper.get('[data-test="challenge-run-tests"]').trigger('click')
    await flush()
    await flush()

    expect(mockedRunWithWorker).toHaveBeenCalledWith(expect.objectContaining({
      sourcePath: 'challenges/02_fixed-greet/attempt.tpp',
      sourceText: '^START$ ::= OUT',
      input: 'START',
      stepLimit: 1,
      trace: true,
    }))
    const result = wrapper.get('[data-test="challenge-test-default-state"]')
    expect(wrapper.get('[data-test="challenge-results-summary"]').text()).toBe('0 passing · 1 failing')
    expect(result.attributes('data-status')).toBe('fail')
    expect(wrapper.get('[data-test="challenge-test-details-default-state"]').text()).toContain('fixture')
    expect(wrapper.get('[data-test="challenge-test-resource-diff-default-state-stdout"]').text()).toContain('stdout actual vs expected')
    expect(wrapper.find('[data-test="challenge-test-exit-code-diff-default-state"]').exists()).toBe(false)
    expect(result.text()).toContain('Hello, challenge!')
    expect(wrapper.get('[data-test="challenge-run-tests"]').text()).toContain('Run Tests Again')
    expect(wrapper.get('[data-test="challenge-attempt-rank"]').text()).toBe('Rank - of 3')
    expect(wrapper.get('[data-test="challenge-attempt-bytes-used"]').text()).toBe('5 bytes')
    expect(wrapper.get('[data-test="challenge-run-tests"]').text()).toContain('⌘↵')

    mockedRunWithWorker.mockClear()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true }))
    await flush()
    expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
  })

  it('persists challenge rules and initial state per challenge but falls back to hint when rules are empty', async () => {
    window.history.pushState({}, '', '/challenges/02_fixed-greet/')
    const firstWrapper = await mountApp()

    await firstWrapper.get('[data-test="playground-rules"]').setValue('^CUSTOM$ ::= OUT')
    await setProgramState(firstWrapper, 'CUSTOM')
    expect(sourceProgramState(firstWrapper)).toBe('CUSTOM')
    firstWrapper.unmount()

    const restoredWrapper = await mountApp()
    expect((restoredWrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toBe('^CUSTOM$ ::= OUT')
    expect(sourceProgramState(restoredWrapper)).toBe('CUSTOM')
    restoredWrapper.unmount()

    window.history.pushState({}, '', '/challenges/03_binary-not/')
    const otherChallengeWrapper = await mountApp()
    expect((otherChallengeWrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).not.toBe('^CUSTOM$ ::= OUT')
    otherChallengeWrapper.unmount()

    window.history.pushState({}, '', '/challenges/02_fixed-greet/')
    const clearWrapper = await mountApp()
    await clearWrapper.get('[data-test="playground-rules"]').setValue('')
    await flush()
    clearWrapper.unmount()

    const hintWrapper = await mountApp()
    expect((hintWrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toContain('Goal: print exactly Hello, challenge!')
    expect(sourceProgramState(hintWrapper)).toBe('START')
  })

  it('shows challenge exit-code mismatch diffs separately from output diffs', async () => {
    window.history.pushState({}, '', '/challenges/02_fixed-greet/')
    mockedRunWithWorker.mockResolvedValue({
      exitCode: 1,
      stdout: 'Hello, challenge!\n',
      stderr: '',
      resourceLogs: [{ name: 'stdout', reads: [], writes: ['Hello, challenge!\n'], errors: [], outputText: 'Hello, challenge!\n' }],
    })
    const wrapper = await mountApp()

    await wrapper.get('[data-test="playground-rules"]').setValue('^START$ ::= OUT\\n^OUT$ ::> stdout Hello, challenge!\\n^OUT$ ::- 1')
    await wrapper.get('[data-test="challenge-auto-tests"]').setValue(true)
    await wrapper.get('[data-test="challenge-run-tests"]').trigger('click')
    await flush()
    await flush()

    const result = wrapper.get('[data-test="challenge-test-default-state"]')
    expect(wrapper.get('[data-test="challenge-results-summary"]').text()).toBe('0 passing · 1 failing')
    expect(result.attributes('data-status')).toBe('fail')
    expect(wrapper.find('[data-test="challenge-test-resource-diff-default-state-stdout"]').exists()).toBe(false)
    const exitDiff = wrapper.get('[data-test="challenge-test-exit-code-diff-default-state"]')
    expect(exitDiff.text()).toContain('exit code actual vs expected')
    expect(exitDiff.text()).toContain('1')
    expect(exitDiff.text()).toContain('0')
  })

  it('fails challenge tests loudly when the worker omits exitCode', async () => {
    window.history.pushState({}, '', '/challenges/02_fixed-greet/')
    mockedRunWithWorker.mockResolvedValue({
      stdout: 'Hello, challenge!\n',
      stderr: '',
      resourceLogs: [{ name: 'stdout', reads: [], writes: ['Hello, challenge!\n'], errors: [], outputText: 'Hello, challenge!\n' }],
    })
    const wrapper = await mountApp()

    await wrapper.get('[data-test="playground-rules"]').setValue('^START$ ::= OUT\\n^OUT$ ::> stdout Hello, challenge!\\n^OUT$ ::- 0')
    await wrapper.get('[data-test="challenge-auto-tests"]').setValue(true)
    await wrapper.get('[data-test="challenge-run-tests"]').trigger('click')
    await flush()
    await flush()

    const result = wrapper.get('[data-test="challenge-test-default-state"]')
    expect(wrapper.get('[data-test="challenge-results-summary"]').text()).toBe('0 passing · 1 failing')
    expect(result.attributes('data-status')).toBe('fail')
    expect(wrapper.get('[data-test="challenge-test-error-default-state"]').text()).toContain('worker did not return exitCode')
    const exitDiff = wrapper.get('[data-test="challenge-test-exit-code-diff-default-state"]')
    expect(exitDiff.text()).toContain('exit code actual vs expected')
    expect(exitDiff.text()).toContain('0')
  })

  it('runs challenge tests visibly through playground play controls when auto is off', async () => {
    vi.useFakeTimers()
    try {
      window.history.pushState({}, '', '/challenges/02_fixed-greet/')
      mockedRunWithWorker
        .mockResolvedValueOnce({
          exitCode: undefined,
          stdout: '',
          stderr: '',
          state: 'MID',
          evalCheckCount: 2,
          cumulativeStateBytes: 5,
          resourceLogs: [],
          trace: [{
            step: 1,
            ruleIndex: 0,
            sourcePath: 'challenges/02_fixed-greet/attempt.tpp',
            lineNumber: 1,
            operator: '::=',
            lhs: '^START$',
            matchStart: 0,
            matchEnd: 5,
            groups: {},
            stateBefore: 'START',
            replacement: 'MID',
            stateAfter: 'MID',
          }],
        })
        .mockResolvedValueOnce({
          exitCode: 0,
          stdout: 'Hello, challenge!\n',
          stderr: '',
          state: '',
          evalCheckCount: 5,
          cumulativeStateBytes: 3,
          resourceLogs: [{ name: 'stdout', reads: [], writes: ['Hello, challenge!\n'], errors: [], outputText: 'Hello, challenge!\n' }],
          trace: [],
        })

      const wrapper = await mountApp()
      await wrapper.get('[data-test="playground-speed-1"]').trigger('click')
      await wrapper.get('[data-test="playground-step-limit-1000"]').trigger('click')
      await wrapper.get('[data-test="challenge-run-tests"]').trigger('click')
      await flush()

      expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
      expect(mockedRunWithWorker.mock.calls[0][0]).toEqual(expect.objectContaining({
        input: 'START',
        evalLimit: 1000,
        stepLimit: 1,
        trace: true,
      }))
      expect(programState(wrapper)).toBe('MID')
      expect(wrapper.get('[data-test="challenge-run-tests"]').text()).toContain('Running…')

      vi.advanceTimersByTime(999)
      await flush()
      expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)

      vi.advanceTimersByTime(1)
      await flush()
      await flush()
      expect(mockedRunWithWorker).toHaveBeenCalledTimes(2)
      expect(wrapper.find('[data-test="challenge-tests-card"]').exists()).toBe(false)
      expect(wrapper.get('[data-test="challenge-pass-card"]').text()).toContain('Success, all tests passed.')
      expect(wrapper.get('[data-test="challenge-pass-card"]').classes()).toContain('challenge-pass-card')
      expect(wrapper.get('[data-test="challenge-success-place"]').text()).toBe('1st place')
      expect(wrapper.get('[data-test="challenge-pass-card"]').text()).toContain('Leader board')
      expect(wrapper.get('[data-test="challenge-leaderboard-current"]').text()).toContain('This solution')
      expect(wrapper.get('[data-test="challenge-leaderboard-current"]').text()).toContain('by You')
      expect(wrapper.get('[data-test="challenge-leaderboard-current"]').text()).toContain('8 bytes')
      expect(wrapper.get('[data-test="challenge-leaderboard-solution-2026-05-29-direct-greeting"]').attributes('href')).toBe('/challenges/02_fixed-greet/solutions/2026-05-29-direct-greeting')
      expect(wrapper.find('[data-test="challenge-run-tests"]').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('auto-runs challenge tests on debounced rule changes and restarts an in-flight run', async () => {
    vi.useFakeTimers()
    try {
      window.history.pushState({}, '', '/challenges/02_fixed-greet/')
      const firstRun = deferred<never>()
      const aborts: AbortSignal[] = []
      mockedRunWithWorker
        .mockImplementationOnce(request => {
          aborts.push(request.signal as AbortSignal)
          return new Promise((resolve, reject) => {
            request.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')), { once: true })
            firstRun.promise.then(resolve, reject)
          })
        })
        .mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '' })

      const wrapper = await mountApp()
      await wrapper.get('[data-test="challenge-auto-tests"]').setValue(true)
      await wrapper.get('[data-test="playground-rules"]').setValue('^START$ ::= FIRST')
      vi.advanceTimersByTime(299)
      await flush()
      expect(mockedRunWithWorker).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      await flush()
      expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
      expect(mockedRunWithWorker.mock.calls[0][0]).toEqual(expect.objectContaining({
        sourceText: '^START$ ::= FIRST',
        sourcePath: 'challenges/02_fixed-greet/attempt.tpp',
        input: 'START',
        stepLimit: 1,
        trace: true,
      }))
      expect(wrapper.get('[data-test="challenge-run-tests"]').text()).toContain('Running…')

      await wrapper.get('[data-test="playground-rules"]').setValue('^START$ ::= SECOND')
      vi.advanceTimersByTime(300)
      await flush()

      expect(aborts[0].aborted).toBe(true)
      expect(mockedRunWithWorker).toHaveBeenCalledTimes(2)
      expect(mockedRunWithWorker.mock.calls[1][0]).toEqual(expect.objectContaining({
        sourceText: '^START$ ::= SECOND',
        input: 'START',
        stepLimit: 1,
        trace: true,
      }))
      await flush()
      await flush()
      expect(wrapper.get('[data-test="challenge-run-tests"]').text()).toContain('Run Tests Again')
    } finally {
      vi.useRealTimers()
    }
  })

  it('persists the challenge auto-test checkbox preference', async () => {
    window.history.pushState({}, '', '/challenges/02_fixed-greet/')
    window.localStorage.setItem('thuepp.challengeTestsAuto', 'true')
    const wrapper = await mountApp()
    const checkbox = wrapper.get('[data-test="challenge-auto-tests"]').element as HTMLInputElement

    expect(checkbox.checked).toBe(true)
    await wrapper.get('[data-test="challenge-auto-tests"]').setValue(false)
    expect(window.localStorage.getItem('thuepp.challengeTestsAuto')).toBe('false')
  })

  it('auto-runs challenge tests with the embedded source state as fallback input', async () => {
    vi.useFakeTimers()
    try {
      window.history.pushState({}, '', '/challenges/02_fixed-greet/')
      mockedRunWithWorker.mockImplementation(async request => ({
        exitCode: request.input === 'START' ? 0 : 1,
        stdout: request.input === 'START' ? 'Hello, challenge!\n' : '',
        stderr: '',
        resourceLogs: [{ name: 'stdout', reads: [], writes: request.input === 'START' ? ['Hello, challenge!\n'] : [], errors: [], outputText: request.input === 'START' ? 'Hello, challenge!\n' : '' }],
      }))
      const wrapper = await mountApp()
      await wrapper.get('[data-test="challenge-auto-tests"]').setValue(true)
      await wrapper.get('[data-test="playground-rules"]').setValue('^START$ ::= OUT\\nEXIT\nOUT ::> stdout Hello, challenge!\\n\n^EXIT$ ::- 0\n::=\nSTART')
      vi.advanceTimersByTime(300)
      await flush()
      await flush()
      await flush()
      expect(mockedRunWithWorker).toHaveBeenCalledWith(expect.objectContaining({
        sourceText: '^START$ ::= OUT\\nEXIT\nOUT ::> stdout Hello, challenge!\\n\n^EXIT$ ::- 0\n',
        input: 'START',
      }))
      expect(wrapper.find('[data-test="challenge-tests-card"]').exists()).toBe(false)
      expect(wrapper.get('[data-test="challenge-pass-card"]').text()).toContain('Success, all tests passed.')
      expect(wrapper.get('[data-test="challenge-success-place"]').text()).toBe('1st place')
      expect(wrapper.get('[data-test="challenge-pass-card"]').classes()).toContain('challenge-pass-card')
    } finally {
      vi.useRealTimers()
    }
  })

  it('auto-runs challenge tests after editing Program State without changing runnable rules', async () => {
    vi.useFakeTimers()
    try {
      window.history.pushState({}, '', '/challenges/02_fixed-greet/')
      mockedRunWithWorker.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', resourceLogs: [] })
      const wrapper = await mountApp()
      await wrapper.get('[data-test="challenge-auto-tests"]').setValue(true)
      await wrapper.get('[data-test="playground-rules"]').setValue('^START$ ::= OUT\n::=\nSTART')
      vi.advanceTimersByTime(300)
      await flush()
      expect(mockedRunWithWorker).toHaveBeenCalledWith(expect.objectContaining({
        sourceText: '^START$ ::= OUT\n',
        input: 'START',
      }))

      mockedRunWithWorker.mockClear()
      await wrapper.get('[data-test="playground-initial-state"]').setValue('NEXT')
      vi.advanceTimersByTime(300)
      await flush()
      expect(mockedRunWithWorker).toHaveBeenCalledWith(expect.objectContaining({
        sourceText: '^START$ ::= OUT\n',
        input: 'NEXT',
      }))
      expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toBe('^START$ ::= OUT\n')
    } finally {
      vi.useRealTimers()
    }
  })

  it('places the challenge panel before rules, source state, resources, and state history in the full playground', async () => {
    window.history.pushState({}, '', '/challenges/02_fixed-greet/')
    const wrapper = await mountApp()

    const surface = wrapper.get('[data-test="playground-full-surface"]')
    const challengePanel = wrapper.get('[data-test="challenge-playground-panel"]')
    const rulesEditor = wrapper.get('[data-test="playground-rules"]')
    const sourceState = wrapper.get('[data-test="playground-initial-state"]')
    const resources = wrapper.get('[data-test="resource-sections"]')
    const stateHistory = wrapper.get('[data-test="playground-diffs"]')

    expect(surface.element.contains(challengePanel.element)).toBe(true)
    expect(surface.element.contains(rulesEditor.element)).toBe(true)
    expect(challengePanel.element.compareDocumentPosition(rulesEditor.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(rulesEditor.element.compareDocumentPosition(sourceState.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(sourceState.element.compareDocumentPosition(resources.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(resources.element.compareDocumentPosition(stateHistory.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(surface.text()).toContain('Fixed Greeting')
    expect(surface.text()).toContain('program rules')
    expect(surface.text()).toContain('initial state')
    expect(surface.text()).toContain('current state')
    expect(surface.text()).toContain('state history')
    expect(surface.text()).toContain('resources')
  })

  it('keeps the generic playground free of the challenge panel', async () => {
    window.history.pushState({}, '', '/playground')
    const wrapper = await mountApp()

    expect(wrapper.find('[data-test="challenge-playground-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="challenge-run-tests"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="challenge-test-default-state"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="playground-full-surface"]').text()).toContain('program rules')
    expect(wrapper.get('[data-test="playground-rules"]').element).toBeInstanceOf(HTMLTextAreaElement)
  })

  it('passes stdin buffers through resource-shaped challenge tests', async () => {
    window.history.pushState({}, '', '/challenges/03_binary-not/')
    mockedRunWithWorker.mockImplementation(async request => {
      const stdin = request.input
      return {
        exitCode: 0,
        stdout: '',
        stderr: '',
        resourceLogs: [
          { name: 'stdin', reads: [stdin ?? ''], writes: [], errors: [], outputText: '', remainingInputText: '' },
          { name: 'stdout', reads: [], writes: [stdin === '0\n' ? '1\n' : '0\n'], errors: [], outputText: stdin === '0\n' ? '1\n' : '0\n' },
        ],
      }
    })
    const wrapper = await mountApp()

    expect(wrapper.find('[data-test="challenge-title-nav"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="challenge-test-zero-to-one"]').text()).toContain('zero to one')
    expect(wrapper.get('[data-test="challenge-test-one-to-zero"]').text()).toContain('one to zero')

    await wrapper.get('[data-test="challenge-auto-tests"]').setValue(true)
    await wrapper.get('[data-test="challenge-run-tests"]').trigger('click')
    await flush()
    await flush()

    expect(mockedRunWithWorker).toHaveBeenCalledTimes(2)
    expect(mockedRunWithWorker.mock.calls[0][0].input).toBe('0\n')
    expect(mockedRunWithWorker.mock.calls[1][0].input).toBe('1\n')
    expect(mockedRunWithWorker.mock.calls[0][0]).toEqual(expect.objectContaining({ stepLimit: 1, trace: true }))
    expect(wrapper.find('[data-test="challenge-tests-card"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="challenge-pass-card"]').text()).toContain('Success, all tests passed.')
    expect(wrapper.get('[data-test="challenge-success-place"]').text()).toBe('1st place')
    expect(wrapper.get('[data-test="challenge-pass-card"]').classes()).toContain('challenge-pass-card')
    expect(wrapper.find('[data-test="challenge-next-cta"]').exists()).toBe(false)
  })

  it('shows resource-shaped challenge failures as stacked expected and actual diffs', async () => {
    window.history.pushState({}, '', '/challenges/03_binary-not/')
    mockedRunWithWorker.mockResolvedValue({ exitCode: 0, stdout: 'wrong\n', stderr: '' })
    const wrapper = await mountApp()
    const rules = wrapper.get('[data-test="playground-rules"]')
    await rules.setValue('0 ::= 1')

    await wrapper.get('[data-test="challenge-auto-tests"]').setValue(true)
    await wrapper.get('[data-test="challenge-run-tests"]').trigger('click')
    await flush()
    await flush()

    expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toBe('0 ::= 1')
    expect(wrapper.find('[data-test="challenge-debug-zero-to-one"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="challenge-test-zero-to-one"]').attributes('data-status')).toBe('fail')
    expect(wrapper.get('[data-test="challenge-test-resource-input-zero-to-one-stdin"]').text()).toContain('0')
    const diff = wrapper.get('[data-test="challenge-test-resource-diff-zero-to-one-stdout"]')
    expect(diff.text()).toContain('stdout actual vs expected')
    const actual = wrapper.get('[data-test="challenge-test-resource-actual-zero-to-one-stdout"]')
    const expected = wrapper.get('[data-test="challenge-test-resource-expected-zero-to-one-stdout"]')
    expect(actual.text()).toContain('wrong')
    expect(actual.classes()).toContain('removed')
    expect(expected.text()).toContain('1')
    expect(expected.classes()).toContain('added')
    expect(diff.element.compareDocumentPosition(actual.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(actual.element.compareDocumentPosition(expected.element) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('trims leading and trailing whitespace before comparing challenge resource output', async () => {
    mockedRunWithWorker.mockResolvedValue({ exitCode: 0, stdout: '  ok\n', stderr: '  [1] user line\n' })
    const results = await runChallengeTests({
      slug: 'stderr-policy',
      title: 'Stderr Policy',
      summary: '',
      readme: '',
      solutionsReadme: '',
      path: 'challenges/stderr-policy/readme.md',
      solutionsPath: 'challenges/stderr-policy/solutions',
      bestSolutionId: null,
      tests: [{
        name: 'stderr prefix',
        resources: { stdout: { expected_output: '\nok  ' }, stderr: { expected_output: '[1] user line\n' } },
        exit_code: 0,
      }],
      solutions: [],
    }, '::= START')

    expect(results).toHaveLength(1)
    expect(results[0].passed).toBe(true)
    expect(results[0].resources).toEqual([
      {
        name: 'stdout',
        expected: 'ok',
        actual: 'ok',
        passed: true,
      },
      {
        name: 'stderr',
        expected: '[1] user line',
        actual: '[1] user line',
        passed: true,
      },
    ])
  })

  it('omits solution tables from solve-first challenge playground pages', async () => {
    window.history.pushState({}, '', '/challenges/02_fixed-greet/')
    const wrapper = await mountApp()

    expect(wrapper.find('[data-test="challenge-solutions-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="challenge-solutions-table"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="challenge-title-nav"]').exists()).toBe(false)
  })

  it('serves unknown challenge slugs as challenge not found pages', async () => {
    window.history.pushState({}, '', '/challenges/missing-challenge/')
    const wrapper = await mountApp()

    expect(wrapper.get('[data-test="challenge-not-found"]').text()).toContain('missing-challenge')
    const challengeTrigger = wrapper.get('[data-test="site-topbar"] [data-test="site-nav-challenges"] [data-slot="navigation-menu-trigger"]')
    expect(challengeTrigger.attributes('data-active')).toBe('')
    await challengeTrigger.trigger('click')
    await flush()
    expect(wrapper.get('[data-slot="navigation-menu-content"] a[href="/challenges"]').attributes('aria-current')).toBeUndefined()
  })

  it('serves a resizable playground route with pinned stdio resources and no reset action', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp()

    expect(wrapper.find('[data-test="playground-header"]').exists()).toBe(false)
    const topbar = wrapper.get('[data-test="site-topbar"]')
    expect(topbar.get('nav a[href="/playground"]').attributes('aria-current')).toBe('page')
    expect(topbar.get('nav a[href="/"]').attributes('aria-current')).toBeUndefined()
    expect(topbar.get('a[href="https://x.com/thuelang"]').text()).toBe('Twitter')
    expect(wrapper.text()).toContain('state')
    expect(wrapper.get('[data-test="playground-rules"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="playground-rules"]').attributes('wrap')).toBe('off')
    expect(wrapper.find('[data-test="playground-state"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="playground-step"]').attributes('aria-label')).toBe('Step forward')
    expect(wrapper.get('[data-test="resource-sections"]').element.tagName).toBe('SECTION')
    expect(wrapper.get('[data-test="resource-sections"]').attributes('data-slot')).toBeUndefined()
    expect(wrapper.get('[data-test="playground-status"]').attributes('data-slot')).toBe('badge')
    expect(wrapper.get('[data-test="playground-status"]').element.closest('.playground-rules-controls-row')).not.toBeNull()
    expect(wrapper.get('[data-test="playground-status"]').element.closest('.playground-resources-pane')).toBeNull()
    expect(wrapper.get('[data-test="playground-reset"]').attributes('aria-label')).toBe('Reset to first state')
    expect((wrapper.get('[data-test="playground-reset"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-test="playground-run"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="playground-auto"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="playground-undo"]').attributes('aria-label')).toBe('Step back')
    expect(wrapper.get('[data-test="playground-step"]').text()).toBe('')
    expect(wrapper.get('[data-test="playground-continue"]').attributes('aria-label')).toBe('Play')
    expect(wrapper.get('[data-test="playground-end"]').text()).toBe('')
    expect(wrapper.get('[data-test="playground-pause"]').attributes('aria-label')).toBe('Pause')
    expect((wrapper.get('[data-test="playground-pause"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-test="playground-continue-speed"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="playground-speed-1"]').text()).toBe('1/s')
    expect(wrapper.get('[data-test="playground-speed-10"]').text()).toBe('10/s')
    expect(wrapper.get('[data-test="playground-speed-100"]').text()).toBe('100/s')
    expect(wrapper.get('[data-test="playground-speed-10"]').attributes('data-selected')).toBe('true')
    expect(wrapper.get('[data-test="playground-step-limit"]').text()).toContain('step limit')
    expect(wrapper.get('[data-test="playground-step-limit-1000"]').text()).toBe('1000')
    expect(wrapper.get('[data-test="playground-step-limit-10000"]').text()).toBe('10000')
    expect(wrapper.get('[data-test="playground-step-limit-100000"]').text()).toBe('100000')
    expect(wrapper.get('[data-test="playground-step-limit-10000"]').attributes('data-selected')).toBe('true')
    expect(wrapper.find('[data-test="stdio-panel"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-slot="resizable-panel"]').length).toBe(7)
    expect(wrapper.findAll('[data-slot="resizable-handle"]').length).toBe(4)
    expect(wrapper.get('[data-test="playground-rules-state-split"]').attributes('data-orientation')).toBe('vertical')
    expect(wrapper.get('[data-test="playground-rules-state-handle"]').attributes('data-orientation')).toBe('vertical')
    expect(wrapper.get('[data-test="playground-current-history-split"]').attributes('data-orientation')).toBe('vertical')
    expect(wrapper.get('[data-test="playground-current-history-handle"]').attributes('data-orientation')).toBe('vertical')
    expect(wrapper.get('[data-test="resource-section-stdin"]').text()).toContain('stdin')
    expect(wrapper.get('[data-test="resource-section-stdout"]').text()).toContain('stdout')
    expect(wrapper.get('[data-test="resource-section-stderr"]').text()).toContain('stderr')
    expect(wrapper.get('[data-test="resource-input-stdin"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="resource-output-stderr"]').element.tagName).toBe('TEXTAREA')
    const loadedSource = (wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value
    expect(loadedSource).toContain('Hello, World')
    expect(loadedSource).not.toContain('\n::=\nSTART\n')
    expect(wrapper.get('[data-test="playground-initial-state-pane"]').text()).toContain('initial state')
    expect(sourceProgramState(wrapper)).toBe('START')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Hello, World!\n',
      stderr: '',
      state: '',
      resourceLogs: [
        { name: 'stdin', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: ['Hello, World!\n'], errors: [], remainingInputText: '', outputText: 'Hello, World!\n' },
        { name: 'stderr', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
      ],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()
    expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
    expect(mockedRunWithWorker.mock.calls[0][0].sourceText).not.toContain('\n::=\nSTART\n')
    expect(mockedRunWithWorker.mock.calls[0][0].input).toBe('START')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Hello, World!\n')
    expect(sourceProgramState(wrapper)).toBe('START')
  })

  it('uses the visible empty state instead of falling back to embedded source state', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp()
    await setProgramState(wrapper, '')

    mockedRunWithWorker.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', state: '', resourceLogs: [] })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
    expect(mockedRunWithWorker.mock.calls[0][0].sourceText).not.toContain('\n::=\nSTART\n')
    expect(mockedRunWithWorker.mock.calls[0][0].input).toBe('')
  })

  it('seeds Initial State from pasted full source while keeping Program Rules rules-only', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp()
    await setProgramState(wrapper, 'stale override')
    const pastedSource = '^aaab$ ::= done\n::=\naaab\n'

    await wrapper.get('[data-test="playground-rules"]').setValue(pastedSource)
    await wrapper.get('[data-test="playground-rules"]').trigger('paste')

    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toBe('^aaab$ ::= done\n')
    expect(sourceProgramState(wrapper)).toBe('aaab')
    expect(programState(wrapper)).toBe('aaab')

    mockedRunWithWorker.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', state: 'done', resourceLogs: [] })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls.at(-1)?.[0].sourceText).toBe('^aaab$ ::= done\n')
    expect(mockedRunWithWorker.mock.calls.at(-1)?.[0].input).toBe('aaab')
  })

  it('updates the initial state by editing the state section inside Program Rules', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp()

    await setProgramState(wrapper, 'custom state')

    expect(programState(wrapper)).toBe('custom state')
    expect(sourceProgramState(wrapper)).toBe('custom state')
    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).not.toContain('\n::=\ncustom state')
  })

  it('keeps Program Rules and Program State in two-way sync around the source separator', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp()

    await wrapper.get('[data-test="playground-rules"]').setValue('^A$ ::= B\n::=\nA')
    await flush()
    expect(sourceProgramState(wrapper)).toBe('A')

    await wrapper.get('[data-test="playground-rules"]').setValue('^A$ ::= B\n::=\nB')
    await flush()
    expect(sourceProgramState(wrapper)).toBe('B')

    await wrapper.get('[data-test="playground-initial-state"]').setValue('C')
    await flush()
    const source = (wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value
    expect(source).toBe('^A$ ::= B\n')
    expect(programState(wrapper)).toBe('C')
  })

  it('appends a state separator when editing Program State for source without one', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hash-data/source-hash-rule.tpp')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^A$ ::= B')

    await wrapper.get('[data-test="playground-initial-state"]').setValue('A')
    await flush()

    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toBe('^A$ ::= B')
    expect(programState(wrapper)).toBe('A')
  })

  it('loads hash-prefixed source rows exactly and keeps state empty without a separator heuristic', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hash-data/source-hash-rule.tpp')
    const wrapper = await mountApp()

    const loadedSource = (wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value
    expect(loadedSource).toContain('#x ::= y')
    expect(loadedSource).toContain('^y$ ::> stdout source-row-rule\\n')
    expect(programState(wrapper)).toBe('')
  })

  it('discovers resources from hash-prefixed rule rows', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('#read ::< @VALUE custom\n#done ::> custom done\n')

    expect(wrapper.get('[data-test="resource-section-custom"]').text()).toContain('custom')
  })

  it('steps one rule and updates State as the current state', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle\n^middle$ ::= done')
    await setProgramState(wrapper, 'start')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'middle',
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.tpp', lineNumber: 1, operator: '::=', lhs: '^start$', matchStart: 0, matchEnd: 5, groups: {}, stateBefore: 'start', replacement: 'middle', stateAfter: 'middle' }],
      resourceLogs: [],
    })

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[0][0].stepLimit).toBe(1)
    expect(mockedRunWithWorker.mock.calls[0][0].trace).toBe(true)
    expect(programState(wrapper)).toBe('middle')
    expect(sourceProgramState(wrapper)).toBe('start')
    expect(wrapper.get('[data-test="playground-rules"]').attributes('data-current-match-line')).toBe('1')
    expect(wrapper.get('[data-test="playground-diffs"]').text()).toContain('^start$ ::= middle')
    expect(wrapper.get('[data-test="playground-diffs"]').text()).toContain('start')
    expect(wrapper.get('[data-test="playground-diffs"]').text()).toContain('middle')
    expect(wrapper.find('.state-diff-sign').exists()).toBe(false)
    expect(wrapper.get('[data-test="playground-diffs"]').text()).not.toContain('examples/hello/hello.tpp')
    expect(wrapper.find('.state-diff-char-removed').exists()).toBe(true)
    expect(wrapper.find('.state-diff-char-added').exists()).toBe(true)
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('stepped')
  })

  it('copies Current State without mutating Initial State', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle')
    await setProgramState(wrapper, 'start')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'middle',
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.tpp', lineNumber: 1, operator: '::=', lhs: '^start$', matchStart: 0, matchEnd: 5, groups: {}, stateBefore: 'start', replacement: 'middle', stateAfter: 'middle' }],
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    await wrapper.get('[data-test="copy-current-state"]').trigger('click')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('middle')
    expect((wrapper.get('[data-test="playground-current-state"]').element as HTMLTextAreaElement).value).toBe('middle')
    expect(sourceProgramState(wrapper)).toBe('start')
  })

  it('shows failed step exit status and stderr instead of reporting a successful step', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/builtin/builtin.tpp')
    const wrapper = await mountApp()
    await setProgramState(wrapper, 'div:1,0')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: "Builtin 'div' division by zero",
      errors: "Builtin 'div' division by zero",
      state: 'div:1,0',
      trace: [{ step: 1, ruleIndex: 3, sourcePath: 'examples/builtin/builtin.tpp', lineNumber: 6, operator: '::!', lhs: '^div:(?<a>$N),(?<b>$N)$', matchStart: 0, matchEnd: 7, groups: { a: '1', b: '0' }, stateBefore: 'div:1,0', replacement: '', stateAfter: 'div:1,0', error: "Builtin 'div' division by zero" }],
      resourceLogs: [],
    })

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    const diffs = wrapper.get('[data-test="playground-diffs"]')
    const entries = wrapper.findAll('.state-diff-row')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('exited 1')
    expect(wrapper.get('[data-test="resource-output-stderr"]').element).toHaveProperty('value', "Builtin 'div' division by zero")
    expect(diffs.text()).toContain('Builtin \'div\' division by zero')
    expect(entries[1].find('.state-diff-error').exists()).toBe(true)
    expect(entries[1].find('.state-diff-line.removed').exists()).toBe(false)
    expect(entries[1].find('.state-diff-line.added').exists()).toBe(false)
    expect((wrapper.get('[data-test="playground-step"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-test="playground-continue"]').exists()).toBe(false)
    expect((wrapper.get('[data-test="playground-restart"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-end"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-test="playground-reset"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-undo"]').element as HTMLButtonElement).disabled).toBe(false)
    expect(wrapper.get('[data-test="playground-step"]').attributes('title')).toBe('Step forward')
    expect(wrapper.get('[data-test="playground-restart"]').attributes('title')).toBe('Restart')
    expect(wrapper.get('[data-test="playground-end"]').attributes('title')).toBe('End without rendering intermediate steps (limit 10000 steps)')

    await setProgramState(wrapper, 'div:2,1')
    expect((wrapper.get('[data-test="playground-step"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-continue"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-end"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-reset"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-test="playground-undo"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows parse-time step errors in state history when no trace is available', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^(?<a>\\d+),(?<b>\\d+)$ ::! nope a b')
    await setProgramState(wrapper, '1,2')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: "Line 1: Unknown builtin 'nope'",
      errors: "Line 1: Unknown builtin 'nope'",
      resourceLogs: [],
    })

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    const diffs = wrapper.get('[data-test="playground-diffs"]')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('exited 1')
    expect(wrapper.get('[data-test="resource-output-stderr"]').element).toHaveProperty('value', "Line 1: Unknown builtin 'nope'")
    expect(diffs.text()).toContain('^(?<a>\\d+),(?<b>\\d+)$ ::! nope a b')
    expect(diffs.text()).toContain("Line 1: Unknown builtin 'nope'")
    expect(diffs.find('.state-diff-error').exists()).toBe(true)
  })

  it('shows matched rules in state history even when state does not change', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^done$ ::> stdout ok\\n')
    await setProgramState(wrapper, 'done')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'ok\n',
      stderr: '',
      state: 'done',
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.tpp', lineNumber: 1, operator: '::>', lhs: '^done$', matchStart: 0, matchEnd: 4, groups: {}, stateBefore: 'done', replacement: '', stateAfter: 'done' }],
      resourceLogs: [],
    })

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    const diffs = wrapper.get('[data-test="playground-diffs"]')
    expect(diffs.text()).toContain('^done$ ::> stdout ok\\n')
    expect(diffs.text()).toContain('matched without state change')
  })

  it('shows compact changed context for long state diffs below State', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle')
    const before = `${'a'.repeat(80)}LOOK<add|mul=VPRIM<mul>;add=VPRIM<add>;|K>${'z'.repeat(80)}`
    const after = `${'a'.repeat(80)}FOUND<VPRIM<add>|K>${'z'.repeat(80)}`

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: after,
      trace: [{ step: 4, ruleIndex: 7, sourcePath: 'examples/hello/hello.tpp', lineNumber: 1, operator: '::=', lhs: '^start$', matchStart: 80, matchEnd: 130, groups: {}, stateBefore: before, replacement: 'FOUND<VPRIM<add>|K>', stateAfter: after }],
      resourceLogs: [],
    })

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    const diffs = wrapper.get('[data-test="playground-diffs"]')
    expect(diffs.text()).toContain('^start$ ::= middle')
    expect(diffs.text()).toContain('…')
    expect(diffs.text()).toContain('LOOK<add')
    expect(diffs.text()).toContain('FOUND<VPRIM<add>|K>')
    expect(diffs.text()).not.toContain('examples/hello/hello.tpp')
    expect(diffs.text()).not.toContain('a'.repeat(80))
    expect(diffs.text()).not.toContain('z'.repeat(80))
  })

  it('places newer step diffs below older diffs', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle\n^middle$ ::= done')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'middle',
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.tpp', lineNumber: 1, operator: '::=', lhs: '^start$', matchStart: 0, matchEnd: 5, groups: {}, stateBefore: 'start', replacement: 'middle', stateAfter: 'middle' }],
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'done',
      trace: [{ step: 2, ruleIndex: 1, sourcePath: 'examples/hello/hello.tpp', lineNumber: 2, operator: '::=', lhs: '^middle$', matchStart: 0, matchEnd: 6, groups: {}, stateBefore: 'middle', replacement: 'done', stateAfter: 'done' }],
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    const entries = wrapper.findAll('.state-diff-row')
    expect(entries).toHaveLength(3)
    expect(entries[0].text()).toContain('initial state')
    expect(entries[1].text()).toContain('^start$ ::= middle')
    expect(entries[2].text()).toContain('^middle$ ::= done')
    expect(mockedRunWithWorker.mock.calls[0][0].stepLimit).toBe(1)
  })

  it('ends a run in one worker call and appends only a collapsed final history row', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle\n^middle$ ::= done')
    await setProgramState(wrapper, 'start')

    await wrapper.get('[data-test="playground-step-limit-100000"]').trigger('click')
    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'done',
      evalCheckCount: 3,
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-end"]').trigger('click')
    await flush()

    const request = mockedRunWithWorker.mock.calls[0][0]
    expect(request.stepLimit).toBe(100000)
    expect(request.evalLimit).toBe(200000)
    expect(request.trace).toBe(false)
    expect(programState(wrapper)).toBe('done')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('exited 0')
    const entries = wrapper.findAll('.state-diff-row')
    expect(entries).toHaveLength(2)
    expect(entries[1].text()).toContain('end: skipped intermediate steps')
    expect(entries[1].text()).toContain('start')
    expect(entries[1].text()).toContain('done')
    expect(entries[1].find('.state-diff-sign').exists()).toBe(false)
    expect(wrapper.get('[data-test="playground-diffs"]').text()).not.toContain('^start$ ::= middle')
    expect(wrapper.get('[data-test="playground-rules"]').attributes('data-current-match-line')).toBeUndefined()
  })

  it('uses media controls for play and stop', async () => {
    vi.useFakeTimers()
    try {
      window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
      const wrapper = await mountApp()
      await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle\n^middle$ ::= done')
      await setProgramState(wrapper, 'start')

      mockedRunWithWorker.mockResolvedValueOnce({
        exitCode: 0,
        stdout: '',
        stderr: '',
        state: 'middle',
        trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.tpp', lineNumber: 1, operator: '::=', lhs: '^start$', matchStart: 0, matchEnd: 5, groups: {}, stateBefore: 'start', replacement: 'middle', stateAfter: 'middle' }],
        resourceLogs: [],
      })

      await wrapper.get('[data-test="playground-continue"]').trigger('click')
      await flush()

      expect(wrapper.find('[data-test="playground-continue"]').exists()).toBe(false)
      expect(wrapper.get('[data-test="playground-restart"]').attributes('aria-label')).toBe('Restart')
      expect((wrapper.get('[data-test="playground-restart"]').element as HTMLButtonElement).disabled).toBe(true)
      expect((wrapper.get('[data-test="playground-pause"]').element as HTMLButtonElement).disabled).toBe(false)

      await wrapper.get('[data-test="playground-pause"]').trigger('click')
      expect(wrapper.get('[data-test="playground-status"]').text()).toContain('pausing')
      await vi.advanceTimersByTimeAsync(25)
      await flush()

      expect(wrapper.get('[data-test="playground-status"]').text()).toContain('paused')
      expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
      expect((wrapper.get('[data-test="playground-continue"]').element as HTMLButtonElement).disabled).toBe(false)
      expect((wrapper.get('[data-test="playground-pause"]').element as HTMLButtonElement).disabled).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clicks timeline rows to restore state, undo, and prune future rows before stepping', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle\n^middle$ ::= done\n^middle$ ::= branch')
    await setProgramState(wrapper, 'start')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'middle',
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.tpp', lineNumber: 1, operator: '::=', lhs: '^start$', matchStart: 0, matchEnd: 5, groups: {}, stateBefore: 'start', replacement: 'middle', stateAfter: 'middle' }],
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'done',
      trace: [{ step: 2, ruleIndex: 1, sourcePath: 'examples/hello/hello.tpp', lineNumber: 2, operator: '::=', lhs: '^middle$', matchStart: 0, matchEnd: 6, groups: {}, stateBefore: 'middle', replacement: 'done', stateAfter: 'done' }],
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    const entries = () => wrapper.findAll('.state-diff-row')
    expect(entries()).toHaveLength(3)
    expect(entries()[0].text()).toContain('initial state')
    expect(programState(wrapper)).toBe('done')

    await entries()[0].trigger('click')
    expect(programState(wrapper)).toBe('start')
    expect(wrapper.get('[data-test="playground-status"]').text()).not.toContain('Viewing')
    expect(entries()[0].attributes('data-selected')).toBe('true')
    expect(entries()[1].attributes('data-future')).toBe('true')

    expect((wrapper.get('[data-test="playground-undo"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-test="playground-reset"]').element as HTMLButtonElement).disabled).toBe(true)

    await entries()[1].trigger('click')
    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'branch',
      trace: [{ step: 3, ruleIndex: 2, sourcePath: 'examples/hello/hello.tpp', lineNumber: 3, operator: '::=', lhs: '^middle$', matchStart: 0, matchEnd: 6, groups: {}, stateBefore: 'middle', replacement: 'branch', stateAfter: 'branch' }],
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[2][0].input).toBe('middle')
    expect(entries()).toHaveLength(3)
    expect(programState(wrapper)).toBe('branch')

    await wrapper.get('[data-test="playground-reset"]').trigger('click')
    expect(programState(wrapper)).toBe('start')
    expect(wrapper.get('[data-test="playground-status"]').text()).not.toContain('Viewing')
    expect(entries()[0].attributes('data-selected')).toBe('true')
  })

  it('keeps resource output as an append-only transcript across steps', async () => {
    vi.useFakeTimers()
    try {
      window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
      const wrapper = await mountApp()
      await wrapper.get('[data-test="playground-rules"]').setValue('^a$ ::> stdout A\\\\n\n^$ ::= b\n^b$ ::> stdout B\\\\n')
      await setProgramState(wrapper, 'a')

      mockedRunWithWorker.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'A\n',
        stderr: '',
        state: '',
        trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.tpp', lineNumber: 1, operator: '::>', lhs: '^a$', matchStart: 0, matchEnd: 1, groups: {}, stateBefore: 'a', replacement: '', stateAfter: '' }],
        resourceLogs: [{ name: 'stdout', reads: [], writes: ['A\n'], errors: [], remainingInputText: '', outputText: 'A\n' }],
      })
      await wrapper.get('[data-test="playground-step"]').trigger('click')
      await flush()
      expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'A\n')
      expect(wrapper.get('[data-test="resource-output-stdout"]').attributes('data-attention')).toBe('output')

      await vi.advanceTimersByTimeAsync(1000)
      await flush()
      expect(wrapper.get('[data-test="resource-output-stdout"]').attributes('data-attention')).toBeUndefined()

      mockedRunWithWorker.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'B\n',
        stderr: '',
        state: '',
        trace: [{ step: 2, ruleIndex: 2, sourcePath: 'examples/hello/hello.tpp', lineNumber: 3, operator: '::>', lhs: '^b$', matchStart: 0, matchEnd: 1, groups: {}, stateBefore: 'b', replacement: '', stateAfter: '' }],
        resourceLogs: [{ name: 'stdout', reads: [], writes: ['B\n'], errors: [], remainingInputText: '', outputText: 'B\n' }],
      })
      await wrapper.get('[data-test="playground-step"]').trigger('click')
      await flush()

      expect(mockedRunWithWorker.mock.calls[1][0].input).toBe('')
      expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'A\nB\n')
      expect(wrapper.get('[data-test="resource-output-stdout"]').attributes('data-attention')).toBe('output')
      const entries = wrapper.findAll('.state-diff-row')
      expect(entries).toHaveLength(3)
      await entries[1].trigger('click')
      expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'A\n')
      await entries[2].trigger('click')
      expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'A\nB\n')
    } finally {
      vi.useRealTimers()
    }
  })

  it('replaces play with restart at an exited checkpoint and re-enables play after stepping back', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp({ attachTo: document.body })
    await wrapper.get('[data-test="playground-rules"]').setValue('^a$ ::= b\n^b$ ::> stdout done\\n')
    await setProgramState(wrapper, 'a')

    mockedRunWithWorker.mockResolvedValueOnce({
      stdout: '',
      stderr: '',
      state: 'b',
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.tpp', lineNumber: 1, operator: '::=', lhs: '^a$', matchStart: 0, matchEnd: 1, groups: {}, stateBefore: 'a', replacement: 'b', stateAfter: 'b' }],
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('stepped')
    expect((wrapper.get('[data-test="playground-step"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-continue"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-end"]').element as HTMLButtonElement).disabled).toBe(false)

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: '',
      trace: [{ step: 2, ruleIndex: 1, sourcePath: 'examples/hello/hello.tpp', lineNumber: 2, operator: '::>', lhs: '^b$', matchStart: 0, matchEnd: 1, groups: {}, stateBefore: 'b', replacement: '', stateAfter: '', exitCode: 0 }],
      resourceLogs: [{ name: 'stdout', reads: [], writes: ['done\n'], errors: [], remainingInputText: '', outputText: 'done\n' }],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('exited 0')
    expect((wrapper.get('[data-test="playground-step"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-test="playground-continue"]').exists()).toBe(false)
    expect((wrapper.get('[data-test="playground-restart"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-end"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-test="playground-undo"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-reset"]').element as HTMLButtonElement).disabled).toBe(false)

    await wrapper.get('[data-test="playground-undo"]').trigger('click')
    await flush()

    expect(wrapper.get('[data-test="playground-status"]').text()).not.toContain('Viewing')
    expect(programState(wrapper)).toBe('b')
    expect((wrapper.get('[data-test="playground-step"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-continue"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-end"]').element as HTMLButtonElement).disabled).toBe(false)

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: '',
      trace: [{ step: 2, ruleIndex: 1, sourcePath: 'examples/hello/hello.tpp', lineNumber: 2, operator: '::>', lhs: '^b$', matchStart: 0, matchEnd: 1, groups: {}, stateBefore: 'b', replacement: '', stateAfter: '', exitCode: 0 }],
      resourceLogs: [{ name: 'stdout', reads: [], writes: ['done\n'], errors: [], remainingInputText: '', outputText: 'done\n' }],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker).toHaveBeenCalledTimes(3)
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('exited 0')
    expect((wrapper.get('[data-test="playground-step"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-test="playground-continue"]').exists()).toBe(false)
    expect((wrapper.get('[data-test="playground-restart"]').element as HTMLButtonElement).disabled).toBe(false)

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: '',
      trace: [{ step: 1, ruleIndex: 1, sourcePath: 'examples/hello/hello.tpp', lineNumber: 2, operator: '::>', lhs: '^a$', matchStart: 0, matchEnd: 1, groups: {}, stateBefore: 'a', replacement: '', stateAfter: '', exitCode: 0 }],
      resourceLogs: [{ name: 'stdout', reads: [], writes: ['done\n'], errors: [], remainingInputText: '', outputText: 'done\n' }],
    })
    await wrapper.get('[data-test="playground-restart"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker).toHaveBeenCalledTimes(4)
    expect(mockedRunWithWorker.mock.calls[3][0].input).toBe('a')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('exited 0')
    expect((wrapper.get('[data-test="playground-step"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('keeps visible resource input stable while history carries copied read cursors', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/echo/echo.tpp')
    const wrapper = await mountApp({ attachTo: document.body })
    await wrapper.get('[data-test="playground-rules"]').setValue('@IN@ ::< 30s stdin\n^Ada$ ::= done')
    await setProgramState(wrapper, '@IN@')
    await wrapper.get('[data-test="resource-input-stdin"]').setValue('Ada\nLovelace\n')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'Ada',
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/echo/echo.tpp', lineNumber: 1, operator: '::<', lhs: '@IN@', matchStart: 0, matchEnd: 4, groups: {}, stateBefore: '@IN@', replacement: 'Ada', stateAfter: 'Ada' }],
      resourceLogs: [{ name: 'stdin', reads: ['Ada'], writes: [], errors: [], remainingInputText: 'Lovelace\n', outputText: '' }],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'done',
      trace: [{ step: 2, ruleIndex: 1, sourcePath: 'examples/echo/echo.tpp', lineNumber: 2, operator: '::=', lhs: '^Ada$', matchStart: 0, matchEnd: 3, groups: {}, stateBefore: 'Ada', replacement: 'done', stateAfter: 'done' }],
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    const entries = wrapper.findAll('.state-diff-row')
    expect(entries).toHaveLength(3)
    expect(mockedRunWithWorker.mock.calls[1][0].resources.find(resource => resource.name === 'stdin')).toEqual({ name: 'stdin', inputText: 'Lovelace\n', lineMode: true, readError: undefined })
    expect(wrapper.get('[data-test="resource-input-stdin"]').element).toHaveProperty('value', 'Ada\nLovelace\n')

    await entries[0].trigger('click')
    expect(wrapper.get('[data-test="resource-input-stdin"]').element).toHaveProperty('value', 'Ada\nLovelace\n')

    await entries[1].trigger('click')
    expect(wrapper.get('[data-test="resource-input-stdin"]').element).toHaveProperty('value', 'Ada\nLovelace\n')
  })

  it('clears history and resets to the initial state when resource input changes', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/echo/echo.tpp')
    const wrapper = await mountApp({ attachTo: document.body })
    await wrapper.get('[data-test="playground-rules"]').setValue('@IN@ ::< 30s stdin\n^Ada$ ::= done')
    await setProgramState(wrapper, '@IN@')
    await wrapper.get('[data-test="resource-input-stdin"]').setValue('Ada\nLovelace\n')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'Ada',
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/echo/echo.tpp', lineNumber: 1, operator: '::<', lhs: '@IN@', matchStart: 0, matchEnd: 4, groups: {}, stateBefore: '@IN@', replacement: 'Ada', stateAfter: 'Ada' }],
      resourceLogs: [{ name: 'stdin', reads: ['Ada'], writes: [], errors: [], remainingInputText: 'Lovelace\n', outputText: '' }],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'done',
      trace: [{ step: 2, ruleIndex: 1, sourcePath: 'examples/echo/echo.tpp', lineNumber: 2, operator: '::=', lhs: '^Ada$', matchStart: 0, matchEnd: 3, groups: {}, stateBefore: 'Ada', replacement: 'done', stateAfter: 'done' }],
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    let entries = wrapper.findAll('.state-diff-row')
    await entries[1].trigger('click')
    expect(wrapper.findAll('.state-diff-row')).toHaveLength(3)
    expect(wrapper.findAll('.state-diff-row')[2].attributes('data-future')).toBe('true')

    await wrapper.get('[data-test="resource-input-stdin"]').setValue('Grace\n')
    await flush()

    entries = wrapper.findAll('.state-diff-row')
    expect(entries).toHaveLength(0)
    expect(programState(wrapper)).toBe('@IN@')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('resource input edited; reset to initial state')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'Grace',
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/echo/echo.tpp', lineNumber: 1, operator: '::<', lhs: '@IN@', matchStart: 0, matchEnd: 4, groups: {}, stateBefore: '@IN@', replacement: 'Grace', stateAfter: 'Grace' }],
      resourceLogs: [{ name: 'stdin', reads: ['Grace'], writes: [], errors: [], remainingInputText: '', outputText: '' }],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[2][0].resources.find(resource => resource.name === 'stdin')).toEqual({ name: 'stdin', inputText: 'Grace\n', lineMode: true, readError: undefined })
    expect(wrapper.findAll('.state-diff-row')).toHaveLength(2)
    expect(programState(wrapper)).toBe('Grace')
  })

  it('clears a waiting checkpoint when resource input changes', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/echo/echo.tpp')
    const wrapper = await mountApp({ attachTo: document.body })
    await wrapper.get('[data-test="playground-rules"]').setValue('@IN@ ::< 30s stdin\n^start$ ::= other')
    await setProgramState(wrapper, '@IN@')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: 'ERR:resource:stdin:pending_input:stdin',
      errors: 'ERR:resource:stdin:pending_input:stdin',
      state: '@IN@',
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/echo/echo.tpp', lineNumber: 1, operator: '::<', lhs: '@IN@', matchStart: 0, matchEnd: 4, groups: {}, stateBefore: '@IN@', replacement: '', stateAfter: '@IN@', error: 'ERR:resource:stdin:pending_input:stdin' }],
      resourceLogs: [{ name: 'stdin', reads: [], writes: [], errors: ['pending_input:stdin'], remainingInputText: '', outputText: '' }],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('waiting for stdin')
    expect((wrapper.get('[data-test="resource-submit-stdin"]').element as HTMLButtonElement).disabled).toBe(false)

    await wrapper.get('[data-test="resource-input-stdin"]').setValue('Ada')
    await flush()

    expect(wrapper.findAll('.state-diff-row')).toHaveLength(0)
    expect(programState(wrapper)).toBe('@IN@')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('resource input edited; reset to initial state')
    expect((wrapper.get('[data-test="resource-submit-stdin"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-test="resource-countdown-stdin"]').exists()).toBe(false)
  })

  it('does not mark restored output snapshots as newly written output', async () => {
    vi.useFakeTimers()
    try {
      window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
      const wrapper = await mountApp()
      await wrapper.get('[data-test="playground-rules"]').setValue('^a$ ::> stdout A\\\\n\n^$ ::= b\n^b$ ::> stdout B\\\\n')
      await setProgramState(wrapper, 'a')

      mockedRunWithWorker.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'A\n',
        stderr: '',
        state: '',
        trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.tpp', lineNumber: 1, operator: '::>', lhs: '^a$', matchStart: 0, matchEnd: 1, groups: {}, stateBefore: 'a', replacement: '', stateAfter: '' }],
        resourceLogs: [{ name: 'stdout', reads: [], writes: ['A\n'], errors: [], remainingInputText: '', outputText: 'A\n' }],
      })
      await wrapper.get('[data-test="playground-step"]').trigger('click')
      await flush()

      await vi.advanceTimersByTimeAsync(1000)
      await flush()
      expect(wrapper.get('[data-test="resource-output-stdout"]').attributes('data-attention')).toBeUndefined()

      mockedRunWithWorker.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'B\n',
        stderr: '',
        state: '',
        trace: [{ step: 2, ruleIndex: 2, sourcePath: 'examples/hello/hello.tpp', lineNumber: 3, operator: '::>', lhs: '^b$', matchStart: 0, matchEnd: 1, groups: {}, stateBefore: 'b', replacement: '', stateAfter: '' }],
        resourceLogs: [{ name: 'stdout', reads: [], writes: ['B\n'], errors: [], remainingInputText: '', outputText: 'B\n' }],
      })
      await wrapper.get('[data-test="playground-step"]').trigger('click')
      await flush()
      expect(wrapper.get('[data-test="resource-output-stdout"]').attributes('data-attention')).toBe('output')

      await vi.advanceTimersByTimeAsync(1000)
      await flush()
      const entries = wrapper.findAll('.state-diff-row')
      await entries[1].trigger('click')
      await flush()

      expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'A\n')
      expect(wrapper.get('[data-test="resource-output-stdout"]').attributes('data-attention')).toBeUndefined()
    } finally {
      vi.useRealTimers()
    }
  })

  it('collapses multi-trace worker results instead of assigning one final resource snapshot to multiple rows', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp({ attachTo: document.body })
    await wrapper.get('[data-test="playground-rules"]').setValue('^a$ ::> stdout A\\\\n\n^$ ::= b')
    await setProgramState(wrapper, 'a')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'A\n',
      stderr: '',
      state: 'b',
      trace: [
        { step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.tpp', lineNumber: 1, operator: '::>', lhs: '^a$', matchStart: 0, matchEnd: 1, groups: {}, stateBefore: 'a', replacement: '', stateAfter: '' },
        { step: 2, ruleIndex: 1, sourcePath: 'examples/hello/hello.tpp', lineNumber: 3, operator: '::=', lhs: '^$', matchStart: 0, matchEnd: 0, groups: {}, stateBefore: '', replacement: 'b', stateAfter: 'b' },
      ],
      resourceLogs: [{ name: 'stdout', reads: [], writes: ['A\n'], errors: [], remainingInputText: '', outputText: 'A\n' }],
    })

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    const entries = wrapper.findAll('.state-diff-row')
    expect(entries).toHaveLength(2)
    expect(entries[1].text()).toContain('2 traced steps collapsed')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'A\n')
  })

  it('uses visible resource buffers on the next run without requiring submit', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/echo/echo.tpp')
    const wrapper = await mountApp({ attachTo: document.body })
    await wrapper.get('[data-test="playground-rules"]').setValue('@IN@ ::< 30s stdin')
    await setProgramState(wrapper, '@IN@')
    await wrapper.get('[data-test="resource-input-stdin"]').setValue('Ada\nLovelace\n')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'Ada',
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/echo/echo.tpp', lineNumber: 1, operator: '::<', lhs: '@IN@', matchStart: 0, matchEnd: 4, groups: {}, stateBefore: '@IN@', replacement: 'Ada', stateAfter: 'Ada' }],
      resourceLogs: [{ name: 'stdin', reads: ['Ada'], writes: [], errors: [], remainingInputText: 'Lovelace\n', outputText: '' }],
    })

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[0][0].resources.find(resource => resource.name === 'stdin')).toEqual({ name: 'stdin', inputText: 'Ada\nLovelace\n', lineMode: true, readError: undefined })
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('stepped')
    expect(programState(wrapper)).toBe('Ada')
    expect(wrapper.get('[data-test="resource-input-stdin"]').element).toHaveProperty('value', 'Ada\nLovelace\n')
    expect(wrapper.find('[data-test="resource-countdown-stdin"]').exists()).toBe(false)
  })

  it('locks resource input buffers while the interpreter is actively running', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/echo/echo.tpp')
    const wrapper = await mountApp({ attachTo: document.body })
    await wrapper.get('[data-test="playground-rules"]').setValue('@IN@ ::< stdin')
    await setProgramState(wrapper, '@IN@')
    await wrapper.get('[data-test="resource-input-stdin"]').setValue('Ada')
    const run = deferred<{ exitCode: number; stdout: string; stderr: string; state: string; resourceLogs: Array<{ name: string; reads: string[]; writes: string[]; errors: string[]; remainingInputText: string; outputText: string }> }>()
    mockedRunWithWorker.mockReturnValueOnce(run.promise)

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect((wrapper.get('[data-test="resource-input-stdin"]').element as HTMLTextAreaElement).readOnly).toBe(true)
    expect(wrapper.get('[data-test="resource-input-help-stdin"]').text()).toBe('running; input is locked until the next pause')
    expect((wrapper.get('[data-test="resource-submit-stdin"]').element as HTMLButtonElement).disabled).toBe(true)

    run.resolve({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'Ada',
      resourceLogs: [{ name: 'stdin', reads: ['Ada'], writes: [], errors: [], remainingInputText: '', outputText: '' }],
    })
    await flush()

    expect((wrapper.get('[data-test="resource-input-stdin"]').element as HTMLTextAreaElement).readOnly).toBe(false)
    expect(wrapper.get('[data-test="resource-input-help-stdin"]').text()).toBe('preload input for the next run')
  })

  it('submits an empty line when a millisecond pending input countdown expires', async () => {
    vi.useFakeTimers()
    try {
      window.history.pushState({}, '', '/playground?file=./examples/echo/echo.tpp')
      const wrapper = await mountApp({ attachTo: document.body })
      await wrapper.get('[data-test="playground-rules"]').setValue('@IN@ ::< 500ms stdin')
      await setProgramState(wrapper, '@IN@')

      mockedRunWithWorker.mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: '',
        error: 'WAIT:resource:stdin:pending_input',
        errors: 'WAIT:resource:stdin:pending_input',
        state: '@IN@',
        trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/echo/echo.tpp', lineNumber: 1, operator: '::<', lhs: '@IN@', matchStart: 0, matchEnd: 4, groups: {}, stateBefore: '@IN@', replacement: '', stateAfter: '@IN@', error: 'WAIT:resource:stdin:pending_input' }],
        resourceLogs: [{ name: 'stdin', reads: [], writes: [], errors: ['WAIT:resource:stdin:pending_input'], remainingInputText: '', outputText: '' }],
      })

      await wrapper.get('[data-test="playground-step"]').trigger('click')
      await flush()

      expect(wrapper.get('[data-test="playground-status"]').text()).toContain('waiting for stdin')
      expect(wrapper.get('[data-test="resource-countdown-stdin"]').text()).toContain('empty line in 1s')

      mockedRunWithWorker.mockResolvedValueOnce({
        exitCode: 0,
        stdout: '',
        stderr: '',
        state: '',
        trace: [{ step: 2, ruleIndex: 0, sourcePath: 'examples/echo/echo.tpp', lineNumber: 1, operator: '::<', lhs: '@IN@', matchStart: 0, matchEnd: 4, groups: {}, stateBefore: '@IN@', replacement: '', stateAfter: '' }],
        resourceLogs: [{ name: 'stdin', reads: [''], writes: [], errors: [], remainingInputText: '', outputText: '' }],
      })

      await vi.advanceTimersByTimeAsync(500)
      await flush()

      expect(mockedRunWithWorker).toHaveBeenCalledTimes(2)
      expect(mockedRunWithWorker.mock.calls[1][0].resources.find(resource => resource.name === 'stdin')).toEqual({ name: 'stdin', inputText: '\n', lineMode: true, readError: undefined })
      expect(wrapper.get('[data-test="playground-status"]').text()).toContain('stepped')
      expect(wrapper.find('[data-test="resource-countdown-stdin"]').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('shows minute read timeout countdowns in seconds', async () => {
    vi.useFakeTimers()
    try {
      window.history.pushState({}, '', '/playground?file=./examples/echo/echo.tpp')
      const wrapper = await mountApp({ attachTo: document.body })
      await wrapper.get('[data-test="playground-rules"]').setValue('@IN@ ::< 1m stdin')
      await setProgramState(wrapper, '@IN@')

      mockedRunWithWorker.mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: '',
        error: 'WAIT:resource:stdin:pending_input',
        errors: 'WAIT:resource:stdin:pending_input',
        state: '@IN@',
        trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/echo/echo.tpp', lineNumber: 1, operator: '::<', lhs: '@IN@', matchStart: 0, matchEnd: 4, groups: {}, stateBefore: '@IN@', replacement: '', stateAfter: '@IN@', error: 'WAIT:resource:stdin:pending_input' }],
        resourceLogs: [{ name: 'stdin', reads: [], writes: [], errors: ['WAIT:resource:stdin:pending_input'], remainingInputText: '', outputText: '' }],
      })

      await wrapper.get('[data-test="playground-step"]').trigger('click')
      await flush()

      expect(wrapper.get('[data-test="playground-status"]').text()).toContain('waiting for stdin')
      expect(wrapper.get('[data-test="resource-countdown-stdin"]').text()).toContain('empty line in 60s')
    } finally {
      vi.useRealTimers()
    }
  })

  it('clears a pending countdown when typed resource input changes', async () => {
    vi.useFakeTimers()
    try {
      window.history.pushState({}, '', '/playground?file=./examples/echo/echo.tpp')
      const wrapper = await mountApp({ attachTo: document.body })
      await wrapper.get('[data-test="playground-rules"]').setValue('@IN@ ::< 1s stdin')
      await setProgramState(wrapper, '@IN@')

      mockedRunWithWorker.mockResolvedValueOnce({
        exitCode: 1,
        stdout: '',
        stderr: '',
        error: 'WAIT:resource:stdin:pending_input',
        errors: 'WAIT:resource:stdin:pending_input',
        state: '@IN@',
        trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/echo/echo.tpp', lineNumber: 1, operator: '::<', lhs: '@IN@', matchStart: 0, matchEnd: 4, groups: {}, stateBefore: '@IN@', replacement: '', stateAfter: '@IN@', error: 'WAIT:resource:stdin:pending_input' }],
        resourceLogs: [{ name: 'stdin', reads: [], writes: [], errors: ['WAIT:resource:stdin:pending_input'], remainingInputText: '', outputText: '' }],
      })

      await wrapper.get('[data-test="playground-step"]').trigger('click')
      await flush()
      await wrapper.get('[data-test="resource-input-stdin"]').setValue('1')
      await flush()

      await vi.advanceTimersByTimeAsync(1000)
      await flush()

      expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
      expect(wrapper.get('[data-test="playground-status"]').text()).toContain('resource input edited; reset to initial state')
      expect(programState(wrapper)).toBe('@IN@')
      expect(wrapper.get('[data-test="resource-input-stdin"]').element).toHaveProperty('value', '1')
      expect(wrapper.find('[data-test="resource-countdown-stdin"]').exists()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('resource edits while waiting reset instead of resuming from a checkpoint', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/guess-number/guess-number.tpp')
    const wrapper = await mountApp({ attachTo: document.body })

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: 'WAIT:resource:random:pending_input',
      errors: 'WAIT:resource:random:pending_input',
      state: 'SECRET<@RANDOM_NUMBER@>',
      resourceLogs: [
        { name: 'random', reads: [], writes: [], errors: ['WAIT:resource:random:pending_input'], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
      ],
    })

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('waiting for random')
    expect((wrapper.get('[data-test="resource-submit-random"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="resource-submit-stdin"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-test="resource-input-random"]').element as HTMLTextAreaElement).readOnly).toBe(false)
    expect(wrapper.get('[data-test="resource-input-help-random"]').text()).toBe('program is waiting; submit one response')
    expect(wrapper.get('[data-test="resource-input-random"]').attributes('data-attention')).toBeUndefined()
    expect(document.activeElement).toBe(wrapper.get('[data-test="resource-input-random"]').element)
    expect(mockedRunWithWorker.mock.calls[0][0].resources.find(resource => resource.name === 'random')).toEqual({ name: 'random', inputText: '', lineMode: true, readError: undefined })

    await wrapper.get('[data-test="resource-input-random"]').setValue('7')
    await flush()

    expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
    expect(programState(wrapper)).toBe('SECRET<@RANDOM_NUMBER@>')
    expect(wrapper.findAll('.state-diff-row')).toHaveLength(0)
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('resource input edited; reset to initial state')
    expect((wrapper.get('[data-test="resource-submit-random"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-test="resource-countdown-random"]').exists()).toBe(false)
  })

  it('renders curated example groups as navigation menu cards without command search', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp({ attachTo: document.body })

    expect(wrapper.find('[data-test="test-case-command"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="test-case-command-input"]').exists()).toBe(false)
    const triggerLabels = wrapper.findAll('[data-test="test-case-menu-trigger"]').map(trigger => trigger.text())
    expect(triggerLabels).toEqual(['Basic rules', 'I/O', 'Resources', 'Calcs', 'Forth', 'Lisp'])

    const lispTrigger = wrapper.findAll('[data-test="test-case-menu-trigger"]').find(trigger => trigger.text() === 'Lisp')
    expect(lispTrigger).toBeTruthy()
    await lispTrigger!.trigger('pointerdown')
    await lispTrigger!.trigger('click')
    await flush()

    const menuItems = Array.from(document.querySelectorAll('[data-test="test-case-menu-case"]')).map(element => element.textContent ?? '')
    expect(menuItems.some(text => text.includes('Closure call'))).toBe(true)
    expect(menuItems.some(text => text.includes('zero arg closure call still evaluates body'))).toBe(false)
    expect(menuItems.some(text => text.includes('Calls a zero-argument closure and returns the body value.'))).toBe(true)
    expect(menuItems.some(text => text.includes('((fn () 7))'))).toBe(false)
    expect(menuItems.some(text => text.includes('parse_unparse_canonical_acceptance.toml'))).toBe(false)
  })

  it('selecting a curated manifest test case loads rules, state, and resources without running', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = await mountApp({ attachTo: document.body })

    const lispTrigger = wrapper.findAll('[data-test="test-case-menu-trigger"]').find(trigger => trigger.text() === 'Lisp')
    expect(lispTrigger).toBeTruthy()
    await lispTrigger!.trigger('pointerdown')
    await lispTrigger!.trigger('click')
    await flush()

    const zeroArgCase = Array.from(document.querySelectorAll('[data-test="test-case-menu-case"]')).map(element => ({ text: () => element.textContent ?? '', trigger: (event: string) => (element as HTMLElement).dispatchEvent(new MouseEvent(event, { bubbles: true })) })).find(item => item.text().includes('Closure call'))
    expect(zeroArgCase).toBeTruthy()
    await zeroArgCase!.trigger('click')
    await flush()

    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toContain('VPRIM')
    expect(programState(wrapper)).toBe('((fn () 7))')
    expect(mockedRunWithWorker).not.toHaveBeenCalled()
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('idle')
    expect(wrapper.find('[data-test="fixture-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="terminal"]').exists()).toBe(false)
  })

  it('derives resource sections from playground rules and keeps resource inputs gated by requests', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/guess-number/guess-number.tpp')
    const wrapper = await mountApp()

    expect(wrapper.get('[data-test="resource-section-random"]').text()).toContain('random')
    expect(wrapper.get('[data-test="resource-section-random"]').text()).not.toContain('read')
    expect(wrapper.get('[data-test="resource-section-stdout"]').text()).not.toContain('write')
    expect(wrapper.get('[data-test="resource-input-random"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="resource-input-stdin"]').element.tagName).toBe('TEXTAREA')
    expect((wrapper.get('[data-test="resource-submit-random"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-test="resource-submit-stdin"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-test="resource-input-random"]').element as HTMLTextAreaElement).readOnly).toBe(false)
    expect(wrapper.get('[data-test="resource-input-help-random"]').text()).toBe('preload input for the next run')
    expect(wrapper.find('[data-test="playground-js-procs"]').exists()).toBe(false)

    await wrapper.get('[data-test="resource-input-random"]').setValue('7')
    await wrapper.get('[data-test="resource-input-stdin"]').setValue('x\n3\n8\n7')
    await wrapper.get('[data-test="resource-submit-random"]').trigger('click')
    await wrapper.get('[data-test="resource-submit-stdin"]').trigger('click')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Guess:\nPlease enter digits only.\nGuess:\nToo low.\nGuess:\nToo high.\nGuess:\nCorrect!\n',
      stderr: '',
      resourceLogs: [
        { name: 'stdin', reads: ['x', '3', '8', '7'], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: ['Guess:\nPlease enter digits only.\nGuess:\nToo low.\nGuess:\nToo high.\nGuess:\nCorrect!\n'], errors: [], remainingInputText: '', outputText: 'Guess:\nPlease enter digits only.\nGuess:\nToo low.\nGuess:\nToo high.\nGuess:\nCorrect!\n' },
        { name: 'random', reads: ['7'], writes: [], errors: [], remainingInputText: '', outputText: '' },
      ],
    })
    await wrapper.get('[data-test="playground-continue"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[0][0].resources).toEqual([
      { name: 'stdout', inputText: '', lineMode: true, readError: undefined },
      { name: 'stdin', inputText: 'x\n3\n8\n7', lineMode: true, readError: undefined },
      { name: 'stderr', inputText: '', lineMode: true, readError: undefined },
      { name: 'random', inputText: '7', lineMode: true, readError: undefined },
    ])
    expect(mockedRunWithWorker.mock.calls[0][0].procs).toBeUndefined()
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Guess:\nPlease enter digits only.\nGuess:\nToo low.\nGuess:\nToo high.\nGuess:\nCorrect!\n')
    expect(wrapper.get('[data-test="resource-input-stdin"]').element).toHaveProperty('value', 'x\n3\n8\n7')
    expect(wrapper.get('[data-test="resource-input-random"]').element).toHaveProperty('value', '7')
  })

  it('typing resource input after a wait resets instead of using the old submit resume path', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/echo/echo.tpp')
    const wrapper = await mountApp({ attachTo: document.body })

    expect(wrapper.find('[data-test="stdin-send"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="stdin-queue"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="resource-ready-stdin"]').exists()).toBe(false)

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: 'WAIT:resource:stdin:pending_input',
      errors: 'WAIT:resource:stdin:pending_input',
      state: 'read',
      resourceLogs: [
        { name: 'stdin', reads: [], writes: [], errors: ['WAIT:resource:stdin:pending_input'], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stderr', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
      ],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[0][0].input).toBe('read')
    expect(mockedRunWithWorker.mock.calls[0][0].resources.find(resource => resource.name === 'stdin')).toEqual({ name: 'stdin', inputText: '', lineMode: true, readError: undefined })
    expect(programState(wrapper)).toBe('read')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('waiting for stdin')
    expect(document.activeElement).toBe(wrapper.get('[data-test="resource-input-stdin"]').element)

    await wrapper.get('[data-test="resource-input-stdin"]').setValue('Ada')
    await flush()

    expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
    expect(programState(wrapper)).toBe('read')
    expect(wrapper.findAll('.state-diff-row')).toHaveLength(0)
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('resource input edited; reset to initial state')
    expect((wrapper.get('[data-test="resource-submit-stdin"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', '')
    expect(wrapper.find('[data-test="terminal"]').exists()).toBe(false)
  })

  it('renders /playground in compact mode without the old playground-specific header', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp&mode=compact&section=trace')
    const wrapper = await mountApp({ attachTo: document.body })

    expect(wrapper.find('[data-test="playground-header"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="playground-compact-surface"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="embed-section-panel"]').text()).toContain('trace')
  })

  it('renders /embed without the page header and starts on the requested section/tab', async () => {
    window.history.pushState({}, '', '/embed?file=./examples/hello/hello.tpp&section=source&tab=stderr&editable=0')
    const wrapper = await mountApp({ attachTo: document.body })

    expect(wrapper.find('[data-test="playground-header"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="playground-compact-surface"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="embed-section-panel"]').text()).toContain('source')
    expect(programState(wrapper)).toBe('START')
    expect(wrapper.get('[data-test="embed-open-full"]').attributes('href')).toContain('/playground?file=.%2Fexamples%2Fhello%2Fhello.tpp')
  })

  it('honors header=1 for embed routes without showing the picker by default', async () => {
    window.history.pushState({}, '', '/embed?file=./examples/hello/hello.tpp&header=1')
    const wrapper = await mountApp({ attachTo: document.body })

    expect(wrapper.find('[data-test="playground-header"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="test-selector"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="playground-compact-surface"]').exists()).toBe(true)
  })

  it('runs an output-focused embed through the shared Go-WASM path', async () => {
    window.history.pushState({}, '', '/embed?file=./examples/hello/hello.tpp&section=output&tab=stdout&controls=run')
    const wrapper = await mountApp({ attachTo: document.body })

    mockedRunWithWorker.mockResolvedValueOnce({ exitCode: 0, stdout: 'Hello from embed!\n', stderr: '', state: '', resourceLogs: [] })
    await wrapper.get('[data-test="embed-run"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
    expect(mockedRunWithWorker.mock.calls[0][0].sourcePath).toBe('examples/hello/hello.tpp')
    expect(mockedRunWithWorker.mock.calls[0][0].stepLimit).toBe(10000)
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Hello from embed!\n')
  })

  it('shows the embed demo route with preset examples and explanations', async () => {
    window.history.pushState({}, '', '/embed/demo')
    const wrapper = await mountApp({ attachTo: document.body })

    expect(wrapper.text()).toContain('Compact Thue++ playground embeds')
    expect(wrapper.text()).toContain('Output-focused runnable snippet')
    expect(wrapper.findAll('[data-test="playground-compact-surface"]').length).toBeGreaterThanOrEqual(3)
  })
})
