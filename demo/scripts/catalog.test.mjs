import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CatalogError, buildProblemCatalog, problemDescription, sitemapXml, versionIdForSolution } from './build-catalog.mjs'

const HEAD = '0123456789abcdef0123456789abcdef01234567'
const OLDER = 'abcdefabcdefabcdefabcdefabcdefabcdefabcd'

function counters(fields) {
  return {
    status: 'pass',
    cost: 4000,
    applied_steps: 83,
    regex_evals: 290,
    regex_matches: 88,
    state_bytes: 1232,
    state_peak: 31,
    rule_count: 8,
    rule_chars: 359,
    duration_ms: 10,
    ...fields,
  }
}

function latestFor(problemRows, langRows = [counters({ lang: 'forth', program: 'langs/forth/forth.tpp' })]) {
  return {
    schema_version: 4,
    problems: { source: 'make problems', host: 'go', environment: 'go native', results: problemRows },
    langs: { source: 'make langs', host: 'go', environment: 'go native', results: langRows },
  }
}

function inputFor(latest, solutions, archives = []) {
  return {
    specVersion: 'v0.5',
    head: { commit: HEAD, author: 'Ada Lovelace <ada@example.com>', timestamp: '2026-10-17T00:00:00Z' },
    latest,
    archives,
    problems: [{
      id: 'factorial',
      markdown: '# Factorial\n\nPrint n! and a newline.\n\nRead n from stdin.\n',
      solutions,
    }],
    langs: [
      { id: 'forth', programs: ['langs/forth/forth.tpp'] },
      { id: 'basic', programs: ['langs/basic/basic.tpp'] },
    ],
  }
}

describe('problem transcripts', () => {
  it('reads a title and the body under it', () => {
    const described = problemDescription('# Hello world\n\nPrint it.\n\nThen stop.\n')
    assert.equal(described.title, 'Hello world')
    assert.equal(described.description, 'Print it.\n\nThen stop.')
  })
})

describe('version counters', () => {
  it('maps language solutions to their version and every other file to direct', () => {
    assert.equal(versionIdForSolution('lisp'), 'lisp')
    assert.equal(versionIdForSolution('forth'), 'forth')
    assert.equal(versionIdForSolution('basic'), 'basic')
    assert.equal(versionIdForSolution('direct'), 'direct')
    assert.equal(versionIdForSolution('slow'), 'direct')
  })
})

describe('buildProblemCatalog', () => {
  it('records the measuring commit, pass counters, and a missing language version', () => {
    const catalog = buildProblemCatalog(inputFor(latestFor([
      counters({ problem: 'factorial', solution: 'direct' }),
    ]), { direct: '1\n' }))
    assert.equal(catalog.schemaVersion, 2)
    assert.equal(catalog.commit, HEAD)
    assert.equal(catalog.problems[0].canonical, 'https://thuelang.org/problems/factorial')
    assert.equal(catalog.problems[0].summary, 'Print n! and a newline.')
    const direct = catalog.problems[0].versions.find(version => version.id === 'direct')
    const lisp = catalog.problems[0].versions.find(version => version.id === 'lisp')
    assert.equal(direct.missing, false)
    assert.equal(direct.solutions[0].status, 'pass')
    assert.equal(direct.solutions[0].cost, 4000)
    assert.equal(direct.solutions[0].regexEvals, 290)
    assert.equal(direct.solutions[0].stateBytes, 1232)
    assert.equal(direct.solutions[0].steps, 83)
    assert.equal(lisp.missing, true)
    assert.equal(lisp.solutions.length, 0)
    assert.equal(lisp.series.length, 0)
    const basic = catalog.langs.find(lang => lang.language === 'basic')
    assert.equal(basic.status, 'missing')
    assert.equal(basic.program, 'langs/basic/basic.tpp')
    assert.equal(catalog.langs.find(lang => lang.id === 'forth').status, 'pass')
  })

  it('plots every passing solution and leaves a version out until it exists', () => {
    const older = {
      schema_version: 4,
      problems: {
        source: 'make problems', host: 'go', environment: 'go native',
        results: [
          counters({ problem: 'factorial', solution: 'direct', cost: 10 }),
          counters({ problem: 'factorial', solution: 'slow', cost: 4 }),
          counters({
            problem: 'factorial', solution: 'broken', status: 'fail',
            cost: null, applied_steps: null, regex_evals: null, regex_matches: null,
            state_bytes: null, state_peak: null, rule_count: null, rule_chars: null,
          }),
        ],
      },
      langs: {
        source: 'make langs', host: 'go', environment: 'go native',
        results: [counters({ lang: 'forth', program: 'langs/forth/forth.tpp' })],
      },
    }
    const catalog = buildProblemCatalog(inputFor(
      latestFor([
        counters({ problem: 'factorial', solution: 'direct', cost: 290 }),
        counters({ problem: 'factorial', solution: 'slow', cost: 400 }),
      ]),
      { direct: '1\n', slow: '2\n' },
      [{ commit: OLDER, author: 'Ada Lovelace <ada@example.com>', timestamp: '2026-10-16T00:00:00Z', document: older }],
    ))
    const direct = catalog.problems[0].versions.find(version => version.id === 'direct')
    assert.deepEqual(direct.series.map(point => [point.commit, point.solution, point.cost]), [
      [OLDER, 'direct.tpp', 10],
      [OLDER, 'slow.tpp', 4],
      [HEAD, 'direct.tpp', 290],
      [HEAD, 'slow.tpp', 400],
    ])
    assert.equal(catalog.commits.at(-1).commit, HEAD)
    assert.equal(catalog.problems[0].versions.find(version => version.id === 'forth').series.length, 0)
  })

  it('fails the build when a solution has no metrics entry', () => {
    assert.throws(() => buildProblemCatalog(inputFor(
      latestFor([counters({ problem: 'factorial', solution: 'direct' })]),
      { direct: '1\n', lisp: '(fact)\n' },
    )), /factorial\/lisp: solution has no metrics entry/)
  })

  it('fails the build when a metrics row has no solution file', () => {
    assert.throws(() => buildProblemCatalog(inputFor(
      latestFor([
        counters({ problem: 'factorial', solution: 'direct' }),
        counters({ problem: 'factorial', solution: 'lisp' }),
      ]),
      { direct: '1\n' },
    )), /factorial\/lisp: metrics entry has no solution file/)
  })

  it('rejects an unmeasured status', () => {
    assert.throws(() => buildProblemCatalog(inputFor(
      latestFor([counters({ problem: 'factorial', solution: 'direct', status: 'unmeasured' })]),
      { direct: '1\n' },
    )), /status must be pass or fail/)
  })
})

describe('sitemapXml', () => {
  it('escapes locations and keeps problem urls', () => {
    const xml = sitemapXml([
      { loc: 'https://thuelang.org/problems', priority: '0.6' },
      { loc: 'https://thuelang.org/problems/hello-world', priority: '0.5' },
    ])
    assert.match(xml, /<loc>https:\/\/thuelang.org\/problems\/hello-world<\/loc>/)
    assert.match(xml, /<priority>0\.5<\/priority>/)
  })
})
