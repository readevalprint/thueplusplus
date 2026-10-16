import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { parse as parseToml } from 'smol-toml'

const HOSTS = ['python', 'go', 'wasm']
const STATUSES = new Set(['pass', 'fail', 'unsupported'])
const demoRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const catalogPath = join(demoRoot, 'src', 'generated', 'catalog.json')
const resultsPath = join(repoRoot, 'build', 'tasks', 'results.json')

export class CatalogError extends Error {}

export function taskDescription(markdown, file = 'task.md') {
  const lines = markdown.split('\n')
  const index = lines.findIndex(line => line.startsWith('# '))
  if (index < 0) throw new CatalogError(`${file}: missing '# ' title`)
  const title = lines[index].slice(2).trim()
  if (!title) throw new CatalogError(`${file}: title is empty`)
  const description = lines.slice(index + 1).join('\n').trim()
  if (!description) throw new CatalogError(`${file}: description is empty`)
  return { title, description }
}

export function transcriptCases(taskId, transcript) {
  if (transcript?.name !== taskId) {
    throw new CatalogError(`${taskId}/io.toml: name must be ${taskId}`)
  }
  if (transcript.case == null) return [oneCase(taskId, taskId, transcript)]
  if (!Array.isArray(transcript.case) || transcript.case.length === 0) {
    throw new CatalogError(`${taskId}/io.toml: case must be a non-empty array when present`)
  }
  return transcript.case.map((item, index) => {
    if (typeof item?.name !== 'string' || item.name.length === 0) {
      throw new CatalogError(`${taskId}/io.toml: case ${index} is missing a name`)
    }
    return oneCase(taskId, item.name, item)
  })
}

export function buildCatalog(results, sources) {
  requireResults(results)
  const taskIds = requireStringList(sources.taskOrder, 'suite order')
  const guests = sources.guests
  if (!Array.isArray(guests) || guests.length === 0) throw new CatalogError('guests.toml has no guests')
  const guestIds = guests.map(guest => {
    if (typeof guest?.id !== 'string' || typeof guest.program !== 'string' || typeof guest.extension !== 'string') {
      throw new CatalogError('each guest needs id, program, and extension')
    }
    return guest.id
  })
  if (!sameList(results.tasks.map(task => task.id), taskIds)) {
    throw new CatalogError('results.tasks do not match tasks/suite.toml')
  }
  if (!sameList(results.guests.map(guest => guest.id), guestIds)) {
    throw new CatalogError('results.guests do not match tasks/guests.toml')
  }
  for (const task of results.tasks) {
    if (typeof task.title !== 'string' || task.title.length === 0) {
      throw new CatalogError(`${task.id}: results title is empty`)
    }
  }
  for (const guest of guests) {
    const row = results.guests.find(item => item.id === guest.id)
    if (row.program !== guest.program) {
      throw new CatalogError(`${guest.id}: results program ${row.program} does not match ${guest.program}`)
    }
    if (!Number.isInteger(row.rule_count) || row.rule_count < 1) {
      throw new CatalogError(`${guest.id}: rule_count must be a positive integer`)
    }
  }
  requireCoverage(results, taskIds, guestIds)

  const tasks = taskIds.map(taskId => buildTask(results, sources, taskId, guestIds))
  return {
    schemaVersion: 1,
    specVersion: results.spec_version,
    commit: results.commit,
    commitDirty: results.commit_dirty,
    author: results.author,
    timestamp: results.timestamp,
    guests: guestIds.map(guestId => buildGuest(results, sources, tasks, guestId)),
    tasks,
  }
}

