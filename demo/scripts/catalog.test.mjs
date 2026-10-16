import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CatalogError, buildCatalog, catalogFromSources, publishedCases, sitemapXml, taskDescription } from './build-catalog.mjs'

const COMMIT = '0123456789abcdef0123456789abcdef01234567'

function row(fields) {
  return {
    task: 'factorial',
    guest: 'forth',
    host: 'python',
    status: 'pass',
    step_count: 52,
    guest_rule_count: 45,
    solution_path: 'tasks/factorial/solutions/forth.fth',
    reason: null,
    error: null,
    ...fields,
  }
}

function sourcesFor(solutions) {
  return {
    taskOrder: ['factorial'],
    guests: [
      { id: 'forth', program: 'examples/forth/forth.tpp', extension: 'fth' },
      { id: 'lisp', program: 'examples/lisp/lisp.tpp', extension: 'lisp' },
    ],
    files: {
      factorial: {
        markdown: '# Factorial\n\nPrint n! and a newline.\n\nRead n from stdin.\n',
        solutions,
      },
    },
  }
}

function resultsFor() {
  const hosts = ['python', 'go', 'wasm']
  const forth = hosts.map(host => row({ host }))
  const lisp = hosts.map(host => row({
    guest: 'lisp',
    host,
    status: 'unsupported',
    step_count: null,
    guest_rule_count: 394,
    solution_path: null,
    reason: 'Lisp cannot print plain text.',
  }))
  return {
    schema_version: 1,
    spec_version: 'v0.5',
    commit: COMMIT,
    commit_dirty: false,
    author: 'Ada Lovelace <ada@example.com>',
    timestamp: '2026-10-16T13:40:00Z',
    errors: [],
    hosts,
    guests: [
      { id: 'forth', program: 'examples/forth/forth.tpp', rule_count: 45 },
      { id: 'lisp', program: 'examples/lisp/lisp.tpp', rule_count: 394 },
    ],
    tasks: [{
      id: 'factorial',
      title: 'Factorial',
      cases: [{ name: 'ten', stdin: '10\n', stdout: '3628800\n', stderr: '', exit_code: 0 }],
    }],
    grid: {
      factorial: {
        forth: { status: 'pass', step_count: 52 },
        lisp: { status: 'unsupported', step_count: null },
      },
    },
    results: [...forth, ...lisp],
  }
}

describe('task transcripts', () => {
  it('reads a title and the body under it', () => {
    const described = taskDescription('# Hello world\n\nPrint it.\n\nThen stop.\n')
    assert.equal(described.title, 'Hello world')
    assert.equal(described.description, 'Print it.\n\nThen stop.')
  })

  it('reads the cases the Go test published', () => {
    const cases = publishedCases('sum-numbers', [
      { name: 'three', stdin: '3\n', stdout: '60\n', stderr: '', exit_code: 0 },
      { name: 'none', stdin: '0\n', stdout: '0\n', stderr: '', exit_code: 0 },
    ])
    assert.equal(cases.length, 2)
    assert.equal(cases[1].stdin, '0\n')
    assert.equal(cases[0].stdout, '60\n')
  })

  it('rejects a case that omits stdout', () => {
    assert.throws(() => publishedCases('factorial', [{ name: 'ten', stdin: '10\n', stderr: '', exit_code: 0 }]), CatalogError)
  })
})

