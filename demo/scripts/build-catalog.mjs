import { execFileSync } from 'node:child_process'
import { existsSync, globSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse as parseToml } from 'smol-toml'

const BENCH = /^metrics\/(\d{4})\/(\d{2})\/(\d{2})\/([0-9a-f]{40})\/bench\.json$/
const VERSION_IDS = ['direct', 'lisp', 'forth', 'basic']
const LANGUAGE_VERSIONS = new Set(['lisp', 'forth', 'basic'])
const VERSION_NAMES = { direct: 'direct', lisp: 'Lisp', forth: 'Forth', basic: 'BASIC' }
const COUNTERS = [
  ['cost', 'cost', 0],
  ['applied_steps', 'steps', 0],
  ['regex_evals', 'regexEvals', 0],
  ['regex_matches', 'regexMatches', 0],
  ['state_bytes', 'stateBytes', 0],
  ['state_peak', 'statePeak', 0],
  ['rule_count', 'ruleCount', 1],
  ['rule_chars', 'ruleChars', 1],
]

const demoRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const catalogPath = join(demoRoot, 'src', 'generated', 'catalog.json')

export class CatalogError extends Error {}

export function problemDescription(markdown, file = 'problem.md') {
  const lines = markdown.split('\n')
  const index = lines.findIndex(line => line.startsWith('# '))
  if (index < 0) throw new CatalogError(`${file}: missing '# ' title`)
  const title = lines[index].slice(2).trim()
  if (!title) throw new CatalogError(`${file}: title is empty`)
  const description = lines.slice(index + 1).join('\n').trim()
  if (!description) throw new CatalogError(`${file}: description is empty`)
  return { title, description }
}

export function versionIdForSolution(solution) {
  if (LANGUAGE_VERSIONS.has(solution)) return solution
  return 'direct'
}

export function buildProblemCatalog({ specVersion, head, latest, archives, problems, langs }) {
  if (typeof specVersion !== 'string' || specVersion.length === 0) throw new CatalogError('spec version is empty')
  requireHead(head)
  const measured = readSchema4(latest, 'metrics/latest.json')
  const history = archives.map(archive => ({
    ...requireHead(archive),
    rows: readHistory(archive.document, archive.commit),
  }))
  if (history.some(item => item.commit === head.commit)) {
    throw new CatalogError(`HEAD ${head.commit} is already an archived bench`)
  }
  history.push({ ...head, rows: measured })
  history.sort((left, right) => {
    if (left.timestamp < right.timestamp) return -1
    if (left.timestamp > right.timestamp) return 1
    if (left.commit < right.commit) return -1
    if (left.commit > right.commit) return 1
    return 0
  })

  const problemIds = problems.map(problem => problem.id)
  if (new Set(problemIds).size !== problemIds.length) throw new CatalogError('duplicate problem id')
  requireLatestCoverage(measured, problems, langs)

  return {
    schemaVersion: 2,
    specVersion,
    commit: head.commit,
    author: head.author,
    timestamp: head.timestamp,
    commits: history.map(item => ({ commit: item.commit, author: item.author, timestamp: item.timestamp })),
    langs: buildLangs(measured.langs, langs),
    problems: problems.map(problem => buildProblem(problem, measured.problems, history)),
  }
}

