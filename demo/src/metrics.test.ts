import { describe, expect, it } from 'vitest'
import {
  HistoryError,
  assertEnvironment,
  benchmarkCommits,
  changeAxis,
  collapseRuns,
  formatTimesGo,
  guestName,
  guestRuleChart,
  history,
  hostRatio,
  hostRatioSeries,
  loadHistory,
  pointAt,
  rangeLabel,
  taskCommits,
} from './metrics'

const names = new Map([
  ['forth', 'Forth'],
  ['lisp', 'Lisp'],
  ['brainfuck', 'Brainfuck'],
  ['basic', 'Basic'],
])
const order = ['forth', 'lisp', 'brainfuck', 'basic']
const LAST_RULE = '09744fa8d495101d1c5a3d80d5872a21d6164548'
const LAST_REWRITE = 'ee6ce4482dfd007937dd310f426b810f4c62c6ac'

describe('metrics history', () => {
  it('loads the committed series', () => {
    expect(history.schemaVersion).toBe(1)
    expect(history.entries.length).toBeGreaterThan(1)
    const rules = guestRuleChart(history, order, names)
    const latest = rules.commits[rules.commits.length - 1]
    expect(latest.commit).toBe(LAST_RULE)
    expect(latest.author).toContain('cursor[bot]')
    const tip = history.entries[history.entries.length - 1].commit
    const forth = rules.series.find(series => series.id === 'forth')
    const forthPoint = forth?.points.find(point => point.commit === '61ec3540637188ef0bc7b116c7015ade908c7926')
    expect(forthPoint).toEqual({ commit: '61ec3540637188ef0bc7b116c7015ade908c7926', until: tip, value: 86 })
    expect(pointAt(forth?.points ?? [], latest.commit, rules.order)?.value).toBe(86)
    expect(pointAt(rules.series.find(series => series.id === 'lisp')?.points ?? [], latest.commit, rules.order)?.value).toBe(441)
    expect(pointAt(rules.series.find(series => series.id === 'brainfuck')?.points ?? [], latest.commit, rules.order)?.value).toBe(68)
    expect(pointAt(rules.series.find(series => series.id === 'basic')?.points ?? [], latest.commit, rules.order)?.value).toBe(62)
    expect(rangeLabel(forthPoint!)).toBe(`61ec35406371…${tip.slice(0, 12)} · 86`)

    const tasks = taskCommits(history, order, names)
    const latestTasks = tasks[tasks.length - 1]
    expect(latestTasks.guests.find(guest => guest.id === 'forth')).toMatchObject({ passCount: 9, failCount: 0, unsupportedCount: 1, stepCount: 6256 })
    expect(latestTasks.guests.find(guest => guest.id === 'lisp')).toMatchObject({ passCount: 10, failCount: 0, stepCount: 76749 })
    expect(latestTasks.guests.find(guest => guest.id === 'brainfuck')).toMatchObject({ passCount: 1, unsupportedCount: 9, stepCount: 83 })
    expect(latestTasks.guests.find(guest => guest.id === 'basic')).toMatchObject({ passCount: 4, unsupportedCount: 6, stepCount: 4644 })
    const mixed = tasks.find(commit => commit.commit.startsWith('09744fa8d495'))
    expect(mixed?.guests.find(guest => guest.id === 'brainfuck')).toMatchObject({ passCount: 9, failCount: 1, stepCount: 28722 })

    const benches = benchmarkCommits(history, 'rewrite')
    const latestBench = benches[benches.length - 1]
    expect(latestBench.commit).toBe(LAST_REWRITE)
    expect(latestBench.appliedSteps).toBe(10000)
    expect(latestBench.probes).toBe(10002)
    expect(latestBench.hosts.map(host => [host.id, host.environment, host.durationMs, host.exitCode, host.memoryBytes])).toEqual([
      ['python', 'python', 721, 0, null],
      ['go', 'go native', 607, 0, null],
      ['wasm', 'wasm (node)', 1408, 0, null],
      ['rust', 'rust', 468, 0, null],
      ['cpp', 'cpp', 624, 0, null],
    ])
    expect(latestBench.memoryCapBytes).toBe(268435456)
    const hosts = hostRatioSeries(benches, 'durationMs')
    const wasm = hosts.find(series => series.id === 'wasm')?.points.at(-1)
    const cpp = hosts.find(series => series.id === 'cpp')?.points.at(-1)
    expect(wasm).toEqual({ commit: LAST_REWRITE, until: LAST_REWRITE, value: 1408 / 607 })
    expect(cpp).toEqual({ commit: LAST_REWRITE, until: LAST_REWRITE, value: 624 / 607 })
    expect(formatTimesGo(wasm!.value)).toBe('2.3× go')
    expect(formatTimesGo(1)).toBe('1× go')
    expect(formatTimesGo(10.74)).toBe('10.7× go')
    expect(hosts.find(series => series.id === 'go')?.points.at(-1)?.value).toBe(1)
    expect(guestName('lisp', names)).toBe('Lisp')
    expect(guestName('forth', new Map())).toBe('Forth')
  })

  it('leaves a gap when an older commit omits a host', () => {
    const older = 'a'.repeat(40)
    const newer = 'b'.repeat(40)
    const loaded = loadHistory({
      schema_version: 1,
      entries: [
        benchEntry(older, '2026-01-01T00:00:00Z', ['python', 'go', 'wasm'], 10),
        benchEntry(newer, '2026-01-02T00:00:00Z', ['python', 'go', 'wasm', 'rust'], 10),
      ],
    })
    const commits = benchmarkCommits(loaded, 'rewrite')
    const series = hostRatioSeries(commits, 'durationMs')
    expect(series.map(item => item.id)).toEqual(['python', 'go', 'wasm', 'rust'])
    expect(series.map(item => item.label)).toEqual(['python', 'go native', 'wasm (node)', 'rust'])
    expect(series.find(item => item.id === 'rust')?.points).toEqual([{ commit: newer, until: newer, value: 1 }])
    expect(series.find(item => item.id === 'python')?.points).toEqual([{ commit: older, until: newer, value: 1 }])
    expect(hostRatio(commits[1], 'rust', 'memoryBytes')).toBeNull()
    expect(() => loadHistory({
      schema_version: 1,
      entries: [benchEntry('c'.repeat(40), '2026-01-03T00:00:00Z', ['erlang'], 10)],
    })).toThrow(/unknown benchmark host/)
  })

  it('keeps equal values across a gap as two runs', () => {
    const first = 'a'.repeat(40)
    const gap = 'b'.repeat(40)
    const last = 'c'.repeat(40)
    const open = benchEntry(first, '2026-01-01T00:00:00Z', ['python', 'go', 'rust'], 10)
    const middle = benchEntry(gap, '2026-01-02T00:00:00Z', ['python', 'go'], 10)
    const close = benchEntry(last, '2026-01-03T00:00:00Z', ['python', 'go', 'rust'], 10)
    setDuration(open, 'python', 20)
    setDuration(middle, 'python', 24)
    setDuration(close, 'python', 20)
    const loaded = loadHistory({ schema_version: 1, entries: [open, middle, close] })
    const commits = benchmarkCommits(loaded, 'rewrite')
    const series = hostRatioSeries(commits, 'durationMs')
    expect(series.find(item => item.id === 'python')?.points).toEqual([
      { commit: first, until: first, value: 2 },
      { commit: gap, until: gap, value: 2.4 },
      { commit: last, until: last, value: 2 },
    ])
    expect(series.find(item => item.id === 'rust')?.points).toEqual([
      { commit: first, until: first, value: 1 },
      { commit: last, until: last, value: 1 },
    ])
    expect(series.find(item => item.id === 'go')?.points).toEqual([
      { commit: first, until: last, value: 1 },
    ])
    expect(changeAxis(commits, series).map(commit => commit.commit)).toEqual([first, gap, last])
    open.benchmarks[0].hosts.find(host => host.id === 'go')!.memory_bytes = 0
    open.benchmarks[0].hosts.find(host => host.id === 'python')!.memory_bytes = 1000
    const zeroMemory = loadHistory({ schema_version: 1, entries: [open] })
    expect(hostRatio(benchmarkCommits(zeroMemory, 'rewrite')[0], 'python', 'memoryBytes')).toBeNull()
    expect(collapseRuns([
      { commit: first, value: 4 },
      { commit: gap, value: 4 },
      { commit: last, value: 9 },
    ])).toEqual([
      { commit: first, until: gap, value: 4 },
      { commit: last, until: last, value: 9 },
    ])
    const zeroGo = benchEntry('e'.repeat(40), '2026-01-05T00:00:00Z', ['python', 'go'], 10)
    zeroGo.benchmarks[0].hosts[1].duration_ms = 0
    const loadedZero = loadHistory({ schema_version: 1, entries: [zeroGo] })
    expect(() => hostRatio(benchmarkCommits(loadedZero, 'rewrite')[0], 'python', 'durationMs')).toThrow(/duration ratio/)
  })

  it('rejects a document that breaks the schema', () => {
    expect(() => loadHistory({ schema_version: 2, entries: [] })).toThrow(HistoryError)
    expect(() => loadHistory({ schema_version: 2, entries: [] })).toThrow(/schema_version/)
    const older = blank('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '2026-01-02T00:00:00Z')
    const newer = blank('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '2026-01-01T00:00:00Z')
    expect(() => loadHistory({ schema_version: 1, entries: [older, newer] })).toThrow(/out of order/)
    const { machine: _machine, ...missingMachine } = benchEntry('e'.repeat(40), '2026-01-05T00:00:00Z', ['python'], 10)
    expect(_machine).toBeNull()
    expect(() => loadHistory({ schema_version: 1, entries: [missingMachine] })).toThrow(/machine/)
    expect(() => assertEnvironment('go', 'wasm (node)')).toThrow(/go native/)
    expect(() => assertEnvironment('wasm', 'go native')).toThrow(/go native/)
    const negative = benchEntry('d'.repeat(40), '2026-01-04T00:00:00Z', ['python'], 10)
    negative.benchmarks[0].hosts[0].memory_bytes = -1
    expect(() => loadHistory({ schema_version: 1, entries: [negative] })).toThrow(/memory_bytes/)
  })
})

function setDuration(entry: ReturnType<typeof benchEntry>, host: string, duration: number): void {
  const row = entry.benchmarks[0].hosts.find(item => item.id === host)
  if (!row) throw new Error(`missing ${host}`)
  row.duration_ms = duration
}

function benchEntry(commit: string, timestamp: string, hosts: string[], duration: number) {
  return {
    commit,
    author: 'Ada <ada@example.com>',
    timestamp,
    machine: null as null | { os: string, release: string, arch: string, cpu: string, cpus: number },
    guests: {},
    tasks: null,
    benchmarks: [{
      id: 'rewrite',
      steps: 10000,
      probes: 10002,
      max_steps: 15000,
      max_evals: 50000,
      max_state_bytes: 16384,
      timeout_seconds: 30,
      memory_cap_bytes: 268435456,
      hosts: hosts.map(host => ({
        id: host,
        environment: { python: 'python', go: 'go native', wasm: 'wasm (node)', rust: 'rust', cpp: 'cpp' }[host],
        duration_ms: duration,
        memory_bytes: null as number | null,
        exit_code: 0,
      })),
    }],
  }
}

function blank(commit: string, timestamp: string) {
  return {
    commit,
    author: 'Ada <ada@example.com>',
    timestamp,
    machine: null as null | { os: string, release: string, arch: string, cpu: string, cpus: number },
    guests: {},
    tasks: null,
    benchmarks: null,
  }
}
