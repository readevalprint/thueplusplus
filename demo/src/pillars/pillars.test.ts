import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { parse as parseToml } from 'smol-toml'
import hostsToml from '../../../hosts.toml?raw'
import helloSource from '../../../examples/hello/hello.thue?raw'

vi.mock('@/wasm', () => ({ runWithWorker: vi.fn() }))

import HomePage from '@/pages/HomePage.vue'
import { registryHosts } from '@/hosts'
import { routes } from '@/router'
import { runWithWorker, type DemoRunResult, type DemoTraceEvent } from '@/wasm'

const mockedRun = vi.mocked(runWithWorker)

function registryIds(): string[] {
  const parsed = parseToml(hostsToml) as { host?: { id?: unknown }[] }
  if (!Array.isArray(parsed.host) || parsed.host.length === 0) throw new Error('hosts.toml host must be a non-empty array')
  return parsed.host.map((row, index) => {
    if (typeof row?.id !== 'string' || row.id.length === 0) throw new Error(`hosts.toml host #${index + 1} id is empty`)
    return row.id
  })
}

function traceEvent(partial: Pick<DemoTraceEvent, 'operator' | 'stateBefore' | 'stateAfter' | 'replacement'>): DemoTraceEvent {
  return {
    step: 1,
    ruleIndex: 0,
    sourcePath: 'landing/sandbox.thue',
    lineNumber: 1,
    lhs: '',
    matchStart: 0,
    matchEnd: 0,
    groups: {},
    ...partial,
  }
}

function portableResult(stdout: string): DemoRunResult {
  return {
    exitCode: 0,
    stdout,
    stderr: '',
    state: '\ndone',
    resourceLogs: [
      { name: 'stdin', reads: [], writes: [], errors: [], outputText: '' },
      { name: 'stdout', reads: [], writes: [stdout], errors: [], outputText: stdout },
      { name: 'stderr', reads: [], writes: [], errors: [], outputText: '' },
    ],
    trace: [
      traceEvent({ operator: '::=', stateBefore: 'START', stateAfter: 'hello\ndone', replacement: 'hello\ndone' }),
      traceEvent({ operator: '::>', stateBefore: 'hello\ndone', stateAfter: '\ndone', replacement: '' }),
    ],
  }
}

const sandboxResult: DemoRunResult = {
  exitCode: 10,
  stdout: 'in\n',
  stderr: '',
  error: 'Applied step limit (4) exceeded',
  state: 'aa',
  appliedSteps: 4,
  evalCount: 10,
  limit: 'steps',
  metrics: { cost: 12, state_peak: 19 },
  resourceLogs: [
    { name: 'stdin', reads: [], writes: [], errors: [], outputText: '' },
    { name: 'stdout', reads: [], writes: ['in\n'], errors: [], outputText: 'in\n' },
    { name: 'stderr', reads: [], writes: [], errors: [], outputText: '' },
  ],
  trace: [
    traceEvent({ operator: '::>', stateBefore: 'start', stateAfter: '', replacement: '' }),
    traceEvent({ operator: '::>', stateBefore: '', stateAfter: 'ERR:resource:socket', replacement: 'ERR:resource:socket' }),
    traceEvent({ operator: '::=', stateBefore: 'ERR:resource:socket', stateAfter: 'a', replacement: 'a' }),
    traceEvent({ operator: '::=', stateBefore: 'a', stateAfter: 'aa', replacement: 'aa' }),
  ],
}

function succeed(stdout: string): void {
  mockedRun.mockImplementation(async request => {
    if (request.sourcePath === 'landing/sandbox.thue') return sandboxResult
    if (request.sourcePath !== 'examples/hello/hello.thue') throw new Error(`unexpected program ${request.sourcePath}`)
    return portableResult(stdout)
  })
}

async function mountHome() {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push('/')
  await router.isReady()
  const wrapper = mount(HomePage, { global: { plugins: [router] } })
  await flushPromises()
  await flushPromises()
  return wrapper
}