export function sitemapXml(entries) {
  const body = entries.map(entry => {
    return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <priority>${entry.priority}</priority>\n  </url>`
  }).join('\n')
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

export function readGeneratedCatalog() {
  if (!existsSync(catalogPath)) {
    throw new CatalogError('demo/src/generated/catalog.json is missing. Run node demo/scripts/build-catalog.mjs')
  }
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  if (catalog.schemaVersion !== 2) throw new CatalogError(`catalog schemaVersion must be 2, got ${catalog.schemaVersion}`)
  return catalog
}

function requireHead(head) {
  if (typeof head?.commit !== 'string' || !/^[0-9a-f]{40}$/.test(head.commit)) {
    throw new CatalogError('commit must be a 40-character hex sha')
  }
  if (typeof head.author !== 'string' || head.author.length === 0) throw new CatalogError(`${head.commit}: author is empty`)
  if (typeof head.timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(head.timestamp)) {
    throw new CatalogError(`${head.commit}: timestamp must be YYYY-MM-DDTHH:MM:SSZ`)
  }
  return { commit: head.commit, author: head.author, timestamp: head.timestamp }
}

function readHistory(document, label) {
  const version = document?.schema_version
  if (version === 2 || version === 3) return null
  if (version !== 4) throw new CatalogError(`${label}: schema_version must be 2, 3, or 4`)
  return readSchema4(document, label)
}

function readSchema4(document, label) {
  if (document?.schema_version !== 4) throw new CatalogError(`${label}: schema_version must be 4`)
  return {
    problems: readBlock(document.problems, label, 'problems', 'make problems', problemRow),
    langs: readBlock(document.langs, label, 'langs', 'make langs', langRow),
  }
}

function readBlock(block, label, name, source, readRow) {
  if (block == null || typeof block !== 'object' || Array.isArray(block)) {
    throw new CatalogError(`${label}: ${name} must be an object`)
  }
  if (block.source !== source || block.host !== 'go' || block.environment !== 'go native') {
    throw new CatalogError(`${label}: ${name} must be ${source} on native Go`)
  }
  if (!Array.isArray(block.results) || block.results.length === 0) {
    throw new CatalogError(`${label}: ${name}.results must be a non-empty array`)
  }
  return block.results.map((row, index) => readRow(row, `${label} ${name} #${index + 1}`))
}

function problemRow(row, label) {
  const problem = requireSlug(row?.problem, `${label} problem`)
  const solution = requireSlug(row?.solution, `${label} solution`)
  return { problem, solution, ...statusCounters(row, `${label} ${problem}/${solution}`) }
}

function langRow(row, label) {
  const lang = requireSlug(row?.lang, `${label} lang`)
  const program = row?.program
  if (typeof program !== 'string' || !program.startsWith(`langs/${lang}/`) || !program.endsWith('.tpp')) {
    throw new CatalogError(`${label}: program must be langs/${lang}/*.tpp`)
  }
  return { lang, program, ...statusCounters(row, `${label} ${program}`) }
}

function statusCounters(row, label) {
  const status = row?.status
  if (status !== 'pass' && status !== 'fail') throw new CatalogError(`${label}: status must be pass or fail`)
  integer(row.duration_ms, `${label} duration_ms`, 0)
  const counters = {}
  for (const [key, field, min] of COUNTERS) {
    if (status === 'fail') {
      if (row[key] !== null) throw new CatalogError(`${label}: fail ${key} must be null`)
      counters[field] = null
    } else {
      counters[field] = integer(row[key], `${label} ${key}`, min)
    }
  }
  return { status, ...counters }
}

function requireLatestCoverage(measured, problems, langs) {
  const expected = new Set()
  for (const problem of problems) {
    for (const solution of Object.keys(problem.solutions)) {
      expected.add(`${problem.id}/${solution}`)
    }
  }
  const seen = new Set()
  for (const row of measured.problems) {
    const key = `${row.problem}/${row.solution}`
    if (seen.has(key)) throw new CatalogError(`${key}: duplicate metrics row`)
    seen.add(key)
    if (!expected.has(key)) throw new CatalogError(`${key}: metrics entry has no solution file`)
  }
  for (const key of expected) {
    if (!seen.has(key)) throw new CatalogError(`${key}: solution has no metrics entry`)
  }
  const programs = new Set(langs.flatMap(lang => lang.programs))
  const seenPrograms = new Set()
  for (const row of measured.langs) {
    if (seenPrograms.has(row.program)) throw new CatalogError(`${row.program}: duplicate language metrics row`)
    seenPrograms.add(row.program)
    if (!programs.has(row.program)) throw new CatalogError(`${row.program}: metrics entry has no language file`)
  }
}

function buildLangs(rows, langs) {
  const byProgram = new Map(rows.map(row => [row.program, row]))
  const built = []
  for (const lang of langs) {
    if (lang.programs.length === 0) {
      if (rows.some(row => row.lang === lang.id)) throw new CatalogError(`${lang.id}: metrics entry has no language file`)
      built.push(missingLang(lang.id, lang.id))
      continue
    }
    for (const program of lang.programs) {
      const stem = program.slice(program.lastIndexOf('/') + 1, -'.tpp'.length)
      const row = byProgram.get(program)
      if (!row) {
        built.push(missingLang(stem, lang.id, program))
        continue
      }
      built.push({
        id: stem,
        language: lang.id,
        name: displayName(stem),
        program,
        status: row.status,
        steps: row.steps,
        cost: row.cost,
        regexEvals: row.regexEvals,
        regexMatches: row.regexMatches,
        stateBytes: row.stateBytes,
        statePeak: row.statePeak,
        ruleCount: row.ruleCount,
        ruleChars: row.ruleChars,
      })
    }
  }
  return built
}

function missingLang(id, language, program = null) {
  return {
    id,
    language,
    name: displayName(id),
    program,
    status: 'missing',
    steps: null,
    cost: null,
    regexEvals: null,
    regexMatches: null,
    stateBytes: null,
    statePeak: null,
    ruleCount: null,
    ruleChars: null,
  }
}

function buildProblem(problem, rows, history) {
  const described = problemDescription(problem.markdown, `${problem.id}/problem.md`)
  const summary = described.description.split(/\n\n+/)[0].replace(/\s+/g, ' ').trim()
  const path = `/problems/${problem.id}`
  const current = rows.filter(row => row.problem === problem.id).map(row => {
    const text = problem.solutions[row.solution]
    requireSolutionText(text, `${problem.id}/${row.solution}`)
    return {
      ...row,
      solutionId: row.solution,
      versionId: versionIdForSolution(row.solution),
      source: text,
      solutionPath: `problems/${problem.id}/solutions/${row.solution}.tpp`,
    }
  })
  const versions = VERSION_IDS.map(id => {
    const solutions = current.filter(row => row.versionId === id).sort((left, right) => left.solutionId < right.solutionId ? -1 : 1)
    return {
      id,
      name: VERSION_NAMES[id],
      missing: solutions.length === 0,
      solutions: solutions.map(row => ({
        id: row.solutionId,
        status: row.status,
        steps: row.steps,
        cost: row.cost,
        regexEvals: row.regexEvals,
        regexMatches: row.regexMatches,
        stateBytes: row.stateBytes,
        statePeak: row.statePeak,
        ruleCount: row.ruleCount,
        ruleChars: row.ruleChars,
        solution: row.source,
        solutionPath: row.solutionPath,
      })),
      series: seriesFor(problem.id, id, history),
    }
  })
  return {
    id: problem.id,
    title: described.title,
    description: described.description,
    summary,
    path,
    canonical: `https://thuelang.org${path}`,
    documentTitle: `${described.title} — Thue++ Problems`,
    versions,
  }
}

function seriesFor(problemId, versionId, history) {
  const points = []
  for (const item of history) {
    if (!item.rows) continue
    const rows = item.rows.problems
      .filter(row => row.problem === problemId && versionIdForSolution(row.solution) === versionId && row.status === 'pass')
      .sort((left, right) => left.solution < right.solution ? -1 : left.solution > right.solution ? 1 : 0)
    for (const row of rows) {
      points.push({
        commit: item.commit,
        solution: `${row.solution}.tpp`,
        cost: row.cost,
        steps: row.steps,
        regexEvals: row.regexEvals,
        regexMatches: row.regexMatches,
        stateBytes: row.stateBytes,
        statePeak: row.statePeak,
        ruleCount: row.ruleCount,
        ruleChars: row.ruleChars,
      })
    }
  }
  return points
}

function requireSolutionText(text, label) {
  if (typeof text !== 'string' || text.trim().length === 0 || !text.endsWith('\n') || text.includes('\r') || text.includes('\0')) {
    throw new CatalogError(`${label}: solution must be non-empty LF text ending in a newline`)
  }
}

function displayName(id) {
  if (Object.hasOwn(VERSION_NAMES, id)) return VERSION_NAMES[id]
  return id.charAt(0).toUpperCase() + id.slice(1)
}

function requireSlug(value, label) {
  if (typeof value !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) throw new CatalogError(`${label} must be a lowercase slug`)
  return value
}

function integer(value, label, min) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min) {
    throw new CatalogError(`${label} must be an integer >= ${min}`)
  }
  return value
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new CatalogError(`git ${args.join(' ')} failed: ${detail}`)
  }
}

