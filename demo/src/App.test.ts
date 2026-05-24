import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import App from './App.vue'
import { runWithWorker, type DemoRunRequest, type DemoRunResult } from './wasm'

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
    expect(cards.length).toBeGreaterThanOrEqual(7)
    expect(wrapper.get('[data-example-id="resource-echo"]').text()).toContain('callback resource')
    expect(wrapper.get('[data-example-id="include"]').text()).toContain('includes')

    await selectExample(wrapper, 'coverage')
    expect(wrapper.get('[data-test="selected-example-summary"]').text()).toContain('Coverage TSV')
    expect(wrapper.get('[data-test="selected-example-summary"]').text()).toContain('Coverage TSV')
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

  it('passes include-map entries to the worker', async () => {
    const wrapper = mount(App)
    await selectExample(wrapper, 'include')

    const request = await runDemo(wrapper, { exitCode: 0, stdout: 'included from map\n' })

    expect(request.sourcePath).toBe('main.tpp')
    expect(request.sourceText).toContain('@include lib/greet.tpp')
    expect(request.include).toEqual({ 'lib/greet.tpp': '^hello$ ::> stdout included from map\\n' })
    expect(wrapper.text()).toContain('included from map')
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

    expect(wrapper.text()).toContain('Playground')
    expect(wrapper.text()).toContain('State')
    expect(wrapper.get('[data-test="playground-rules"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="playground-state"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="playground-step"]').text()).toContain('Step')
    expect(wrapper.get('[data-test="resource-sections"]').element.tagName).toBe('SECTION')
    expect(wrapper.find('[data-test="playground-reset"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="playground-run"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="playground-auto"]').element).toHaveProperty('checked', false)
    expect(wrapper.find('[data-test="stdio-panel"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="resource-section-stdin"]').text()).toContain('stdin')
    expect(wrapper.get('[data-test="resource-section-stdout"]').text()).toContain('stdout')
    expect(wrapper.get('[data-test="resource-section-stderr"]').text()).toContain('stderr')
    expect(wrapper.get('[data-test="resource-input-stdin"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="resource-output-stderr"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.findAll('[data-slot="resizable-panel"]').length).toBe(3)
    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toContain('Hello, World')

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
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Hello, World!\n')
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
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('stepped')
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
    const wrapper = mount(App)
    const input = wrapper.get('[data-test="test-case-command-input"]')

    await input.setValue('closure_binding_flattening zero arg')
    expect(wrapper.findAll('[data-test="test-case-option"]').length).toBeGreaterThan(0)
    expect(wrapper.get('[data-test="test-case-option-path"]').text()).toContain('closure_binding_flattening.toml')
    expect(wrapper.get('[data-test="test-case-option-name"]').text()).toContain('zero arg')
    expect(wrapper.get('[data-test="test-case-option-input-preview"]').text()).toContain('fn')

    await input.setValue('100')
    expect(wrapper.find('[data-test="test-case-option"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="test-case-command-empty"]').text()).toContain('No test cases found')
  })

  it('selecting a manifest test case loads its state and runs through unified resources', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.tpp')
    const wrapper = mount(App)
    mockedRunWithWorker.mockResolvedValueOnce({ exitCode: 0, stdout: '7\n', stderr: '', resourceLogs: [{ name: 'stdin', reads: [], writes: [], errors: [] }] })

    await wrapper.get('[data-test="test-case-command-input"]').setValue('zero arg closure call still evaluates body')
    await wrapper.get('[data-test="test-case-option"]').trigger('mousedown')
    await flush()

    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toContain('Lisp')
    expect((wrapper.get('[data-test="playground-state"]').element as HTMLTextAreaElement).value).toBe('((fn () 7))')
    expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', '7\n')
    expect(wrapper.find('[data-test="fixture-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="terminal"]').exists()).toBe(false)
  })

  it('derives resource sections from playground rules and uses raw input buffers', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/guess-number/guess-number.tpp')
    const wrapper = mount(App)

    expect(wrapper.get('[data-test="resource-section-random"]').text()).toContain('random')
    expect(wrapper.get('[data-test="resource-section-random"]').text()).toContain('read')
    expect(wrapper.get('[data-test="resource-section-stdout"]').text()).toContain('write')
    expect(wrapper.find('[data-test="playground-js-procs"]').exists()).toBe(false)

    await wrapper.get('[data-test="resource-input-random"]').setValue('7')
    await wrapper.get('[data-test="resource-input-stdin"]').setValue('x\n3\n8\n7')
    await wrapper.get('[data-test="resource-submit-random"]').trigger('click')
    await wrapper.get('[data-test="resource-submit-stdin"]').trigger('click')
    await wrapper.get('[data-test="playground-auto"]').setValue(true)

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
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[0][0].resources).toEqual([
      { name: 'stdin', inputText: 'x\n3\n8\n7', readError: undefined },
      { name: 'stdout', inputText: '', readError: undefined },
      { name: 'stderr', inputText: '', readError: undefined },
      { name: 'random', inputText: '7', readError: undefined },
    ])
    expect(mockedRunWithWorker.mock.calls[0][0].procs).toBeUndefined()
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Guess:\nPlease enter digits only.\nGuess:\nToo low.\nGuess:\nToo high.\nGuess:\nCorrect!\n')
    expect(wrapper.get('[data-test="resource-input-stdin"]').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-test="resource-input-random"]').element).toHaveProperty('value', '')
  })

  it('submit resumes through one Step unless auto is checked', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/echo/echo.tpp')
    const wrapper = mount(App, { attachTo: document.body })

    await wrapper.get('[data-test="resource-input-stdin"]').setValue('Ada')
    expect(wrapper.find('[data-test="stdin-send"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="stdin-queue"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="resource-ready-stdin"]').text()).toContain('not ready')

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

    await wrapper.get('[data-test="playground-auto"]').setValue(true)
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
    await wrapper.get('[data-test="playground-step"]').trigger('click')
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

    expect(mockedRunWithWorker.mock.calls[3][0].stepLimit).toBeUndefined()
    expect(wrapper.get('[data-test="resource-input-stdin"]').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Grace\n')
    expect(wrapper.find('[data-test="terminal"]').exists()).toBe(false)
  })
})
