import { describe, expect, it } from 'vitest'
import { HistoryError, formatTimesGo, history, hostLine, hostRatio, loadHistory, type HistoryEntry } from './metrics'

function entry(hosts: HistoryEntry['hosts']): HistoryEntry {
  return {
    commit: '0123456789abcdef0123456789abcdef01234567',
    author: 'Ada Lovelace <ada@example.com>',
    timestamp: '2026-10-17T00:00:00Z',
    machine: { os: 'linux', release: 'test', arch: 'x64', cpu: 'test', cpus: 2 },
    hosts,
  }
}

describe('host ratios', () => {
  it('loads the generated summary', () => {
    expect(history.schemaVersion).toBe(2)
    expect(Array.isArray(history.entries)).toBe(true)
  })

  it('divides a host by go native', () => {
    const row = entry([
      { id: 'go', environment: 'go native', durationMs: 1000, memoryBytes: 2000, runs: 4 },
      { id: 'python', environment: 'python', durationMs: 1200, memoryBytes: 4000, runs: 4 },
    ])
    expect(hostRatio(row, 'python', 'durationMs')).toBeCloseTo(1.2)
    expect(hostLine(row, 'python', 'durationMs')).toBe('python · 1.2× go')
    expect(hostLine(row, 'go', 'durationMs')).toBe('go native · 1× go')
    expect(formatTimesGo(2.25)).toBe('2.3× go')
  })

  it('has no memory ratio when go memory is zero', () => {
    const row = entry([
      { id: 'go', environment: 'go native', durationMs: 1000, memoryBytes: 0, runs: 1 },
      { id: 'python', environment: 'python', durationMs: 1000, memoryBytes: 10, runs: 1 },
    ])
    expect(hostRatio(row, 'python', 'memoryBytes')).toBeNull()
  })

  it('rejects a zero go duration', () => {
    const row = entry([
      { id: 'go', environment: 'go native', durationMs: 0, memoryBytes: 10, runs: 1 },
      { id: 'python', environment: 'python', durationMs: 10, memoryBytes: 10, runs: 1 },
    ])
    expect(() => hostRatio(row, 'python', 'durationMs')).toThrow(HistoryError)
  })

  it('rejects the old summary shape', () => {
    expect(() => loadHistory({ schema_version: 1, entries: [] })).toThrow(/schema_version/)
  })
})