function utcTimestamp(iso) {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) throw new CatalogError(`bad commit timestamp ${iso}`)
  const stamp = parsed.toISOString().replace(/\.\d{3}Z$/, 'Z')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(stamp)) throw new CatalogError(`bad commit timestamp ${iso}`)
  return stamp
}

function requireStringList(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new CatalogError(`${label} must be a non-empty list of strings`)
  }
  return value
}

function loadProblems(order) {
  return order.map(id => {
    const directory = join(repoRoot, 'problems', id)
    const markdownPath = join(directory, 'problem.md')
    if (!existsSync(markdownPath)) throw new CatalogError(`${id}: missing problem.md`)
    const solutionsDir = join(directory, 'solutions')
    if (!existsSync(solutionsDir)) throw new CatalogError(`${id}: missing solutions`)
    const solutions = {}
    for (const name of readdirSync(solutionsDir).sort()) {
      if (name.endsWith('.unsupported')) throw new CatalogError(`${id}/${name}: unsupported markers are gone`)
      if (!name.endsWith('.tpp')) throw new CatalogError(`${id}/${name}: solution files are .tpp`)
      const solution = name.slice(0, -'.tpp'.length)
      requireSlug(solution, `${id} solution`)
      solutions[solution] = readFileSync(join(solutionsDir, name), 'utf8')
    }
    if (Object.keys(solutions).length === 0) throw new CatalogError(`${id}: no solutions`)
    return { id, markdown: readFileSync(markdownPath, 'utf8'), solutions }
  })
}

