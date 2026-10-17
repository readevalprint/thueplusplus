import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../', import.meta.url))
const catalogPath = join(repoRoot, 'demo/src/generated/catalog.json')
const summaryPath = join(repoRoot, 'demo/src/generated/summary.json')
const CHARTS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)']
const SITE = 'https://thuelang.org'

export class CatalogError extends Error {}

export function parseFrontmatter(text, path) {
  if (!text.startsWith('---\n')) throw new CatalogError(`${path}: missing opening frontmatter`)
  const end = text.indexOf('\n---\n', 4)
  if (end < 0) throw new CatalogError(`${path}: frontmatter is not closed`)
  const fields = {}
  for (const line of text.slice(4, end).split('\n')) {
    if (line.trim() === '') continue
    if (line.startsWith(' ') || line.startsWith('\t')) throw new CatalogError(`${path}: nested frontmatter is invalid`)
    const split = line.indexOf(':')
    if (split < 0) throw new CatalogError(`${path}: frontmatter line has no key`)
    const key = line.slice(0, split).trim()
    const value = line.slice(split + 1).trim()
    if (['limits', 'max_steps', 'max_evals', 'max_state_bytes', 'timeout', 'timeout_seconds', 'memory_cap_bytes'].includes(key)) {
      throw new CatalogError(`${path}: ${key} is global and cannot appear in frontmatter`)
    }
    if (!key || !value || fields[key] !== undefined) throw new CatalogError(`${path}: frontmatter key ${key} must be a new non-empty field`)
    fields[key] = value
  }
  if (Object.keys(fields).length === 0) throw new CatalogError(`${path}: frontmatter is empty`)
  let body = text.slice(end + 5)
  if (body.startsWith('\n')) body = body.slice(1)
  return { fields, body }
}

export function commonProblems(passing) {
  const compared = Object.values(passing).filter(problems => problems.length > 0)
  if (compared.length === 0) return []
  return compared.reduce((common, problems) => common.filter(problem => problems.includes(problem)))
}

export function aggregateSum(costs, common) {
  const totals = {}
  for (const [ruleset, byProblem] of Object.entries(costs)) {
    if (!common.every(problem => Number.isInteger(byProblem[problem]))) continue
    totals[ruleset] = common.reduce((sum, problem) => sum + byProblem[problem], 0)
  }
  return totals
}

export function sitemapXml(entries) {
  const body = entries.map(entry => `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <priority>${entry.priority}</priority>\n  </url>`).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

export function problemPages(catalog) {
  return catalog.problems.map(problem => ({
    path: problem.path,
    title: problem.title,
    documentTitle: problem.documentTitle,
    description: problem.summary,
    canonical: problem.canonical,
    robots: 'index,follow',
  }))
}

export function solutionPages(catalog) {
  return catalog.problems.flatMap(problem => problem.versions.map(version => ({
    path: `/problems/${problem.id}/${version.id}`,
    title: `${problem.title} / ${version.name}`,
    documentTitle: `Thue++ ${problem.title} — ${version.name}`,
    description: `${version.name} for ${problem.title}.`,
    canonical: `${SITE}/problems/${problem.id}/${version.id}`,
    robots: 'index,follow',
  })))
}

export function rulesetPages(catalog) {
  return catalog.rulesets.map(ruleset => ({
    path: `/rulesets/${ruleset.id}`,
    title: ruleset.name,
    documentTitle: `Thue++ ${ruleset.name}`,
    description: `${ruleset.name} aggregate cost over the common problems.`,
    canonical: `${SITE}/rulesets/${ruleset.id}`,
    robots: 'index,follow',
  }))
}

export function readGeneratedCatalog() {
  if (!existsSync(catalogPath)) throw new CatalogError('demo/src/generated/catalog.json is missing. Run node demo/scripts/build-site.mjs')
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  if (catalog.schemaVersion !== 3) throw new CatalogError(`catalog schemaVersion must be 3, got ${catalog.schemaVersion}`)
  return catalog
}

function git(args) {
  return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()
}

function gitShow(sha, path) {
  try {
    return execFileSync('git', ['show', `${sha}:${path}`], { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] })
  } catch {
    return null
  }
}

