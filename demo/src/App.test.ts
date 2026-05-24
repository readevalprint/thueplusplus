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
    expect(wrapper.get('[data-test="playground-rules"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="playground-state"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="resource-sections"]').element.tagName).toBe('SECTION')
    expect(wrapper.find('[data-test="playground-reset"]').exists()).toBe(false)
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
      resourceLogs: [
        { name: 'stdin', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: ['Hello, World!\n'], errors: [], remainingInputText: '', outputText: 'Hello, World!\n' },
        { name: 'stderr', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
      ],
    })
    await wrapper.get('[data-test="playground-run"]').trigger('click')
    await flush()
    expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Hello, World!\n')
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
    await wrapper.get('[data-test="playground-run"]').trigger('click')
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

  it('playground reads pop directly from the stdin textarea', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/echo/echo.tpp')
    const wrapper = mount(App)

    await wrapper.get('[data-test="resource-input-stdin"]').setValue('Ada')
    expect(wrapper.find('[data-test="stdin-send"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="stdin-queue"]').exists()).toBe(false)

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Ada\n',
      stderr: '',
      resourceLogs: [
        { name: 'stdin', reads: ['Ada'], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: ['Ada\n'], errors: [], remainingInputText: '', outputText: 'Ada\n' },
        { name: 'stderr', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
      ],
    })
    await wrapper.get('[data-test="playground-run"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[0][0].input).toBe('')
    expect(mockedRunWithWorker.mock.calls[0][0].resources.find(resource => resource.name === 'stdin')).toEqual({ name: 'stdin', inputText: 'Ada', readError: undefined })
    expect(wrapper.get('[data-test="resource-input-stdin"]').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Ada\n')
    expect(wrapper.find('[data-test="terminal"]').exists()).toBe(false)
  })
})
