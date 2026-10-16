import { describe, expect, it } from 'vitest'
import {
  HistoryError,
  benchmarkCommits,
  guestName,
  guestRuleChart,
  history,
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
    expect(latest.commit.startsWith('886882cdd2cf')).toBe(true)
    expect(latest.author).toContain('cursor[bot]')
    expect(rules.series.find(series => series.id === 'forth')?.points.find(point => point.commit === latest.commit)?.value).toBe(86)
    expect(rules.series.find(series => series.id === 'lisp')?.points.find(point => point.commit === latest.commit)?.value).toBe(441)
    expect(rules.series.find(series => series.id === 'brainfuck')?.points.find(point => point.commit === latest.commit)?.value).toBe(68)
    expect(rules.series.find(series => series.id === 'basic')?.points.find(point => point.commit === latest.commit)?.value).toBe(62)

    const tasks = taskCommits(history, order, names)
    const latestTasks = tasks[tasks.length - 1]
    expect(latestTasks.guests.find(guest => guest.id === 'forth')).toMatchObject({ passCount: 10, failCount: 0, unsupportedCount: 0, stepCount: 1122 })
    expect(latestTasks.guests.find(guest => guest.id === 'lisp')).toMatchObject({ passCount: 10, stepCount: 50254 })
    expect(latestTasks.guests.find(guest => guest.id === 'brainfuck')).toMatchObject({ passCount: 2, unsupportedCount: 8, stepCount: 100 })
    expect(latestTasks.guests.find(guest => guest.id === 'basic')).toMatchObject({ passCount: 2, unsupportedCount: 8, stepCount: 10 })
    const mixed = tasks.find(commit => commit.commit.startsWith('09744fa8d495'))
    expect(mixed?.guests.find(guest => guest.id === 'brainfuck')).toMatchObject({ passCount: 9, failCount: 1, stepCount: 28722 })

    const benches = benchmarkCommits(history)
    const latestBench = benches[benches.length - 1]
    expect(latestBench.appliedSteps).toBe(10000)
    expect(latestBench.probes).toBe(10002)
    expect(latestBench.hosts.map(host => [host.id, host.durationMs, host.exitCode])).toEqual([
      ['python', 1013, 0],
      ['go', 912, 0],
      ['wasm', 2111, 0],
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

  it('rejects a document that breaks the schema', () => {
    expect(() => loadHistory({ schema_version: 2, entries: [] })).toThrow(HistoryError)
    expect(() => loadHistory({ schema_version: 2, entries: [] })).toThrow(/schema_version/)
    const older = blank('bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', '2026-01-02T00:00:00Z')
    const newer = blank('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', '2026-01-01T00:00:00Z')
    expect(() => loadHistory({ schema_version: 1, entries: [older, newer] })).toThrow(/out of order/)
    expect(() => placeChart(0, 1)).toThrow(HistoryError)
  })
})

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