function orderFrom(path) {
  const text = readFileSync(join(repoRoot, path), 'utf8')
  const ids = []
  let inside = false
  for (const line of text.split('\n')) {
    const trim = line.trim()
    if (trim.startsWith('order')) {
      inside = true
      continue
    }
    if (!inside || trim === '' || trim.startsWith('#')) continue
    if (trim === ']') break
    ids.push(trim.replace(/[",]/g, ''))
  }
  if (ids.length === 0) throw new CatalogError(`${path}: empty order`)
  return ids
}

function rulesetOrder(present) {
  const ordered = []
  if (present.has('direct')) ordered.push('direct')
  for (const lang of orderFrom('langs/suite.toml')) {
    if (present.has(lang) && !ordered.includes(lang)) ordered.push(lang)
  }
  for (const id of [...present].sort()) {
    if (!ordered.includes(id)) ordered.push(id)
  }
  if (ordered.length > CHARTS.length) throw new CatalogError(`rulesets need more than ${CHARTS.length} chart colors`)
  return ordered
}

function metricHistory(path) {
  const dirty = git(['status', '--porcelain', '--', path])
  if (dirty) throw new CatalogError(`${path} is dirty; commit it before building the site`)
  const log = git(['log', '--follow', '--format=%H%x09%aI%x09%an <%ae>', '--', path])
  if (!log) throw new CatalogError(`${path} has no git history`)
  return log.split('\n').map(line => {
    const [commit, timestamp, author] = line.split('\t')
    if (!/^[0-9a-f]{40}$/.test(commit)) throw new CatalogError(`${path}: bad commit ${commit}`)
    return { commit, timestamp: utcTimestamp(timestamp), author }
  }).reverse()
}

function utcTimestamp(value) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new CatalogError(`bad timestamp ${value}`)
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z')
}

function readMetric(text, path) {
  const data = JSON.parse(text)
  if (data.pass !== true || !Number.isInteger(data.cost) || data.cost < 0) {
    throw new CatalogError(`${path}: metric.json must pass with a non-negative cost`)
  }
  return data
}

function summaryOf(description) {
  const paragraph = description.split(/\n\n+/)[0]?.replace(/`([^`]+)`/g, '$1').replace(/\s+/g, ' ').trim() ?? ''
  const sentence = paragraph.split(/(?<=[.!])\s/)[0] ?? ''
  if (!sentence) throw new CatalogError('problem summary is empty')
  return sentence.length > 180 ? `${sentence.slice(0, 179)}…` : sentence
}

function splitDescription(body, path) {
  const paragraphs = body.split(/\n\n+/).map(item => item.trim()).filter(item => item.length > 0)
  const credit = paragraphs.find(item => item.startsWith('Adapted from the Rosetta Code'))
  if (!credit) throw new CatalogError(`${path}: missing Rosetta Code credit`)
  const prose = paragraphs.filter(item => item !== credit)
  if (prose.length === 0) throw new CatalogError(`${path}: description is empty`)
  return { description: prose.join('\n\n'), credit }
}

function readCases(problem) {
  const dir = join(repoRoot, 'problems', problem, 'cases')
  if (!existsSync(dir)) throw new CatalogError(`${problem} has no cases`)
  const files = readdirSync(dir).filter(name => name.endsWith('.json')).sort()
  if (files.length === 0) throw new CatalogError(`${problem} has no cases`)
  return files.map(name => {
    const data = JSON.parse(readFileSync(join(dir, name), 'utf8'))
    if (typeof data.name !== 'string' || data.name.length === 0) throw new CatalogError(`${problem}/${name} needs a name`)
    if (!data.reads || typeof data.reads !== 'object' || Array.isArray(data.reads)) throw new CatalogError(`${problem}/${name} needs reads`)
    if (!data.writes || typeof data.writes !== 'object' || Array.isArray(data.writes)) throw new CatalogError(`${problem}/${name} needs writes`)
    return { name: data.name, reads: data.reads, writes: data.writes }
  })
}

function readResources(problem) {
  const path = `problems/${problem}/problem_test.go`
  const text = readFileSync(join(repoRoot, path), 'utf8')
  const at = text.indexOf('Resources:')
  if (at < 0) throw new CatalogError(`${path} has no Resources`)
  const casesAt = text.indexOf('Cases:', at)
  const slice = text.slice(at, casesAt > at ? casesAt : at + 600)
  const resources = []
  for (const match of slice.matchAll(/\{Name:\s*"([A-Za-z_][A-Za-z0-9_]*)"([^}]*)\}/g)) {
    const read = /Read:\s*true/.test(match[2])
    const write = /Write:\s*true/.test(match[2])
    if (!read && !write) throw new CatalogError(`${path} resource ${match[1]} needs Read or Write`)
    resources.push({ name: match[1], read, write })
  }
  if (resources.length === 0) throw new CatalogError(`${path} has no resources`)
  return resources
}

function costsAt(sha, rulesets, problems) {
  const costs = {}
  for (const ruleset of rulesets) {
    costs[ruleset] = {}
    for (const problem of problems) {
      const path = `problems/${problem}/solutions/${ruleset}/metric.json`
      const text = gitShow(sha, path)
      if (text == null) continue
      const data = readMetric(text, `${sha}:${path}`)
      costs[ruleset][problem] = data.cost
    }
  }
  return costs
}

function hostEntries() {
  const documents = []
  const latestPath = join(repoRoot, 'metrics/latest.json')
  if (existsSync(latestPath)) documents.push(JSON.parse(readFileSync(latestPath, 'utf8')))
  const root = join(repoRoot, 'metrics')
  for (const year of readdirSync(root, { withFileTypes: true }).filter(entry => entry.isDirectory())) {
    for (const month of readdirSync(join(root, year.name), { withFileTypes: true }).filter(entry => entry.isDirectory())) {
      for (const day of readdirSync(join(root, year.name, month.name), { withFileTypes: true }).filter(entry => entry.isDirectory())) {
        for (const sha of readdirSync(join(root, year.name, month.name, day.name), { withFileTypes: true }).filter(entry => entry.isDirectory())) {
          const path = join(root, year.name, month.name, day.name, sha.name, 'bench.json')
          if (existsSync(path)) documents.push(JSON.parse(readFileSync(path, 'utf8')))
        }
      }
    }
  }
  const entries = []
  for (const document of documents) {
    if (!Array.isArray(document.runs)) continue
    const commit = document.commit
    entries.push({
      commit,
      author: git(['log', '-1', '--format=%an <%ae>', commit]),
      timestamp: utcTimestamp(git(['log', '-1', '--format=%aI', commit])),
      machine: document.machine,
      hosts: hostsFromRuns(document.runs, commit),
    })
  }
  entries.sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.commit.localeCompare(right.commit))
  return entries
}

function hostsFromRuns(runs, commit) {
  const buckets = new Map()
  for (const run of runs) {
    const bucket = buckets.get(run.host) ?? { id: run.host, environment: run.environment, duration_ms: 0, memory_bytes: 0, runs: 0 }
    if (!Number.isInteger(run.duration_ms) || run.duration_ms < 0) throw new CatalogError(`${commit} ${run.host}: duration_ms`)
    bucket.duration_ms += run.duration_ms
    if (run.memory_bytes != null) bucket.memory_bytes = Math.max(bucket.memory_bytes, run.memory_bytes)
    bucket.runs += 1
    buckets.set(run.host, bucket)
  }
  const go = buckets.get('go')
  if (!go || go.duration_ms < 1) throw new CatalogError(`${commit}: go duration is missing`)
  return [...buckets.values()]
}

function build() {
  const problems = orderFrom('problems/suite.toml')
  const specVersion = readFileSync(join(repoRoot, 'SPEC_VERSION'), 'utf8').trim()
  const head = {
    commit: git(['rev-parse', 'HEAD']),
    author: git(['log', '-1', '--format=%an <%ae>', 'HEAD']),
    timestamp: utcTimestamp(git(['log', '-1', '--format=%aI', 'HEAD'])),
  }
  const present = new Set()
  const solutions = []
  for (const problem of problems) {
    const readmePath = `problems/${problem}/README.md`
    const readme = parseFrontmatter(readFileSync(join(repoRoot, readmePath), 'utf8'), readmePath)
    if (!readme.fields.title) throw new CatalogError(`${readmePath}: frontmatter needs title`)
    const prose = splitDescription(readme.body.trim(), readmePath)
    const directory = join(repoRoot, 'problems', problem, 'solutions')
    for (const entry of readdirSync(directory, { withFileTypes: true }).filter(item => item.isDirectory())) {
      present.add(entry.name)
      const folder = `problems/${problem}/solutions/${entry.name}`
      const meta = parseFrontmatter(readFileSync(join(repoRoot, folder, 'README.md'), 'utf8'), `${folder}/README.md`)
      const metricPath = `${folder}/metric.json`
      const history = metricHistory(metricPath)
      const latest = readMetric(readFileSync(join(repoRoot, metricPath), 'utf8'), metricPath)
      solutions.push({
        problem,
        ruleset: entry.name,
        name: entry.name === 'direct' ? 'direct' : langName(entry.name),
        title: readme.fields.title,
        description: prose.description,
        credit: prose.credit,
        entry: meta.fields.entry,
        author: meta.fields.author,
        notes: meta.body.trim(),
        source: readFileSync(join(repoRoot, folder, meta.fields.entry), 'utf8'),
        path: `${folder}/${meta.fields.entry}`,
        history,
        latest,
      })
    }
  }
  const ordered = rulesetOrder(present)
  const colors = Object.fromEntries(ordered.map((id, index) => [id, CHARTS[index]]))
  const names = Object.fromEntries(ordered.map(id => [id, id === 'direct' ? 'direct' : langName(id)]))
  const commits = []
  const seen = new Set()
  for (const solution of solutions) {
    for (const commit of solution.history) {
      if (seen.has(commit.commit)) continue
      seen.add(commit.commit)
      commits.push(commit)
    }
  }
  commits.sort((left, right) => left.timestamp.localeCompare(right.timestamp) || left.commit.localeCompare(right.commit))
  const passingNow = {}
  const costsNow = {}
  for (const ruleset of ordered) {
    passingNow[ruleset] = solutions.filter(solution => solution.ruleset === ruleset).map(solution => solution.problem)
    costsNow[ruleset] = Object.fromEntries(solutions.filter(solution => solution.ruleset === ruleset).map(solution => [solution.problem, solution.latest.cost]))
  }
  const common = commonProblems(passingNow)
  const totals = aggregateSum(costsNow, common)
  const rulesets = ordered.map(id => {
    const solved = solvedSeries(id, problems, commits)
    const aggregateSeries = commits.map(commit => {
      const costs = costsAt(commit.commit, ordered, problems)
      const then = commonProblems(Object.fromEntries(ordered.map(ruleset => [ruleset, Object.keys(costs[ruleset] ?? {})])))
      const sums = aggregateSum(costs, then)
      return sums[id] === undefined ? null : { ...commit, cost: sums[id] }
    }).filter(point => point !== null)
    const passing = passingNow[id].length
    return {
      id,
      name: names[id],
      color: colors[id],
      passing,
      total: problems.length,
      common: common.length,
      aggregate: passing === 0 ? null : totals[id],
      solved,
      aggregateSeries,
    }
  })
  const catalogProblems = problems.map(id => {
    const owned = solutions.filter(solution => solution.problem === id)
    const first = owned[0]
    return {
      id,
      title: first.title,
      description: first.description,
      summary: summaryOf(first.description),
      credit: first.credit,
      resources: readResources(id),
      cases: readCases(id),
      path: `/problems/${id}`,
      canonical: `${SITE}/problems/${id}`,
      documentTitle: `Thue++ ${first.title}`,
      versions: ordered.filter(ruleset => owned.some(solution => solution.ruleset === ruleset)).map(ruleset => {
        const solution = owned.find(item => item.ruleset === ruleset)
        return {
          id: ruleset,
          name: names[ruleset],
          color: colors[ruleset],
          missing: false,
          notes: solution.notes,
          author: solution.author,
          solutions: [{
            id: solution.entry,
            status: 'pass',
            steps: solution.latest.applied_steps,
            cost: solution.latest.cost,
            regexEvals: solution.latest.regex_evals,
            regexMatches: solution.latest.regex_matches,
            stateBytes: solution.latest.state_bytes,
            statePeak: solution.latest.state_peak,
            ruleCount: solution.latest.rule_count,
            ruleChars: solution.latest.rule_chars,
            solution: solution.source,
            solutionPath: solution.path,
          }],
          series: solution.history.map(commit => {
            const data = readMetric(gitShow(commit.commit, `problems/${id}/solutions/${ruleset}/metric.json`), commit.commit)
            return {
              commit: commit.commit,
              solution: solution.entry,
              cost: data.cost,
              steps: data.applied_steps,
              regexEvals: data.regex_evals,
              regexMatches: data.regex_matches,
              stateBytes: data.state_bytes,
              statePeak: data.state_peak,
              ruleCount: data.rule_count,
              ruleChars: data.rule_chars,
            }
          }),
        }
      }),
    }
  })
  const catalog = {
    schemaVersion: 3,
    specVersion,
    ...head,
    commits,
    commonProblems: common,
    rulesets,
    problems: catalogProblems,
  }
  mkdirSync(dirname(catalogPath), { recursive: true })
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)
  const summary = { schema_version: 2, entries: hostEntries() }
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)
  writeSitemap(catalog)
  console.log(`site: ${catalog.problems.length} problems, ${rulesets.length} rulesets, ${summary.entries.length} host commits`)
}

function langName(id) {
  const path = `langs/${id}/README.md`
  const meta = parseFrontmatter(readFileSync(join(repoRoot, path), 'utf8'), path)
  if (!meta.fields.name) throw new CatalogError(`${path}: frontmatter needs name`)
  return meta.fields.name
}

function solvedSeries(ruleset, problems, commits) {
  let previous = new Set()
  const series = []
  for (const commit of commits) {
    const passing = []
    for (const problem of problems) {
      const text = gitShow(commit.commit, `problems/${problem}/solutions/${ruleset}/metric.json`)
      if (text == null) continue
      const data = JSON.parse(text)
      if (data.pass === true) passing.push(problem)
    }
    const added = passing.filter(problem => !previous.has(problem))
    previous = new Set(passing)
    series.push({ ...commit, count: passing.length, added })
  }
  return series
}

function writeSitemap(catalog) {
  const pages = JSON.parse(readFileSync(join(repoRoot, 'demo/src/pages.json'), 'utf8'))
  const entries = Object.values(pages).map(page => ({ loc: page.canonical, priority: page.path === '/' ? '1.0' : '0.7' }))
  for (const problem of catalog.problems) entries.push({ loc: problem.canonical, priority: '0.6' })
  for (const page of solutionPages(catalog)) entries.push({ loc: page.canonical, priority: '0.5' })
  for (const ruleset of catalog.rulesets) entries.push({ loc: `${SITE}/rulesets/${ruleset.id}`, priority: '0.5' })
  writeFileSync(join(repoRoot, 'demo/public/sitemap.xml'), sitemapXml(entries))
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === entry) {
  try {
    build()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
