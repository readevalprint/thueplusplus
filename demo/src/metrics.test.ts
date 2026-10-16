import { describe, expect, it } from 'vitest'
import {
  HistoryError,
  assertEnvironment,
  benchmarkCommits,
  changeAxis,
  collapseRuns,
  guestName,
  guestRuleChart,
  history,
  hostDurationSeries,
  loadHistory,
  placeChart,
  pointAt,
  rangeLabel,
  stepPath,
  taskCommits,
} from './metrics'

const names = new Map([
  ['forth', 'Forth'],
  ['lisp', 'Lisp'],
  ['brainfuck', 'Brainfuck'],
  ['basic', 'Basic'],
])
const order = ['forth', 'lisp', 'brainfuck', 'basic']
const LAST_BENCH = '9d34a9a0cc75defe0ef1997234ec0765f9644159'
const LAST_RULE = '09744fa8d495101d1c5a3d80d5872a21d6164548'

describe('metrics history', () => {
  it('loads the committed series', () => {
    expect(history.schemaVersion).toBe(1)
    expect(history.entries.length).toBeGreaterThan(1)
    const rules = guestRuleChart(history, order, names)
    const latest = rules.commits[rules.commits.length - 1]
    expect(latest.commit).toBe(LAST_RULE)
    expect(latest.author).toContain('cursor[bot]')
    const forth = rules.series.find(series => series.id === 'forth')
    const forthPoint = forth?.points.find(point => point.commit === '61ec3540637188ef0bc7b116c7015ade908c7926')
    expect(forthPoint).toEqual({ commit: '61ec3540637188ef0bc7b116c7015ade908c7926', until: LAST_BENCH, value: 86 })
    expect(pointAt(forth?.points ?? [], latest.commit, rules.order)?.value).toBe(86)
    expect(pointAt(rules.series.find(series => series.id === 'lisp')?.points ?? [], latest.commit, rules.order)?.value).toBe(441)
    expect(pointAt(rules.series.find(series => series.id === 'brainfuck')?.points ?? [], latest.commit, rules.order)?.value).toBe(68)
    expect(pointAt(rules.series.find(series => series.id === 'basic')?.points ?? [], latest.commit, rules.order)?.value).toBe(62)
    expect(rangeLabel(forthPoint!)).toBe('61ec35406371…9d34a9a0cc75 · 86')

    const tasks = taskCommits(history, order, names)
    const latestTasks = tasks[tasks.length - 1]
    expect(latestTasks.commit).toBe(LAST_BENCH)
    expect(latestTasks.guests.find(guest => guest.id === 'forth')).toMatchObject({ passCount: 9, failCount: 0, unsupportedCount: 1, stepCount: 6256 })
    expect(latestTasks.guests.find(guest => guest.id === 'lisp')).toMatchObject({ passCount: 10, failCount: 0, stepCount: 76749 })
    expect(latestTasks.guests.find(guest => guest.id === 'brainfuck')).toMatchObject({ passCount: 1, unsupportedCount: 9, stepCount: 83 })
    expect(latestTasks.guests.find(guest => guest.id === 'basic')).toMatchObject({ passCount: 4, unsupportedCount: 6, stepCount: 4644 })
    const mixed = tasks.find(commit => commit.commit.startsWith('09744fa8d495'))
    expect(mixed?.guests.find(guest => guest.id === 'brainfuck')).toMatchObject({ passCount: 9, failCount: 1, stepCount: 28722 })

    const benches = benchmarkCommits(history, 'rewrite')
    const latestBench = benches[benches.length - 1]
    expect(latestBench.commit).toBe(LAST_BENCH)
    expect(latestBench.appliedSteps).toBe(10000)
    expect(latestBench.probes).toBe(10002)
    expect(latestBench.hosts.map(host => [host.id, host.environment, host.durationMs, host.exitCode, host.memoryBytes])).toEqual([
      ['python', 'python', 1244, 0, null],
      ['go', 'go native', 1176, 0, null],
      ['wasm', 'wasm (node)', 3024, 0, null],
      ['rust', 'rust', 880, 0, null],
      ['cpp', 'cpp', 914, 0, null],
    ])
    expect(latestBench.memoryCapBytes).toBe(268435456)
    const hosts = hostDurationSeries(benches)
    expect(hosts.find(series => series.id === 'wasm')?.points.at(-1)).toEqual({ commit: LAST_BENCH, until: LAST_BENCH, value: 3024 })
    expect(hosts.find(series => series.id === 'cpp')?.points).toHaveLength(3)
  })

  it('places zero on the baseline and the max near the top', () => {
    const placed = placeChart(3, 100, 640, 220)
    expect(placed.yAt(0)).toBe(placed.plotBottom)
    expect(placed.yAt(100)).toBeLessThan(placed.plotTop + (placed.plotBottom - placed.plotTop) * 0.1)
    expect(placed.xAt(0)).toBe(placed.plotLeft)
    expect(placed.xAt(2)).toBe(placed.plotRight)
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
    const series = hostDurationSeries(commits)
    expect(series.map(item => item.id)).toEqual(['python', 'go', 'wasm', 'rust'])
    expect(series.map(item => item.label)).toEqual(['python', 'go native', 'wasm (node)', 'rust'])
    expect(series.find(item => item.id === 'rust')?.points).toEqual([{ commit: newer, until: newer, value: 10 }])
    expect(series.find(item => item.id === 'python')?.points).toEqual([{ commit: older, until: newer, value: 10 }])
    expect(() => loadHistory({
      schema_version: 1,
      entries: [benchEntry('c'.repeat(40), '2026-01-03T00:00:00Z', ['erlang'], 10)],
    })).toThrow(/unknown benchmark host/)
  })

  it('keeps equal values across a gap as two runs', () => {
    const first = 'a'.repeat(40)
    const gap = 'b'.repeat(40)
    const last = 'c'.repeat(40)
    const loaded = loadHistory({
      schema_version: 1,
      entries: [
        benchEntry(first, '2026-01-01T00:00:00Z', ['python', 'rust'], 10),
        benchEntry(gap, '2026-01-02T00:00:00Z', ['python'], 12),
        benchEntry(last, '2026-01-03T00:00:00Z', ['python', 'rust'], 10),
      ],
    })
    const commits = benchmarkCommits(loaded, 'rewrite')
    const series = hostDurationSeries(commits)
    expect(series.find(item => item.id === 'python')?.points).toEqual([
      { commit: first, until: first, value: 10 },
      { commit: gap, until: gap, value: 12 },
      { commit: last, until: last, value: 10 },
    ])
    expect(series.find(item => item.id === 'rust')?.points).toEqual([
      { commit: first, until: first, value: 10 },
      { commit: last, until: last, value: 10 },
    ])
    expect(changeAxis(commits, series).map(commit => commit.commit)).toEqual([first, gap, last])
    expect(collapseRuns([
      { commit: first, value: 4 },
      { commit: gap, value: 4 },
      { commit: last, value: 9 },
    ])).toEqual([
      { commit: first, until: gap, value: 4 },
      { commit: last, until: last, value: 9 },
    ])
    expect(stepPath([
      { x: 0, y: 10, value: 1 },
      { x: 20, y: 10, value: 1 },
      { x: 40, y: 4, value: 2 },
    ])).toBe('M0.0 10.0L20.0 10.0L40.0 10.0L40.0 4.0')
  })

  it('rejects a document that breaks the schema', () => {
    expect(() => loadHistory({ schema_version: 2, entries: [] })).toThrow(HistoryError)
    expect(() => loadHistory({ schema_version: 2, entries: [] })).toThrow(/schema_version/)
    const older = blank('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '2026-01-02T00:00:00Z')
    const newer = blank('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '2026-01-01T00:00:00Z')
    expect(() => loadHistory({ schema_version: 1, entries: [older, newer] })).toThrow(/out of order/)
    expect(() => placeChart(0, 1)).toThrow(HistoryError)
    expect(() => assertEnvironment('go', 'wasm (node)')).toThrow(/go native/)
    expect(() => assertEnvironment('wasm', 'go native')).toThrow(/go native/)
    const negative = benchEntry('d'.repeat(40), '2026-01-04T00:00:00Z', ['python'], 10)
    negative.benchmarks[0].hosts[0].memory_bytes = -1
    expect(() => loadHistory({ schema_version: 1, entries: [negative] })).toThrow(/memory_bytes/)
  })
})

function benchEntry(commit: string, timestamp: string, hosts: string[], duration: number) {
  return {
    commit,
    author: 'Ada <ada@example.com>',
    timestamp,
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
    guests: {},
    tasks: null,
    benchmarks: null,
  }
}
