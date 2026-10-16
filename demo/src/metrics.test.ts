import { describe, expect, it } from 'vitest'
import {
  HistoryError,
  assertEnvironment,
  benchmarkCommits,
  guestName,
  guestRuleChart,
  history,
  hostDurationSeries,
  loadHistory,
  placeChart,
  taskCommits,
} from './metrics'

const names = new Map([
  ['forth', 'Forth'],
  ['lisp', 'Lisp'],
  ['brainfuck', 'Brainfuck'],
  ['basic', 'Basic'],
])
const order = ['forth', 'lisp', 'brainfuck', 'basic']

describe('metrics history', () => {
  it('loads the committed series', () => {
    expect(history.schemaVersion).toBe(1)
    expect(history.entries.length).toBeGreaterThan(1)
    const rules = guestRuleChart(history, order, names)
    const latest = rules.commits[rules.commits.length - 1]
    expect(latest.commit.startsWith('b8473267b50d')).toBe(true)
    expect(latest.author).toContain('cursor[bot]')
    expect(rules.series.find(series => series.id === 'forth')?.points.find(point => point.commit === latest.commit)?.value).toBe(86)
    expect(rules.series.find(series => series.id === 'lisp')?.points.find(point => point.commit === latest.commit)?.value).toBe(441)
    expect(rules.series.find(series => series.id === 'brainfuck')?.points.find(point => point.commit === latest.commit)?.value).toBe(68)
    expect(rules.series.find(series => series.id === 'basic')?.points.find(point => point.commit === latest.commit)?.value).toBe(62)

    const tasks = taskCommits(history, order, names)
    const latestTasks = tasks[tasks.length - 1]
    expect(latestTasks.guests.find(guest => guest.id === 'forth')).toMatchObject({ passCount: 10, failCount: 0, unsupportedCount: 0, stepCount: 1122 })
    expect(latestTasks.guests.find(guest => guest.id === 'lisp')).toMatchObject({ passCount: 10, failCount: 0, stepCount: 50254 })
    expect(latestTasks.guests.find(guest => guest.id === 'brainfuck')).toMatchObject({ passCount: 2, unsupportedCount: 8, stepCount: 100 })
    expect(latestTasks.guests.find(guest => guest.id === 'basic')).toMatchObject({ passCount: 2, unsupportedCount: 8, stepCount: 10 })
    const mixed = tasks.find(commit => commit.commit.startsWith('09744fa8d495'))
    expect(mixed?.guests.find(guest => guest.id === 'brainfuck')).toMatchObject({ passCount: 9, failCount: 1, stepCount: 28722 })

    const benches = benchmarkCommits(history)
    const latestBench = benches[benches.length - 1]
    expect(latestBench.appliedSteps).toBe(10000)
    expect(latestBench.probes).toBe(10002)
    expect(latestBench.hosts.map(host => [host.id, host.environment, host.durationMs, host.exitCode])).toEqual([
      ['python', 'python', 916, 0],
      ['go', 'go native', 875, 0],
      ['wasm', 'wasm (node)', 2076, 0],
      ['rust', 'rust', 574, 0],
    ])
    expect(latestBench.memoryCapBytes).toBe(268435456)
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
        benchEntry(older, '2026-01-01T00:00:00Z', ['python', 'go', 'wasm']),
        benchEntry(newer, '2026-01-02T00:00:00Z', ['python', 'go', 'wasm', 'rust']),
      ],
    })
    const series = hostDurationSeries(benchmarkCommits(loaded))
    expect(series.map(item => item.id)).toEqual(['python', 'go', 'wasm', 'rust'])
    expect(series.map(item => item.label)).toEqual(['python', 'go native', 'wasm (node)', 'rust'])
    expect(series.find(item => item.id === 'rust')?.points).toEqual([{ commit: newer, value: 10 }])
    expect(series.find(item => item.id === 'python')?.points).toHaveLength(2)
    expect(() => loadHistory({
      schema_version: 1,
      entries: [benchEntry('c'.repeat(40), '2026-01-03T00:00:00Z', ['erlang'])],
    })).toThrow(/unknown benchmark host/)
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
  })
})

function benchEntry(commit: string, timestamp: string, hosts: string[]) {
  const rows: Record<string, unknown> = {}
  for (const host of hosts) {
    rows[host] = {
      duration_ms: 10,
      exit_code: 0,
      applied_steps: 10000,
      probes: 10002,
      host_timeout_seconds: 30,
      environment: { python: 'python', go: 'go native', wasm: 'wasm (node)', rust: 'rust', cpp: 'cpp' }[host],
    }
  }
  return {
    commit,
    author: 'Ada <ada@example.com>',
    timestamp,
    guests: {},
    tasks: null,
    benchmarks: {
      program: 'benchmark.tpp',
      max_steps: 15000,
      max_evals: 50000,
      max_state_bytes: 16384,
      timeout_seconds: 30,
      memory_cap_bytes: 268435456,
      hosts: rows,
    },
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