describe('buildCatalog', () => {
  it('sums passes and steps and keeps unsupported reasons', () => {
    const catalog = buildCatalog(resultsFor(), sourcesFor({
      forth: { kind: 'solution', text: '1 2 *\n' },
      lisp: { kind: 'unsupported', reason: 'Lisp cannot print plain text.' },
    }))
    assert.equal(catalog.schemaVersion, 1)
    assert.equal(catalog.guests[0].passCount, 1)
    assert.equal(catalog.guests[0].stepCount, 52)
    assert.equal(catalog.guests[0].ruleCount, 45)
    assert.equal(catalog.guests[1].passCount, 0)
    assert.equal(catalog.guests[1].stepCount, 0)
    assert.equal(catalog.guests[1].ruleCount, 394)
    assert.equal(catalog.tasks[0].guests[0].solution, '1 2 *\n')
    assert.equal(catalog.tasks[0].guests[1].reason, 'Lisp cannot print plain text.')
    assert.equal(catalog.tasks[0].summary, 'Print n! and a newline.')
    assert.equal(catalog.tasks[0].cases[0].stdout, '3628800\n')
    assert.equal(catalog.tasks[0].canonical, 'https://thuelang.org/tasks/factorial')
  })

  it('keeps a failing solution and its error', () => {
    const results = resultsFor()
    results.grid.factorial.forth = { status: 'fail', step_count: null }
    results.results.filter(item => item.guest === 'forth').forEach(item => {
      item.status = 'fail'
      item.step_count = null
      item.error = 'stdout mismatch'
    })
    const catalog = buildCatalog(results, sourcesFor({
      forth: { kind: 'solution', text: '1\n' },
      lisp: { kind: 'unsupported', reason: 'Lisp cannot print plain text.' },
    }))
    const forth = catalog.tasks[0].guests[0]
    assert.equal(forth.status, 'fail')
    assert.equal(forth.solution, '1\n')
    assert.equal(forth.error, 'stdout mismatch')
    assert.equal(catalog.guests[0].passCount, 0)
    assert.equal(catalog.guests[0].stepCount, 0)
  })

  it('accepts a host subset and rejects an unknown or reordered host list', () => {
    const sources = sourcesFor({
      forth: { kind: 'solution', text: '1\n' },
      lisp: { kind: 'unsupported', reason: 'Lisp cannot print plain text.' },
    })
    const subset = resultsFor()
    subset.hosts = ['python']
    assert.equal(buildCatalog(subset, sources).tasks[0].guests[0].status, 'pass')
    const unknown = resultsFor()
    unknown.hosts = ['python', 'erlang']
    assert.throws(() => buildCatalog(unknown, sources), /unknown host/)
    const unordered = resultsFor()
    unordered.hosts = ['wasm', 'python', 'go']
    assert.throws(() => buildCatalog(unordered, sources), /hosts\.toml order/)
    const dirty = resultsFor()
    dirty.errors = ['factorial/forth applied-step mismatch']
    assert.throws(() => buildCatalog(dirty, sourcesFor({
      forth: { kind: 'solution', text: '1\n' },
      lisp: { kind: 'unsupported', reason: 'Lisp cannot print plain text.' },
    })), /results\.errors/)
  })
})

describe('catalogFromSources', () => {
  it('marks solutions unmeasured and does not claim a pass', () => {
    const catalog = catalogFromSources(sourcesFor({
      forth: { kind: 'solution', text: '1\n' },
      lisp: { kind: 'unsupported', reason: 'Lisp cannot print plain text.' },
    }))
    assert.equal(catalog.commit, 'unmeasured')
    assert.equal(catalog.guests[0].ruleCount, 0)
    assert.equal(catalog.guests[0].passCount, 0)
    const forth = catalog.tasks[0].guests.find(guest => guest.id === 'forth')
    const lisp = catalog.tasks[0].guests.find(guest => guest.id === 'lisp')
    assert.equal(forth.status, 'unmeasured')
    assert.equal(forth.stepCount, null)
    assert.equal(lisp.status, 'unsupported')
    assert.equal(lisp.reason, 'Lisp cannot print plain text.')
    assert.equal(catalog.tasks[0].guests.some(guest => guest.status === 'pass'), false)
  })
})

describe('sitemapXml', () => {
  it('escapes locations and keeps task urls', () => {
    const xml = sitemapXml([
      { loc: 'https://thuelang.org/tasks', priority: '0.6' },
      { loc: 'https://thuelang.org/tasks/hello-world', priority: '0.5' },
    ])
    assert.match(xml, /<loc>https:\/\/thuelang.org\/tasks\/hello-world<\/loc>/)
    assert.match(xml, /<priority>0\.5<\/priority>/)
  })
})