function loadLangs(order) {
  return order.map(id => {
    const directory = join(repoRoot, 'langs', id)
    if (!existsSync(directory)) throw new CatalogError(`${id}: missing language directory`)
    const programs = readdirSync(directory).filter(name => name.endsWith('.tpp')).sort().map(name => `langs/${id}/${name}`)
    return { id, programs }
  })
}

function loadArchives() {
  const paths = globSync('metrics/**/bench.json', { cwd: repoRoot }).sort()
  if (paths.length === 0) throw new CatalogError('metrics/**/bench.json matched nothing')
  return paths.map(rel => {
    const match = BENCH.exec(rel)
    if (!match) throw new CatalogError(`${rel} is not metrics/YYYY/MM/DD/{sha}/bench.json`)
    const [, year, month, day, sha] = match
    const document = JSON.parse(readFileSync(join(repoRoot, rel), 'utf8'))
    if (document.commit !== sha) throw new CatalogError(`${rel}: commit does not match the directory`)
    const timestamp = document.timestamp
    if (typeof timestamp !== 'string' || timestamp.slice(0, 10) !== `${year}-${month}-${day}`) {
      throw new CatalogError(`${rel}: date does not match ${timestamp}`)
    }
    return {
      commit: sha,
      author: typeof document.author === 'string' ? document.author : '',
      timestamp,
      document,
    }
  })
}

function priorityFor(path) {
  if (path === '/') return '1.0'
  if (path === '/docs/guides' || path === '/docs/language' || path === '/playground') return '0.8'
  if (path.startsWith('/problems/')) return '0.5'
  return '0.6'
}

function writeSitemap(catalog) {
  const pages = JSON.parse(readFileSync(join(demoRoot, 'src', 'pages.json'), 'utf8'))
  const entries = [
    ...Object.values(pages).map(page => ({ loc: `https://thuelang.org${page.path === '/' ? '/' : page.path}`, priority: priorityFor(page.path) })),
    ...catalog.problems.map(problem => ({ loc: problem.canonical, priority: priorityFor(problem.path) })),
  ]
  writeFileSync(join(demoRoot, 'public', 'sitemap.xml'), sitemapXml(entries))
}

function main() {
  const problemOrder = requireStringList(parseToml(readFileSync(join(repoRoot, 'problems', 'suite.toml'), 'utf8')).order, 'problems/suite.toml order')
  const langOrder = requireStringList(parseToml(readFileSync(join(repoRoot, 'langs', 'suite.toml'), 'utf8')).order, 'langs/suite.toml order')
  const specVersion = readFileSync(join(repoRoot, 'SPEC_VERSION'), 'utf8').trim()
  const latest = JSON.parse(readFileSync(join(repoRoot, 'metrics', 'latest.json'), 'utf8'))
  if ('commit' in latest || 'author' in latest || 'timestamp' in latest) {
    throw new CatalogError('metrics/latest.json must not store a commit; the catalog uses HEAD')
  }
  const head = {
    commit: git(['rev-parse', 'HEAD']),
    author: git(['log', '-1', '--format=%an <%ae>', 'HEAD']),
    timestamp: utcTimestamp(git(['log', '-1', '--format=%aI', 'HEAD'])),
  }
  const catalog = buildProblemCatalog({
    specVersion,
    head,
    latest,
    archives: loadArchives(),
    problems: loadProblems(problemOrder),
    langs: loadLangs(langOrder),
  })
  mkdirSync(dirname(catalogPath), { recursive: true })
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)
  writeSitemap(catalog)
  const measured = catalog.problems.reduce((sum, problem) => sum + problem.versions.reduce((inner, version) => inner + version.solutions.length, 0), 0)
  console.log(`catalog: ${catalog.problems.length} problems, ${measured} solutions, ${catalog.langs.length} language versions, ${catalog.commit.slice(0, 12)}`)
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === entry) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}
