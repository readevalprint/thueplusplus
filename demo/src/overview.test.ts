import { describe, expect, it } from 'vitest'
import { HistoryError, loadHistory, type History } from './metrics'
import {
  buildOverview,
  dominates,
  geometricMean,
  overhead,
  paretoScale,
  versionOf,
  type ParetoPoint,
  type ProblemRef,
} from './overview'

const FORTH = 'a'.repeat(40)
const LATER = 'b'.repeat(40)

describe('problem and language overview', () => {
  it('takes the geometric mean and rejects an empty set', () => {
    expect(geometricMean([4, 9])).toBeCloseTo(6)
    expect(geometricMean([8])).toBe(8)
    expect(() => geometricMean([])).toThrow(HistoryError)
    expect(() => geometricMean([0])).toThrow(/ratio/)
  })

  it('sorts by gaps, then the newest improvement, and keeps languages apart', () => {
    const board = buildOverview(historyOf([
      entry(FORTH, '2026-01-01T00:00:00Z', [
        pass('alpha', 'direct', 20),
        pass('beta', 'direct', 10),
        pass('beta', 'lisp', 40),
        pass('beta', 'forth', 30),
        pass('gamma', 'slow', 8),
        fail('gamma', 'lisp'),
      ]),
      entry(LATER, '2026-02-01T00:00:00Z', [
        pass('alpha', 'direct', 12),
        pass('beta', 'direct', 10),
        pass('beta', 'lisp', 40),
        pass('beta', 'forth', 30),
        pass('beta', 'basic', 50),
        pass('beta', 'lisp-fast', 80),
        pass('gamma', 'slow', 8),
        fail('gamma', 'lisp'),
      ]),
    ]), refs(['gamma', 'alpha', 'beta']))

    expect(board.problems.map(problem => problem.id)).toEqual(['alpha', 'gamma', 'beta'])
    expect(board.problems.map(problem => problem.gaps)).toEqual([3, 3, 0])
    expect(board.problems[0]?.improvedAt).toBe('2026-02-01T00:00:00Z')
    expect(board.problems[1]?.improvedAt).toBe('2026-01-01T00:00:00Z')
    expect(board.problems[0]?.trend.map(point => [point.value, point.mark])).toEqual([[20, true], [12, true]])
    expect(board.problems[1]?.trend.map(point => point.mark)).toEqual([true, false])

    const beta = board.problems[2]
    expect(beta?.marks.map(mark => [mark.id, mark.filled])).toEqual([
      ['direct', true],
      ['lisp', true],
      ['forth', true],
      ['basic', true],
    ])
    expect(beta?.fronts.find(front => front.id === 'direct')?.points.map(point => point.solution)).toEqual(['direct'])
    expect(beta?.fronts.find(front => front.id === 'lisp')?.points.map(point => point.solution)).toEqual(['lisp', 'lisp-fast'])
    expect(beta?.fronts.find(front => front.id === 'forth')?.points).toHaveLength(1)
    expect(board.problems[0]?.marks.find(mark => mark.id === 'direct')?.filled).toBe(true)
    expect(board.problems[0]?.marks.find(mark => mark.id === 'lisp')?.filled).toBe(false)

    expect(board.languages.map(lang => lang.id)).toEqual(['lisp', 'forth', 'basic'])
    expect(board.languages.map(lang => lang.coverage)).toEqual([1, 1, 1])
    expect(board.languages[0]?.overhead).toBeCloseTo(4)
    expect(board.languages[0]?.trend.map(point => point.value)).toEqual([null, 4])
    expect(board.languages[0]?.trend.map(point => point.mark)).toEqual([false, true])
    expect(board.languages[0]?.ruleCount).toBe(441)
    expect(board.problemCount).toBe(3)
    expect(versionOf('slow')).toBe('direct')
    expect(versionOf('lisp-fast')).toBe('lisp')
  })

  it('rejects a direct ratio of zero and a dominated row stays off its own front', () => {
    const point = (solution: string, regexEvals: number, ruleCount: number): ParetoPoint => ({
      solution,
      regexEvals,
      regexMatches: 4,
      stateBytes: 20,
      ruleCount,
      ruleChars: 40,
    })
    const direct = point('direct', 10, 3)
    const slow = point('slow', 12, 4)
    const tied = point('tied', 10, 3)
    expect(dominates(direct, slow)).toBe(true)
    expect(dominates(slow, direct)).toBe(false)
    expect(dominates(direct, tied)).toBe(false)
    expect(paretoScale([direct])).toBe('log')
    expect(paretoScale([{ ...direct, regexEvals: 0 }])).toBe('linear')

    const rows = loadHistory({
      schema_version: 1,
      entries: [entry(FORTH, '2026-01-01T00:00:00Z', [
        pass('alpha', 'direct', 0),
        pass('alpha', 'lisp', 4),
        pass('alpha', 'forth', 4),
        pass('alpha', 'basic', 4),
      ])],
    }).entries[0]?.problems
    expect(rows).toBeTruthy()
    expect(() => overhead(rows ?? [], 'lisp')).toThrow(/ratio/)
  })
})

function refs(ids: string[]): ProblemRef[] {
  return ids.map(id => ({ id, title: id, summary: `${id} summary`, path: `/tasks/${id}` }))
}

function historyOf(entries: ReturnType<typeof entry>[]): History {
  return loadHistory({ schema_version: 1, entries })
}

function entry(commit: string, timestamp: string, problems: Record<string, unknown>[]) {
  return {
    commit,
    author: 'Ada <ada@example.com>',
    timestamp,
    machine: null,
    guests: {},
    tasks: null,
    benchmarks: null,
    problems,
    langs: [
      lang('forth', 86, 14478),
      lang('lisp', 441, 102702),
      lang('basic', 62, 7007),
    ],
  }
}

function pass(problem: string, solution: string, regexEvals: number): Record<string, unknown> {
  return {
    problem,
    solution,
    status: 'pass',
    regex_evals: regexEvals,
    regex_matches: 4,
    state_bytes: 20,
    rule_count: solution === 'lisp-fast' ? 2 : 3,
    rule_chars: 40,
  }
}

function fail(problem: string, solution: string): Record<string, unknown> {
  return {
    problem,
    solution,
    status: 'fail',
    regex_evals: null,
    regex_matches: null,
    state_bytes: null,
    rule_count: null,
    rule_chars: null,
  }
}

function lang(id: string, ruleCount: number, ruleChars: number): Record<string, unknown> {
  return {
    lang: id,
    program: `langs/${id}/${id}.thue`,
    status: 'pass',
    regex_evals: 100,
    regex_matches: 10,
    state_bytes: 50,
    rule_count: ruleCount,
    rule_chars: ruleChars,
  }
}