describe('landing pillars', () => {
  beforeEach(() => {
    mockedRun.mockReset()
    succeed('ZZ\n')
  })

  it('renders three pillars under the hero', async () => {
    const wrapper = await mountHome()
    wrapper.get('[data-test="page-hero"]')
    expect(wrapper.get('#portable').get('h2').text()).toBe('portable')
    expect(wrapper.get('#secure-sandbox').get('h2').text()).toBe('secure sandbox')
    expect(wrapper.get('#multi-platform').get('h2').text()).toBe('multi-platform')
    expect(wrapper.findAll('[data-pillar]')).toHaveLength(3)
    expect(wrapper.text()).not.toContain('cannot go on forever')
    expect(wrapper.text()).not.toContain('ordered list of rules')
  })

  it('runs one ruleset and stamps that stdout on every host', async () => {
    const wrapper = await mountHome()
    const rules = wrapper.get('[data-test="portable-ruleset"]')
    expect(wrapper.findAll('[data-test="portable-ruleset"]')).toHaveLength(1)
    expect(rules.element.textContent).toBe(helloSource)
    expect(rules.element.textContent).toBe(readFileSync('../examples/hello/hello.thue', 'utf8'))
    const ids = registryIds()
    const rows = wrapper.findAll('[data-test="portable-host"]')
    expect(rows.map(row => row.attributes('data-host-id'))).toEqual(ids)
    const stdout = rows.map(row => row.get('[data-test="host-stdout"]').element.textContent)
    expect(stdout).toHaveLength(ids.length)
    expect(new Set(stdout)).toEqual(new Set(['ZZ↵']))
    for (const row of rows) expect(row.text()).not.toContain('::=')
    const portable = mockedRun.mock.calls.map(call => call[0]).find(request => request.sourcePath === 'examples/hello/hello.thue')
    if (!portable) throw new Error('portable run was not requested')
    expect(portable.sourceText).toBe(helloSource)
    expect(portable.input).toBe('START')
    expect(portable.trace).toBe(true)
    expect(wrapper.get('[data-test="pillar-portable"]').attributes('data-ok')).toBe('yes')
  })

  it('shows the limit and the bindings for the sandbox run', async () => {
    const wrapper = await mountHome()
    const pillar = wrapper.get('[data-test="pillar-secure-sandbox"]')
    expect(pillar.attributes('data-limit')).toBe('steps')
    expect(pillar.attributes('data-settled')).toBe('yes')
    expect(wrapper.get('[data-test="sandbox-state"]').text()).toBe('aa')
    expect(wrapper.get('[data-test="limit-steps"]').text()).toBe('4/4')
    expect(wrapper.get('[data-test="limit-probes"]').text()).toBe('10/32')
    expect(wrapper.get('[data-test="limit-bytes"]').text()).toBe('19/64')
    expect(wrapper.get('[data-test="steps-meter"]').attributes('data-full')).toBe('yes')
    expect(wrapper.get('[data-test="probes-meter"]').attributes('data-full')).toBe('no')
    expect(wrapper.get('[data-test="bytes-meter"]').attributes('data-full')).toBe('no')
    expect(wrapper.get('[data-test="limit-message"]').text()).toBe('Applied step limit (4) exceeded')
    expect(wrapper.get('[data-test="sandbox-exit"]').text()).toBe('exit 10')
    expect(wrapper.findAll('[data-test="bound-resource"]').map(row => row.attributes('data-resource'))).toEqual(['stdin', 'stdout', 'stderr'])
    expect(wrapper.get('[data-resource="stdout"]').text()).toContain('in↵')
    const refused = wrapper.get('[data-test="unbound-resource"]')
    expect(refused.attributes('data-resource')).toBe('socket')
    expect(refused.attributes('data-bound')).toBe('no')
    const sandbox = mockedRun.mock.calls.map(call => call[0]).find(request => request.sourcePath === 'landing/sandbox.thue')
    if (!sandbox) throw new Error('sandbox run was not requested')
    expect(sandbox.maxSteps).toBe(4)
    expect(sandbox.maxEvals).toBe(32)
    expect(sandbox.maxStateBytes).toBe(64)
    expect(sandbox.trace).toBe(true)
    expect(sandbox.resources).toEqual([])
  })

  it('lists hosts in hosts.toml order', async () => {
    const wrapper = await mountHome()
    const ids = registryIds()
    const tiles = wrapper.findAll('[data-test="registry-host"]')
    expect(tiles.map(tile => tile.attributes('data-host-id'))).toEqual(ids)
    expect(tiles.map(tile => tile.find('span').text())).toEqual(registryHosts.map(host => host.landing))
    expect(ids).toEqual(registryHosts.map(host => host.id))
    const wasm = tiles.find(tile => tile.attributes('data-host-id') === 'wasm')
    if (!wasm) throw new Error('wasm host missing')
    expect(wasm.text()).toContain('js')
    expect(wasm.text()).toContain('wasm')
    expect(tiles).toHaveLength(ids.length)
  })

  it('refuses a portable run whose stdout resource disagrees', async () => {
    mockedRun.mockImplementation(async request => {
      if (request.sourcePath === 'landing/sandbox.thue') return sandboxResult
      return {
        ...portableResult('ZZ\n'),
        stdout: 'nope\n',
      }
    })
    const wrapper = await mountHome()
    expect(wrapper.get('[data-test="pillar-portable"]').attributes('data-ok')).toBe('no')
    expect(wrapper.get('[data-test="pillar-portable"] [data-test="pillar-error"]').text()).toContain('disagree')
    expect(wrapper.get('[data-test="host-stdout"]').text()).toBe('')
  })

  it('shows a failed run instead of a made-up stdout', async () => {
    mockedRun.mockRejectedValue(new Error('worker exploded'))
    const wrapper = await mountHome()
    expect(wrapper.get('[data-test="pillar-portable"]').attributes('data-ok')).toBe('no')
    expect(wrapper.get('[data-test="pillar-secure-sandbox"]').attributes('data-ok')).toBe('no')
    expect(wrapper.findAll('[data-test="pillar-error"]').map(node => node.text())).toEqual(['worker exploded', 'worker exploded'])
    const stdout = wrapper.findAll('[data-test="host-stdout"]').map(node => node.element.textContent)
    expect(new Set(stdout)).toEqual(new Set(['']))
    expect(wrapper.find('[data-test="sandbox-meters"]').exists()).toBe(false)
  })

  it('does not say RE2', async () => {
    const wrapper = await mountHome()
    expect(wrapper.text()).not.toContain('RE2')
    expect(wrapper.text()).not.toContain('re2')
  })

  it('reuses the shared Rex', async () => {
    const wrapper = await mountHome()
    for (const id of ['pillar-portable', 'pillar-secure-sandbox', 'pillar-multi-platform']) {
      expect(wrapper.get(`[data-test="${id}"]`).find('[data-test="rex-mark"]').exists()).toBe(true)
    }
  })
})