export function sitemapXml(entries) {
  const body = entries.map(entry => {
    return `  <url>\n    <loc>${escapeXml(entry.loc)}</loc>\n    <priority>${entry.priority}</priority>\n  </url>`
  }).join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`
}

export function taskPages(catalog) {
  return catalog.tasks.map(task => ({
    path: task.path,
    title: task.title,
    documentTitle: task.documentTitle,
    description: task.summary,
    canonical: task.canonical,
    robots: 'index,follow',
  }))
}

export function readGeneratedCatalog() {
  if (!existsSync(catalogPath)) {
    throw new CatalogError('demo/src/generated/catalog.json is missing. Run node demo/scripts/build-catalog.mjs')
  }
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'))
  if (catalog.schemaVersion !== 1) throw new CatalogError(`catalog schemaVersion must be 1, got ${catalog.schemaVersion}`)
  return catalog
}

function oneCase(taskId, name, block) {
  const expect = block.expect
  if (expect == null || typeof expect !== 'object' || Array.isArray(expect)) {
    throw new CatalogError(`${taskId}/${name}: expect is required`)
  }
  if (typeof expect.stdout !== 'string') throw new CatalogError(`${taskId}/${name}: expect.stdout must be a string`)
  if (typeof expect.stderr !== 'string') throw new CatalogError(`${taskId}/${name}: expect.stderr must be a string`)
  if (!Number.isInteger(expect.exit_code)) throw new CatalogError(`${taskId}/${name}: expect.exit_code must be an integer`)
  const stdin = block.stdin == null ? '' : block.stdin
  if (typeof stdin !== 'string') throw new CatalogError(`${taskId}/${name}: stdin must be a string`)
  return { name, stdin, stdout: expect.stdout, stderr: expect.stderr, exitCode: expect.exit_code }
}

function requireResults(results) {
  if (results?.schema_version !== 1) {
    throw new CatalogError(`results schema_version must be 1, got ${results?.schema_version}`)
  }
  if (!Array.isArray(results.errors) || results.errors.length !== 0) {
    throw new CatalogError(`results.errors must be an empty array, got ${JSON.stringify(results.errors)}`)
  }
  if (!sameList(results.hosts, HOSTS)) {
    throw new CatalogError(`results.hosts must be ${HOSTS.join(', ')}`)
  }
  if (typeof results.spec_version !== 'string' || results.spec_version.length === 0) {
    throw new CatalogError('results.spec_version must be a non-empty string')
  }
  if (typeof results.commit !== 'string' || !/^[0-9a-f]{40}$/.test(results.commit)) {
    throw new CatalogError('results.commit must be a 40-character hex sha')
  }
  if (typeof results.commit_dirty !== 'boolean') throw new CatalogError('results.commit_dirty must be a boolean')
  if (typeof results.author !== 'string' || results.author.length === 0) {
    throw new CatalogError('results.author must be a non-empty string')
  }
  if (typeof results.timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(results.timestamp)) {
    throw new CatalogError('results.timestamp must be YYYY-MM-DDTHH:MM:SSZ')
  }
  if (!Array.isArray(results.tasks) || !Array.isArray(results.guests) || !Array.isArray(results.results)) {
    throw new CatalogError('results.tasks, results.guests, and results.results must be arrays')
  }
  if (results.grid == null || typeof results.grid !== 'object') throw new CatalogError('results.grid is missing')
}

function requireCoverage(results, taskIds, guestIds) {
  for (const taskId of taskIds) {
    for (const guestId of guestIds) {
      const cell = results.grid?.[taskId]?.[guestId]
      if (!cell || !STATUSES.has(cell.status)) {
        throw new CatalogError(`${taskId}/${guestId}: grid status is missing`)
      }
      for (const host of HOSTS) {
        const found = results.results.filter(row => row.task === taskId && row.guest === guestId && row.host === host)
        if (found.length !== 1) throw new CatalogError(`${taskId}/${guestId}/${host}: expected one results row, found ${found.length}`)
      }
    }
  }
}

function buildTask(results, sources, taskId, guestIds) {
  const file = sources.files?.[taskId]
  if (!file) throw new CatalogError(`${taskId}: missing task files`)
  const described = taskDescription(file.markdown, `${taskId}/task.md`)
  const resultTask = results.tasks.find(task => task.id === taskId)
  if (described.title !== resultTask.title) {
    throw new CatalogError(`${taskId}: task.md title ${described.title} does not match results title ${resultTask.title}`)
  }
  const cases = transcriptCases(taskId, file.transcript)
  const summary = described.description.split(/\n\n+/)[0].replace(/\s+/g, ' ').trim()
  const path = `/tasks/${taskId}`
  return {
    id: taskId,
    title: described.title,
    description: described.description,
    summary,
    path,
    canonical: `https://thuelang.org${path}`,
    documentTitle: `${described.title} — Thue++ Tasks`,
    cases,
    guests: guestIds.map(guestId => buildGuestResult(results, file, taskId, guestId)),
  }
}

