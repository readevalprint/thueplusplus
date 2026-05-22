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
    mockedRunWithWorker.mockReset()
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('mounts as a real interpreter workbench and runs the hello stdout example', async () => {
    const wrapper = mount(App)

    expect(wrapper.text()).toContain('Run thue++ in your browser')
    expect(wrapper.text()).toContain('Real Go-WASM interpreter')
    expect(wrapper.text()).toContain('No JavaScript rule evaluator')
    expect(wrapper.get('[data-test="status-runtime"]').text()).toContain('Go-WASM')
    expect(wrapper.get('[data-example-id="hello"]').text()).toContain('stdout')

    const request = await runDemo(wrapper, { exitCode: 0, stdout: 'Hello from Go-WASM!\n', stderr: '', coverageTSV: '' })

    expect(request.sourcePath).toBe('hello.tpp')
    expect(request.sourceText).toContain('stdout Hello from Go-WASM!')
    expect(request.coverage).toBe(true)
    expect(wrapper.get('[data-test="status-exit-code"]').text()).toContain('0')
    expect(wrapper.text()).toContain('Hello from Go-WASM!')
  })

  it('passes buffered stdin input to the worker', async () => {
    const wrapper = mount(App)
    await selectExample(wrapper, 'stdin')

    const textareas = wrapper.findAll('textarea')
    await textareas[1].setValue('Grace\n')
    const request = await runDemo(wrapper, { exitCode: 0, stdout: 'hello Grace!\n' })

    expect(request.sourcePath).toBe('stdin-greeting.tpp')
    expect(request.input).toBe('Grace\n')
    expect(request.resources).toEqual([])
    expect(wrapper.text()).toContain('hello Grace!')
  })

  it('presents examples as educational scenario cards', async () => {
    const wrapper = mount(App)

    const cards = wrapper.findAll('[data-test="example-card"]')
    expect(cards.length).toBeGreaterThanOrEqual(7)
    expect(wrapper.get('[data-example-id="resource-echo"]').text()).toContain('Callback resource')
    expect(wrapper.get('[data-example-id="include"]').text()).toContain('Include map')

    await selectExample(wrapper, 'coverage')
    expect(wrapper.get('[data-test="selected-example-summary"]').text()).toContain('Runs with coverage enabled')
    expect(wrapper.get('[data-test="status-coverage"]').text()).toContain('on')
  })

  it('sends custom callback resources and displays read/write logs behind the resources tab', async () => {
    const wrapper = mount(App)
    await selectExample(wrapper, 'resource-echo')

    const request = await runDemo(wrapper, {
      exitCode: 0,
      stdout: 'ping\n',
      resourceLogs: [{ name: 'echo', reads: ['ping'], writes: ['ping'], errors: [] }],
    })

    expect(request.resources).toEqual([{ name: 'echo', readLines: [], echoWrites: true, readError: undefined }])
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
    expect(request.resources).toEqual([{ name: 'sleepy', readLines: [], echoWrites: false, readError: 'timeout' }])
    expect(wrapper.get('[data-test="run-state"]').text()).toContain('error')
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
})
