import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { globSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { summarize, SummaryError } from './build-summary.mjs'
import { fileURLToPath } from 'node:url'

const demoRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))

describe('summary', () => {
  it('has one entry per bench file plus latest.json at HEAD', () => {
    const files = globSync('metrics/**/bench.json', { cwd: repoRoot })
    const latest = JSON.parse(readFileSync(join(repoRoot, 'metrics', 'latest.json'), 'utf8'))
    const summary = JSON.parse(readFileSync(join(demoRoot, 'src', 'generated', 'summary.json'), 'utf8'))
    const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
    assert.ok(latest.schema_version === 2 || latest.schema_version === 3)
    assert.equal(latest.commit, undefined)
    assert.ok(latest.machine)
    assert.equal(summary.schema_version, 1)
    assert.equal(summary.entries.length, files.length + 1)
    assert.ok(files.length > 0)
    assert.equal(new Set(summary.entries.map(entry => entry.commit)).size, files.length + 1)
    assert.equal(summary.entries[summary.entries.length - 1].commit, head)
    assert.deepEqual(summary.entries[summary.entries.length - 1].machine, latest.machine)
    assert.equal(summary.entries.some(entry => entry.machine === null), true)
    assert.equal(summary.entries.some(entry => entry.problems === null && entry.langs === null), true)
    const headEntry = summary.entries[summary.entries.length - 1]
    assert.equal(headEntry.problems.length, 16)
    assert.equal(headEntry.problems.every(row => row.solution === 'direct' && row.status === 'pass'), true)
    assert.deepEqual(headEntry.langs.map(row => row.lang), ['forth', 'lisp', 'basic'])
    assert.equal(headEntry.langs.every(row => row.rule_count >= 1 && row.rule_chars >= 1), true)
  })

  it('copies schema 3 counters and leaves schema 2 empty', () => {
    const older = 'a'.repeat(40)
    const newer = 'b'.repeat(40)
    const summary = summarize([
      {
        rel: `metrics/2026/01/01/${older}/bench.json`,
        document: {
          schema_version: 2,
          commit: older,
          author: 'Ada <ada@example.com>',
          timestamp: '2026-01-01T00:00:00Z',
          machine: null,
          guests: {},
          tasks: null,
          benchmarks: null,
        },
      },
      {
        rel: `metrics/2026/01/02/${newer}/bench.json`,
        document: {
          schema_version: 3,
          commit: newer,
          author: 'Ada <ada@example.com>',
          timestamp: '2026-01-02T00:00:00Z',
          machine: null,
          guests: {},
          tasks: null,
          benchmarks: null,
          problems: {
            source: 'make problems',
            host: 'go',
            environment: 'go native',
            results: [passRow('factorial', 'direct', 9)],
          },
          langs: {
            source: 'make langs',
            host: 'go',
            environment: 'go native',
            results: [langRow('forth', 86, 4000, 90)],
          },
        },
      },
    ], ['go'])
    assert.equal(summary.entries[0].problems, null)
    assert.equal(summary.entries[0].langs, null)
    assert.deepEqual(summary.entries[1].problems, [{
      problem: 'factorial',
      solution: 'direct',
      status: 'pass',
      regex_evals: 9,
      regex_matches: 4,
      state_bytes: 20,
      rule_count: 3,
      rule_chars: 40,
    }])
    assert.equal(summary.entries[1].langs[0].rule_count, 86)
    assert.throws(() => summarize([{
      rel: `metrics/2026/01/03/${'c'.repeat(40)}/bench.json`,
      document: {
        schema_version: 2,
        commit: 'c'.repeat(40),
        author: 'Ada <ada@example.com>',
        timestamp: '2026-01-03T00:00:00Z',
        machine: null,
        guests: {},
        tasks: null,
        benchmarks: null,
        problems: null,
      },
    }], ['go']), SummaryError)
  })
})

function passRow(problem, solution, regexEvals) {
  return {
    problem,
    solution,
    status: 'pass',
    applied_steps: 4,
    regex_evals: regexEvals,
    regex_matches: 4,
    state_bytes: 20,
    state_peak: 8,
    rule_count: 3,
    rule_chars: 40,
    duration_ms: 12,
  }
}

function langRow(lang, ruleCount, ruleChars, regexEvals) {
  return {
    lang,
    program: `langs/${lang}/${lang}.thue`,
    status: 'pass',
    applied_steps: 4,
    regex_evals: regexEvals,
    regex_matches: 4,
    state_bytes: 20,
    state_peak: 8,
    rule_count: ruleCount,
    rule_chars: ruleChars,
    duration_ms: 12,
  }
}