function buildGuestResult(results, file, taskId, guestId) {
  const cell = results.grid[taskId][guestId]
  const solution = file.solutions?.[guestId]
  if (!solution) throw new CatalogError(`${taskId}/${guestId}: missing solution file`)
  const rows = results.results.filter(row => row.task === taskId && row.guest === guestId)
  const ruleCount = results.guests.find(guest => guest.id === guestId).rule_count
  for (const row of rows) {
    if (row.guest_rule_count !== ruleCount) {
      throw new CatalogError(`${taskId}/${guestId}/${row.host}: guest_rule_count does not match the guest`)
    }
  }
  const name = guestName(guestId)
  if (cell.status === 'unsupported') {
    if (solution.kind !== 'unsupported') throw new CatalogError(`${taskId}/${guestId}: grid says unsupported but a solution file is present`)
    if (cell.step_count !== null) throw new CatalogError(`${taskId}/${guestId}: unsupported step_count must be null`)
    if (typeof solution.reason !== 'string' || solution.reason.length === 0) {
      throw new CatalogError(`${taskId}/${guestId}: unsupported reason is empty`)
    }
    for (const row of rows) {
      if (row.status !== 'unsupported' || row.reason !== solution.reason || row.step_count !== null || row.solution_path !== null) {
        throw new CatalogError(`${taskId}/${guestId}/${row.host}: unsupported row does not match the marker`)
      }
    }
    return { id: guestId, name, status: 'unsupported', stepCount: null, solution: null, solutionPath: null, reason: solution.reason, error: null }
  }
  if (solution.kind !== 'solution') throw new CatalogError(`${taskId}/${guestId}: grid says ${cell.status} but the solution file is missing`)
  if (typeof solution.text !== 'string' || solution.text.trim().length === 0 || solution.text.includes('\r') || solution.text.includes('\0')) {
    throw new CatalogError(`${taskId}/${guestId}: solution must be non-empty LF text`)
  }
  const solutionPath = rows[0].solution_path
  if (typeof solutionPath !== 'string' || solutionPath.length === 0) {
    throw new CatalogError(`${taskId}/${guestId}: solution_path is missing`)
  }
  for (const row of rows) {
    if (row.solution_path !== solutionPath) throw new CatalogError(`${taskId}/${guestId}: hosts disagree on solution_path`)
  }
  if (cell.status === 'pass') {
    if (!Number.isInteger(cell.step_count) || cell.step_count < 0) {
      throw new CatalogError(`${taskId}/${guestId}: pass step_count must be a non-negative integer`)
    }
    for (const row of rows) {
      if (row.status !== 'pass' || row.step_count !== cell.step_count || row.error != null) {
        throw new CatalogError(`${taskId}/${guestId}/${row.host}: pass row does not match the grid`)
      }
    }
    return { id: guestId, name, status: 'pass', stepCount: cell.step_count, solution: solution.text, solutionPath, reason: null, error: null }
  }
  if (cell.status !== 'fail') throw new CatalogError(`${taskId}/${guestId}: unknown status ${cell.status}`)
  if (cell.step_count !== null) throw new CatalogError(`${taskId}/${guestId}: fail step_count must be null on the grid`)
  const errors = []
  for (const row of rows) {
    if (row.status === 'fail') {
      if (typeof row.error !== 'string' || row.error.length === 0) {
        throw new CatalogError(`${taskId}/${guestId}/${row.host}: fail row is missing error text`)
      }
      if (!errors.includes(row.error)) errors.push(row.error)
    }
  }
  if (errors.length === 0) throw new CatalogError(`${taskId}/${guestId}: fail grid cell has no failing host`)
  return { id: guestId, name, status: 'fail', stepCount: null, solution: solution.text, solutionPath, reason: null, error: errors.join('\n') }
}

