import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { runWithWorker, type DemoRunRequest, type DemoRunResult } from './wasm'

vi.mock('./RulesMonacoEditor.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { modelValue: { type: String, default: '' }, highlightLine: { type: Number, default: undefined } },
      emits: ['update:modelValue', 'paste'],
      setup(props, { emit, attrs }) {
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

import App from './App.vue'

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

async function selectExample(wrapper: VueWrapper, id: string): Promise<void> {
  await wrapper.get(`[data-example-id="${id}"]`).trigger('click')
}

async function runDemo(wrapper: VueWrapper, result: DemoRunResult = { exitCode: 0, stdout: 'ok\n', stderr: '', coverage: '', coverageTSV: '', resourceLogs: [] }): Promise<DemoRunRequest> {
  mockedRunWithWorker.mockResolvedValueOnce(result)
  await wrapper.get('[data-test="run-demo"]').trigger('click')
  await flush()
  expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
  return mockedRunWithWorker.mock.calls[0][0]
}

describe('Go-WASM demo UI', () => {
  beforeEach(() => {
    window.history.pushState({}, '', '/')
    document.body.innerHTML = ''
    mockedRunWithWorker.mockReset()
    if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = vi.fn()
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('mounts as a real interpreter workbench and runs the hello stdout example', async () => {
    const wrapper = mount(App)

    expect(wrapper.text()).toContain('A tiny language for rewriting text with rules')
    expect(wrapper.text()).toContain('Go-WASM interpreter')
    expect(wrapper.text()).toContain('not a JavaScript rule evaluator')
    expect(wrapper.get('[data-example-id="hello"]').text()).toContain('stdout')
    expect(wrapper.get('[data-test="source-preview"]').text()).toContain('Hello from Go-WASM')

    const request = await runDemo(wrapper, { exitCode: 0, stdout: 'Hello from Go-WASM!\n', stderr: '', coverageTSV: '' })

    expect(request.sourcePath).toBe('hello.tpp')
    expect(request.sourceText).toContain('stdout Hello from Go-WASM!')
    expect(request.sourceText).toContain('hello')
    expect(request.coverage).toBe(true)
    expect(wrapper.text()).toContain('Hello from Go-WASM!')
    expect(wrapper.text()).toContain('Hello from Go-WASM!')
  })

  it('passes buffered stdin input to the worker', async () => {
    const wrapper = mount(App)
    await selectExample(wrapper, 'stdin')

    expect(wrapper.get('[data-test="stdin-preview"]').text()).toContain('Ada')
    const request = await runDemo(wrapper, { exitCode: 0, stdout: 'hello Ada!\n' })

    expect(request.sourcePath).toBe('stdin-greeting.tpp')
    expect(request.input).toBe('Ada\n')
    expect(request.resources).toEqual([])
    expect(wrapper.text()).toContain('hello Ada!')
  })

  it('presents examples as educational scenario cards', async () => {
    const wrapper = mount(App)

    const cards = wrapper.findAll('[data-test="example-card"]')
    expect(cards.length).toBeGreaterThanOrEqual(6)
    expect(wrapper.get('[data-example-id="resource-echo"]').text()).toContain('callback resource')

    await selectExample(wrapper, 'coverage')
    expect(wrapper.get('[data-test="source-preview"]').text()).toContain('covered')
    expect(wrapper.text()).toContain('coverage-demo.tpp')
  })

  it('sends custom callback resources and displays read/write logs behind the resources tab', async () => {
    const wrapper = mount(App)
    await selectExample(wrapper, 'resource-echo')

    const request = await runDemo(wrapper, {
      exitCode: 0,
      stdout: 'ping\n',
      resourceLogs: [{ name: 'echo', reads: ['ping'], writes: ['ping'], errors: [] }],
    })

    expect(request.resources).toEqual([{ name: 'echo', inputText: 'ping\n', readError: undefined }])
    await wrapper.get('[data-result-tab="resources"]').trigger('click')
    expect(wrapper.text()).toContain('[echo]')
    expect(wrapper.text()).toContain('reads: ["ping"]')
    expect(wrapper.text()).toContain('writes: ["ping"]')
  })

  it('surfaces resource timeout errors without running subprocess fixtures', async () => {
    const wrapper = mount(App)
    await selectExample(wrapper, 'timeout')

    const request = await runDemo(wrapper, {
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: 'ERR:resource:sleepy:timeout',
      resourceLogs: [{ name: 'sleepy', reads: [], writes: [], errors: ['timeout'] }],
    })

    expect(request.sourcePath).toBe('timeout.tpp')
    expect(request.resources).toEqual([{ name: 'sleepy', inputText: '', readError: 'timeout' }])
    expect(wrapper.text()).toContain('ERR:resource:sleepy:timeout')
    await wrapper.get('[data-result-tab="errors"]').trigger('click')
    expect(wrapper.text()).toContain('ERR:resource:sleepy:timeout')
    expect(wrapper.text()).toContain('errors: ["timeout"]')
  })


  it('renders raw coverage TSV and parsed coverage rows in the coverage tab', async () => {
    const wrapper = mount(App)
    await selectExample(wrapper, 'coverage')

    const request = await runDemo(wrapper, {
      exitCode: 0,
      stdout: 'covered\n',
      coverageTSV: 'coverage-demo.tpp:1\t1\t^start$ ::= middle\ncoverage-demo.tpp:2\t1\t^middle$ ::= done\n',
    })

    expect(request.coverage).toBe(true)
    await wrapper.get('[data-result-tab="coverage"]').trigger('click')
    expect(wrapper.text()).toContain('coverage-demo.tpp:1')
    expect(wrapper.find('.coverage-table').exists()).toBe(true)
    expect(wrapper.text()).toContain('^start$ ::= middle')
    expect(wrapper.text()).toContain('^middle$ ::= done')
  })

  it('copies stdout and reports clipboard success', async () => {
    const wrapper = mount(App)
    await runDemo(wrapper, { exitCode: 0, stdout: 'copy me\n', stderr: '', coverageTSV: '' })

    await wrapper.get('[data-copy="stdout"]').trigger('click')
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('copy me\n')
    expect(wrapper.text()).toContain('Copied stdout')
  })

  it('serves a resizable playground route with pinned stdio resources and no reset action', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = mount(App)

    expect(wrapper.text()).toContain('THUE++ Playground')
    expect(wrapper.text()).toContain('state')
    expect(wrapper.get('[data-test="playground-rules"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="playground-rules"]').attributes('wrap')).toBe('off')
    expect(wrapper.get('[data-test="playground-state"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="playground-state"]').attributes('wrap')).toBe('soft')
    expect(wrapper.get('[data-test="playground-step"]').attributes('aria-label')).toBe('Step forward')
    expect(wrapper.get('[data-test="resource-sections"]').attributes('data-slot')).toBe('card')
    expect(wrapper.get('[data-test="playground-status"]').attributes('data-slot')).toBe('badge')
    expect(wrapper.get('[data-test="playground-status"]').element.closest('.playground-state-pane')).not.toBeNull()
    expect(wrapper.get('[data-test="playground-status"]').element.closest('.playground-resources-pane')).toBeNull()
    expect(wrapper.get('[data-test="playground-state-stack"]').element.tagName).toBe('DIV')
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
    expect(wrapper.get('[data-test="playground-max-steps"]').text()).toContain('max steps:')
    expect(wrapper.get('[data-test="playground-max-steps-1000"]').text()).toBe('1000')
    expect(wrapper.get('[data-test="playground-max-steps-10000"]').text()).toBe('10000')
    expect(wrapper.get('[data-test="playground-max-steps-100000"]').text()).toBe('100000')
    expect(wrapper.get('[data-test="playground-max-steps-10000"]').attributes('data-selected')).toBe('true')
    expect(wrapper.find('[data-test="stdio-panel"]').exists()).toBe(false)
    expect(wrapper.findAll('[data-slot="resizable-panel"]').length).toBeGreaterThanOrEqual(5)
    expect(wrapper.findAll('[data-slot="resizable-handle"]').length).toBeGreaterThanOrEqual(3)
    expect(wrapper.get('[data-test="resource-section-stdin"]').text()).toContain('stdin')
    expect(wrapper.get('[data-test="resource-section-stdout"]').text()).toContain('stdout')
    expect(wrapper.get('[data-test="resource-section-stderr"]').text()).toContain('stderr')
    expect(wrapper.get('[data-test="resource-input-stdin"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="resource-output-stderr"]').element.tagName).toBe('TEXTAREA')
    const loadedSource = (wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value
    expect(loadedSource).toContain('Hello, World')
    expect(loadedSource).not.toContain('\n::=\nSTART\n')

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
  })

  it('uses the visible empty state instead of falling back to embedded source state', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = mount(App)
    await wrapper.get('[data-test="playground-state"]').setValue('')

    mockedRunWithWorker.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', state: '', resourceLogs: [] })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
    expect(mockedRunWithWorker.mock.calls[0][0].sourceText).not.toContain('\n::=\nSTART\n')
    expect(mockedRunWithWorker.mock.calls[0][0].input).toBe('')
  })

  it('seeds Program State from pasted full source while keeping Program Rules runnable', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = mount(App)
    await wrapper.get('[data-test="playground-state"]').setValue('stale override')
    const pastedSource = '^aaab$ ::= done\n::=\naaab\n'

    await wrapper.get('[data-test="playground-rules"]').setValue(pastedSource)
    await wrapper.get('[data-test="playground-rules"]').trigger('paste')

    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toBe('^aaab$ ::= done\n')
    expect((wrapper.get('[data-test="playground-state"]').element as HTMLTextAreaElement).value).toBe('aaab')
  })

  it('does not rewrite Program Rules when Program State is edited after source seeding', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = mount(App)
    const originalSource = (wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value

    await wrapper.get('[data-test="playground-state"]').setValue('custom state')

    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toBe(originalSource)
  })

  it('loads hash-prefixed source rows exactly and keeps state empty without a separator heuristic', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hash-data/source-hash-rule.tpp')
    const wrapper = mount(App)

    const loadedSource = (wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value
    expect(loadedSource).toContain('#x ::= y')
    expect(loadedSource).toContain('^y$ ::> stdout source-row-rule\\n')
    expect((wrapper.get('[data-test="playground-state"]').element as HTMLTextAreaElement).value).toBe('')
  })

  it('discovers resources from hash-prefixed rule rows', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = mount(App)
    await wrapper.get('[data-test="playground-rules"]').setValue('#read ::< @VALUE custom\n#done ::> custom done\n')

    expect(wrapper.get('[data-test="resource-section-custom"]').text()).toContain('custom')
  })

  it('steps one rule and updates State as the current state', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = mount(App)
    await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle\n^middle$ ::= done')
    await wrapper.get('[data-test="playground-state"]').setValue('start')

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
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'middle')
    expect(wrapper.get('[data-test="playground-rules"]').attributes('data-current-match-line')).toBe('1')
    expect(wrapper.get('[data-test="playground-diffs"]').text()).toContain('#1 row 1')
    expect(wrapper.get('[data-test="playground-diffs"]').text()).toContain('^start$ ::= middle')
    expect(wrapper.get('[data-test="playground-diffs"]').text()).toContain('-start')
    expect(wrapper.get('[data-test="playground-diffs"]').text()).toContain('+middle')
    expect(wrapper.get('[data-test="playground-diffs"]').text()).not.toContain('examples/hello/hello.tpp')
    expect(wrapper.find('.state-diff-char-removed').exists()).toBe(true)
    expect(wrapper.find('.state-diff-char-added').exists()).toBe(true)
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('stepped')
  })

  it('shows failed step exit status and stderr instead of reporting a successful step', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/builtin/builtin.tpp')
    const wrapper = mount(App)
    await wrapper.get('[data-test="playground-state"]').setValue('div:1,0')

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
    expect(diffs.text()).toContain('#1 row 6')
    expect(diffs.text()).toContain('Builtin \'div\' division by zero')
    expect(entries[1].find('.state-diff-error').exists()).toBe(true)
    expect(entries[1].find('.state-diff-line.removed').exists()).toBe(false)
    expect(entries[1].find('.state-diff-line.added').exists()).toBe(false)
    expect((wrapper.get('[data-test="playground-step"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-continue"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-end"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-reset"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-undo"]').element as HTMLButtonElement).disabled).toBe(false)
    expect(wrapper.get('[data-test="playground-step"]').attributes('title')).toBe('Step forward')
    expect(wrapper.get('[data-test="playground-continue"]').attributes('title')).toBe('Play')
    expect(wrapper.get('[data-test="playground-end"]').attributes('title')).toBe('End without rendering intermediate states (max 10000 steps)')

    await wrapper.get('[data-test="playground-state"]').setValue('div:2,1')
    expect((wrapper.get('[data-test="playground-step"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-continue"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-end"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-reset"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-test="playground-undo"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows parse-time step errors in state history when no trace is available', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = mount(App)
    await wrapper.get('[data-test="playground-rules"]').setValue('^(?<a>\\d+),(?<b>\\d+)$ ::! nope a b')
    await wrapper.get('[data-test="playground-state"]').setValue('1,2')

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
    expect(diffs.text()).toContain('#1 row 1')
    expect(diffs.text()).toContain('^(?<a>\\d+),(?<b>\\d+)$ ::! nope a b')
    expect(diffs.text()).toContain("Line 1: Unknown builtin 'nope'")
    expect(diffs.find('.state-diff-error').exists()).toBe(true)
  })

  it('shows matched rules in state history even when state does not change', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = mount(App)
    await wrapper.get('[data-test="playground-rules"]').setValue('^done$ ::> stdout ok\\n')
    await wrapper.get('[data-test="playground-state"]').setValue('done')

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
    expect(diffs.text()).toContain('#1 row 1')
    expect(diffs.text()).toContain('^done$ ::> stdout ok\\n')
    expect(diffs.text()).toContain('matched without state change')
  })

  it('shows compact changed context for long state diffs below State', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = mount(App)
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
    expect(diffs.text()).toContain('#4 row 1')
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
    const wrapper = mount(App)
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
    expect(entries[0].text()).toContain('#0 row 0')
    expect(entries[0].text()).toContain('initial state')
    expect(entries[1].text()).toContain('#1 row 1')
    expect(entries[1].text()).toContain('^start$ ::= middle')
    expect(entries[2].text()).toContain('#2 row 2')
    expect(entries[2].text()).toContain('^middle$ ::= done')
    expect(mockedRunWithWorker.mock.calls[0][0].stepLimit).toBe(1)
  })

  it('ends a run in one worker call and appends only a collapsed final history row', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = mount(App)
    await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle\n^middle$ ::= done')
    await wrapper.get('[data-test="playground-state"]').setValue('start')

    await wrapper.get('[data-test="playground-max-steps-100000"]').trigger('click')
    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'done',
      evalCount: 3,
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-end"]').trigger('click')
    await flush()

    const request = mockedRunWithWorker.mock.calls[0][0]
    expect(request.stepLimit).toBe(100000)
    expect(request.maxEvals).toBe(100000)
    expect(request.trace).toBe(false)
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'done')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('exited 0')
    const entries = wrapper.findAll('.state-diff-row')
    expect(entries).toHaveLength(2)
    expect(entries[0].text()).toContain('#0 row 0')
    expect(entries[1].text()).toContain('#3 row 0')
    expect(entries[1].text()).toContain('end: skipped intermediate states')
    expect(entries[1].text()).toContain('-start')
    expect(entries[1].text()).toContain('+done')
    expect(wrapper.get('[data-test="playground-diffs"]').text()).not.toContain('^start$ ::= middle')
    expect(wrapper.get('[data-test="playground-rules"]').attributes('data-current-match-line')).toBeUndefined()
  })

  it('uses media controls for play and stop', async () => {
    vi.useFakeTimers()
    try {
      window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
      const wrapper = mount(App)
      await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle\n^middle$ ::= done')
      await wrapper.get('[data-test="playground-state"]').setValue('start')

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

      expect(wrapper.get('[data-test="playground-continue"]').text()).toBe('')
      expect(wrapper.get('[data-test="playground-continue"]').attributes('aria-label')).toBe('Play')
      expect((wrapper.get('[data-test="playground-continue"]').element as HTMLButtonElement).disabled).toBe(true)
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
    const wrapper = mount(App)
    await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle\n^middle$ ::= done\n^middle$ ::= branch')
    await wrapper.get('[data-test="playground-state"]').setValue('start')

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
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'done')

    await entries()[0].trigger('click')
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'start')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('checkpoint initial')
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
    expect(entries()[0].text()).toContain('#0 row 0')
    expect(entries()[1].text()).toContain('#1 row 1')
    expect(entries()[2].text()).toContain('#3 row 3')
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'branch')

    await wrapper.get('[data-test="playground-reset"]').trigger('click')
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'start')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('checkpoint initial')
    expect(entries()[0].attributes('data-selected')).toBe('true')
  })

  it('keeps resource output as an append-only transcript across steps', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = mount(App)
    await wrapper.get('[data-test="playground-rules"]').setValue('^a$ ::> stdout A\\\\n\n^$ ::= b\n^b$ ::> stdout B\\\\n')
    await wrapper.get('[data-test="playground-state"]').setValue('a')

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

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'B\n',
      stderr: '',
      state: '',
      resourceLogs: [{ name: 'stdout', reads: [], writes: ['B\n'], errors: [], remainingInputText: '', outputText: 'B\n' }],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[1][0].input).toBe('')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'A\nB\n')
    expect(wrapper.get('[data-test="resource-output-stdout"]').attributes('data-attention')).toBe('output')
  })

  it('step pauses at resource reads and submit resumes automatically', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/guess-number/guess-number.tpp')
    const wrapper = mount(App, { attachTo: document.body })

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: 'ERR:resource:random:pending_input:random',
      errors: 'ERR:resource:random:pending_input:random',
      state: 'SECRET<@RANDOM_NUMBER@>',
      resourceLogs: [
        { name: 'random', reads: [], writes: [], errors: ['pending_input:random'], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
      ],
    })

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('waiting for random')
    expect((wrapper.get('[data-test="resource-submit-random"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="resource-submit-stdin"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.get('[data-test="resource-input-random"]').attributes('data-attention')).toBeUndefined()
    expect(document.activeElement).toBe(wrapper.get('[data-test="resource-input-random"]').element)
    expect(mockedRunWithWorker.mock.calls[0][0].resources.find(resource => resource.name === 'random')).toEqual({ name: 'random', inputText: '', readError: undefined })

    await wrapper.get('[data-test="resource-input-random"]').setValue('7')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: 'Guess:\n',
      stderr: '',
      error: 'ERR:resource:stdin:pending_input:stdin',
      errors: 'ERR:resource:stdin:pending_input:stdin',
      state: 'GUESS<7|@USER_GUESS@>',
      resourceLogs: [
        { name: 'random', reads: ['7'], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: ['Guess:\n'], errors: [], remainingInputText: '', outputText: 'Guess:\n' },
        { name: 'stdin', reads: [], writes: [], errors: ['pending_input:stdin'], remainingInputText: '', outputText: '' },
      ],
    })

    await wrapper.get('[data-test="resource-submit-random"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[1][0].resources.find(resource => resource.name === 'random')).toEqual({ name: 'random', inputText: '7', readError: undefined })
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'GUESS<7|@USER_GUESS@>')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Guess:\n')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('waiting for stdin')
    expect((wrapper.get('[data-test="resource-submit-random"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-test="resource-submit-stdin"]').element as HTMLButtonElement).disabled).toBe(false)
    expect(wrapper.get('[data-test="resource-output-stdout"]').attributes('data-attention')).toBe('output')
    expect(wrapper.get('[data-test="resource-input-random"]').attributes('data-attention')).toBe('input')
    expect(wrapper.get('[data-test="resource-input-stdin"]').attributes('data-attention')).toBeUndefined()

    await wrapper.get('[data-test="resource-input-stdin"]').setValue('x')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: 'Please enter digits only.\nGuess:\n',
      stderr: '',
      error: 'ERR:resource:stdin:pending_input:stdin',
      errors: 'ERR:resource:stdin:pending_input:stdin',
      state: 'GUESS<7|@USER_GUESS@>',
      resourceLogs: [
        { name: 'stdin', reads: ['x'], writes: [], errors: ['pending_input:stdin'], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: ['Please enter digits only.\nGuess:\n'], errors: [], remainingInputText: '', outputText: 'Please enter digits only.\nGuess:\n' },
      ],
    })

    await wrapper.get('[data-test="resource-submit-stdin"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[2][0].resources.find(resource => resource.name === 'stdin')).toEqual({ name: 'stdin', inputText: 'x', readError: undefined })
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Guess:\nPlease enter digits only.\nGuess:\n')
    expect(wrapper.get('[data-test="resource-input-stdin"]').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('waiting for stdin')
  })

  it('filters manifest test cases by path or case name without searching input text', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = mount(App, { attachTo: document.body })
    await wrapper.get('[data-test="test-case-command-trigger"]').trigger('click')
    await flush()
    const input = wrapper.get('[data-test="test-case-command-input"]')

    await input.setValue('closure_binding_flattening zero arg')
    expect(wrapper.findAll('[data-test="test-case-option"]').length).toBeGreaterThan(0)
    expect(wrapper.get('[data-test="test-case-option-path"]').text()).toContain('closure_binding_flattening.toml')
    expect(wrapper.get('[data-test="test-case-option-name"]').text()).toContain('zero arg')
    expect(wrapper.get('[data-test="test-case-option-input-preview"]').text()).toContain('fn')

    await input.setValue('source row beginning with hash')
    expect(wrapper.findAll('[data-test="test-case-option"]').length).toBeGreaterThan(0)
    expect(wrapper.get('[data-test="test-case-option-path"]').text()).toContain('source_hash_rule.toml')
    expect(wrapper.get('[data-test="test-case-option-name"]').text()).toContain('source row beginning with hash can be a rule')

    await input.setValue('100')
    expect(wrapper.find('[data-test="test-case-option"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="test-case-command-empty"]').text()).toContain('No test cases found')
  })

  it('selecting a manifest test case loads rules, state, and resources without running', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = mount(App, { attachTo: document.body })

    await wrapper.get('[data-test="test-case-command-trigger"]').trigger('click')
    await flush()
    await wrapper.get('[data-test="test-case-command-input"]').setValue('zero arg closure call still evaluates body')
    await wrapper.get('[data-test="test-case-option"]').trigger('click')
    await flush()

    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toContain('VPRIM')
    expect((wrapper.get('[data-test="playground-state"]').element as HTMLTextAreaElement).value).toBe('((fn () 7))')
    expect(mockedRunWithWorker).not.toHaveBeenCalled()
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('idle')
    expect(wrapper.find('[data-test="fixture-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="terminal"]').exists()).toBe(false)
  })

  it('selecting a top-level manifest test preserves exact source rows in rules', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = mount(App, { attachTo: document.body })

    await wrapper.get('[data-test="test-case-command-trigger"]').trigger('click')
    await flush()
    await wrapper.get('[data-test="test-case-command-input"]').setValue('source row beginning with hash')
    await wrapper.get('[data-test="test-case-option"]').trigger('click')
    await flush()

    const loadedSource = (wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value
    expect(loadedSource).toContain('#x ::= y')
    expect(loadedSource).toContain('^y$ ::> stdout source-row-rule\\n')
    expect((wrapper.get('[data-test="playground-state"]').element as HTMLTextAreaElement).value).toBe('#x')
    expect(wrapper.get('[data-test="test-case-command-current"]').text()).toContain('source_hash_rule.toml')
  })

  it('derives resource sections from playground rules and keeps resource inputs gated by requests', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/guess-number/guess-number.tpp')
    const wrapper = mount(App)

    expect(wrapper.get('[data-test="resource-section-random"]').text()).toContain('random')
    expect(wrapper.get('[data-test="resource-section-random"]').text()).not.toContain('read')
    expect(wrapper.get('[data-test="resource-section-stdout"]').text()).not.toContain('write')
    expect(wrapper.get('[data-test="resource-input-random"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="resource-input-stdin"]').element.tagName).toBe('TEXTAREA')
    expect((wrapper.get('[data-test="resource-submit-random"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-test="resource-submit-stdin"]').element as HTMLButtonElement).disabled).toBe(true)
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
      { name: 'stdout', inputText: '', readError: undefined },
      { name: 'stdin', inputText: '', readError: undefined },
      { name: 'stderr', inputText: '', readError: undefined },
      { name: 'random', inputText: '', readError: undefined },
    ])
    expect(mockedRunWithWorker.mock.calls[0][0].procs).toBeUndefined()
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Guess:\nPlease enter digits only.\nGuess:\nToo low.\nGuess:\nToo high.\nGuess:\nCorrect!\n')
    expect(wrapper.get('[data-test="resource-input-stdin"]').element).toHaveProperty('value', 'x\n3\n8\n7')
    expect(wrapper.get('[data-test="resource-input-random"]').element).toHaveProperty('value', '7')
  })

  it('submit resumes with the last step or continue command', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/echo/echo.tpp')
    const wrapper = mount(App, { attachTo: document.body })

    await wrapper.get('[data-test="resource-input-stdin"]').setValue('Ada')
    expect(wrapper.find('[data-test="stdin-send"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="stdin-queue"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="resource-ready-stdin"]').exists()).toBe(false)

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: 'ERR:resource:stdin:pending_input:stdin',
      errors: 'ERR:resource:stdin:pending_input:stdin',
      state: 'read',
      resourceLogs: [
        { name: 'stdin', reads: [], writes: [], errors: ['pending_input:stdin'], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stderr', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
      ],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[0][0].input).toBe('read')
    expect(mockedRunWithWorker.mock.calls[0][0].resources.find(resource => resource.name === 'stdin')).toEqual({ name: 'stdin', inputText: '', readError: undefined })
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'read')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('waiting for stdin')
    expect(document.activeElement).toBe(wrapper.get('[data-test="resource-input-stdin"]').element)

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'got:Ada',
      trace: [{ step: 1, ruleIndex: 1, sourcePath: 'examples/echo/echo.tpp', lineNumber: 8, operator: '::<', lhs: '@IN@', matchStart: 4, matchEnd: 8, groups: {}, stateBefore: 'got:@IN@', replacement: 'Ada', stateAfter: 'got:Ada' }],
      resourceLogs: [
        { name: 'stdin', reads: ['Ada'], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stderr', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
      ],
    })
    await wrapper.get('[data-test="resource-submit-stdin"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[1][0].stepLimit).toBe(1)
    expect(mockedRunWithWorker.mock.calls[1][0].resources.find(resource => resource.name === 'stdin')).toEqual({ name: 'stdin', inputText: 'Ada', readError: undefined })
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'got:Ada')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', '')

    await wrapper.get('[data-test="resource-input-stdin"]').setValue('Grace')
    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: 'ERR:resource:stdin:pending_input:stdin',
      errors: 'ERR:resource:stdin:pending_input:stdin',
      state: 'got:@IN@',
      resourceLogs: [{ name: 'stdin', reads: [], writes: [], errors: ['pending_input:stdin'], remainingInputText: '', outputText: '' }],
    })
    await wrapper.get('[data-test="playground-continue"]').trigger('click')
    await flush()

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Grace\n',
      stderr: '',
      state: '',
      resourceLogs: [
        { name: 'stdin', reads: ['Grace'], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: ['Grace\n'], errors: [], remainingInputText: '', outputText: 'Grace\n' },
      ],
    })
    await wrapper.get('[data-test="resource-submit-stdin"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[3][0].stepLimit).toBe(1)
    expect(wrapper.get('[data-test="resource-input-stdin"]').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Grace\n')
    expect(wrapper.find('[data-test="terminal"]').exists()).toBe(false)
  })

  it('renders /playground in compact mode when requested by query param', () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp&mode=compact&section=trace')
    const wrapper = mount(App, { attachTo: document.body })

    expect(wrapper.find('[data-test="playground-header"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="playground-compact-surface"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="embed-section-panel"]').text()).toContain('trace')
  })

  it('renders /embed without the page header and starts on the requested section/tab', async () => {
    window.history.pushState({}, '', '/embed?file=./examples/hello/hello.tpp&section=state&tab=stderr&editable=0')
    const wrapper = mount(App, { attachTo: document.body })

    expect(wrapper.find('[data-test="playground-header"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="playground-compact-surface"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="embed-section-panel"]').text()).toContain('state')
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'START')
    expect(wrapper.get('[data-test="embed-open-full"]').attributes('href')).toContain('/playground?file=.%2Fexamples%2Fhello%2Fhello.tpp')
  })

  it('honors header=1 for embed routes without showing the picker by default', () => {
    window.history.pushState({}, '', '/embed?file=./examples/hello/hello.tpp&header=1')
    const wrapper = mount(App, { attachTo: document.body })

    expect(wrapper.find('[data-test="playground-header"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="test-selector"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="playground-compact-surface"]').exists()).toBe(true)
  })

  it('runs an output-focused embed through the shared Go-WASM path', async () => {
    window.history.pushState({}, '', '/embed?file=./examples/hello/hello.tpp&section=output&tab=stdout&controls=run')
    const wrapper = mount(App, { attachTo: document.body })

    mockedRunWithWorker.mockResolvedValueOnce({ exitCode: 0, stdout: 'Hello from embed!\n', stderr: '', state: '', resourceLogs: [] })
    await wrapper.get('[data-test="embed-run"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
    expect(mockedRunWithWorker.mock.calls[0][0].sourcePath).toBe('examples/hello/hello.tpp')
    expect(mockedRunWithWorker.mock.calls[0][0].stepLimit).toBe(10000)
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Hello from embed!\n')
  })

  it('shows the embed demo route with preset examples and explanations', () => {
    window.history.pushState({}, '', '/embed/demo')
    const wrapper = mount(App, { attachTo: document.body })

    expect(wrapper.text()).toContain('Compact thue++ playground embeds')
    expect(wrapper.text()).toContain('Output-focused runnable snippet')
    expect(wrapper.findAll('[data-test="playground-compact-surface"]').length).toBeGreaterThanOrEqual(3)
  })
})