function buildGuest(results, sources, tasks, guestId) {
  const meta = sources.guests.find(guest => guest.id === guestId)
  const ruleCount = results.guests.find(guest => guest.id === guestId).rule_count
  let passCount = 0
  let stepCount = 0
  for (const task of tasks) {
    const cell = task.guests.find(guest => guest.id === guestId)
    if (cell.status === 'pass') {
      passCount += 1
      stepCount += cell.stepCount
    }
  }
  return {
    id: guestId,
    name: guestName(guestId),
    program: meta.program,
    ruleCount,
    passCount,
    taskCount: tasks.length,
    stepCount,
  }
}

function guestName(id) {
  return id.charAt(0).toUpperCase() + id.slice(1)
}

function requireStringList(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some(item => typeof item !== 'string' || item.length === 0)) {
    throw new CatalogError(`${label} must be a non-empty list of strings`)
  }
  return value
}

function sameList(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((item, index) => item === right[index])
}

function escapeXml(value) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;')
}

function loadSuite() {
  const suite = parseToml(readFileSync(join(repoRoot, 'tasks', 'suite.toml'), 'utf8'))
  const guestFile = parseToml(readFileSync(join(repoRoot, 'tasks', 'guests.toml'), 'utf8'))
  const taskOrder = requireStringList(suite.order, 'tasks/suite.toml order')
  const guests = guestFile.guest
  if (!Array.isArray(guests)) throw new CatalogError('tasks/guests.toml is missing [[guest]]')
  return { taskOrder, guests }
}

function loadSources(taskOrder, guests) {
  const files = {}
  for (const taskId of taskOrder) {
    const directory = join(repoRoot, 'tasks', taskId)
    const markdownPath = join(directory, 'task.md')
    const transcriptPath = join(directory, 'io.toml')
    if (!existsSync(markdownPath) || !existsSync(transcriptPath)) {
      throw new CatalogError(`${taskId}: missing task.md or io.toml`)
    }
    const solutions = {}
    for (const guest of guests) {
      const program = join(directory, 'solutions', `${guest.id}.${guest.extension}`)
      const marker = join(directory, 'solutions', `${guest.id}.unsupported`)
      const hasProgram = existsSync(program)
      const hasMarker = existsSync(marker)
      if (hasProgram === hasMarker) {
        throw new CatalogError(`${taskId}/${guest.id}: need exactly one of ${guest.extension} or unsupported`)
      }
      solutions[guest.id] = hasProgram
        ? { kind: 'solution', text: readFileSync(program, 'utf8') }
        : { kind: 'unsupported', reason: readFileSync(marker, 'utf8').trim() }
    }
    files[taskId] = {
      markdown: readFileSync(markdownPath, 'utf8'),
      transcript: parseToml(readFileSync(transcriptPath, 'utf8')),
      solutions,
    }
  }
  return files
}

function priorityFor(path) {
  if (path === '/') return '1.0'
  if (path === '/learn' || path === '/reference' || path === '/playground') return '0.8'
  if (path.startsWith('/tasks/')) return '0.5'
  return '0.6'
}

function writeSitemap(catalog) {
  const pages = JSON.parse(readFileSync(join(demoRoot, 'src', 'pages.json'), 'utf8'))
  const entries = [
    ...Object.values(pages).map(page => ({ loc: `https://thuelang.org${page.path === '/' ? '/' : page.path}`, priority: priorityFor(page.path) })),
    ...catalog.tasks.map(task => ({ loc: task.canonical, priority: priorityFor(task.path) })),
  ]
  writeFileSync(join(demoRoot, 'public', 'sitemap.xml'), sitemapXml(entries))
}

function main() {
  if (!existsSync(resultsPath)) {
    throw new CatalogError('build/tasks/results.json is missing. Run make tasks before building the site.')
  }
  const results = JSON.parse(readFileSync(resultsPath, 'utf8'))
  const { taskOrder, guests } = loadSuite()
  const catalog = buildCatalog(results, { taskOrder, guests, files: loadSources(taskOrder, guests) })
  mkdirSync(dirname(catalogPath), { recursive: true })
  writeFileSync(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`)
  writeSitemap(catalog)
  console.log(`catalog: ${catalog.tasks.length} tasks, ${catalog.guests.length} guests, ${catalog.commit.slice(0, 12)}`)
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
