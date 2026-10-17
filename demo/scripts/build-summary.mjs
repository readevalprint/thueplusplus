import { execFileSync } from 'node:child_process'
import { existsSync, globSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse as parseToml } from 'smol-toml'

const demoRoot = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../..', import.meta.url))
const summaryPath = join(demoRoot, 'src', 'generated', 'summary.json')
const BENCH = /^metrics\/(\d{4})\/(\d{2})\/(\d{2})\/([0-9a-f]{40})\/bench\.json$/

export class SummaryError extends Error {}

function hostIds() {
  const parsed = parseToml(readFileSync(join(repoRoot, 'hosts.toml'), 'utf8'))
  if (!Array.isArray(parsed.host) || parsed.host.length === 0) throw new SummaryError('hosts.toml host must be a non-empty array')
  return parsed.host.map(row => {
    if (typeof row?.id !== 'string' || row.id.length === 0) throw new SummaryError('hosts.toml id is empty')
    return row.id
  })
}

function requireText(value, label) {
  if (typeof value !== 'string' || value.length === 0) throw new SummaryError(`${label} must be a non-empty string`)
  return value
}

function count(value, label) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new SummaryError(`${label} must be a non-negative integer`)
  }
  return value
}

export function summarize(files, ids) {
  const entries = files.map(file => summarizeFile(file, ids))
  entries.sort((left, right) => {
    if (left.timestamp < right.timestamp) return -1
    if (left.timestamp > right.timestamp) return 1
    if (left.commit < right.commit) return -1
    if (left.commit > right.commit) return 1
    return 0
  })
  const seen = new Set()
  for (const entry of entries) {
    if (seen.has(entry.commit)) throw new SummaryError(`duplicate commit ${entry.commit}`)
    seen.add(entry.commit)
  }
  return { schema_version: 1, entries }
}

function summarizeFile(file, ids) {
  const match = BENCH.exec(file.rel)
  if (!match) throw new SummaryError(`${file.rel} is not metrics/YYYY/MM/DD/{sha}/bench.json`)
  const [, year, month, day, sha] = match
  const bench = file.document
  if (bench?.schema_version !== 2 && bench?.schema_version !== 3) throw new SummaryError(`${file.rel}: schema_version must be 2 or 3`)
  if (bench.commit !== sha) throw new SummaryError(`${file.rel}: commit does not match the directory`)
  const timestamp = requireText(bench.timestamp, `${sha} timestamp`)
  if (timestamp.slice(0, 10) !== `${year}-${month}-${day}`) {
    throw new SummaryError(`${file.rel}: date does not match ${timestamp}`)
  }
  const version = bench.schema_version
  return {
    commit: sha,
    author: requireText(bench.author, `${sha} author`),
    timestamp,
    machine: summarizeMachine(sha, bench.machine),
    guests: summarizeGuests(sha, bench.guests),
    tasks: summarizeTasks(sha, bench.tasks),
    problems: summarizeProblems(sha, version, bench.problems),
    langs: summarizeLangs(sha, version, bench.langs),
    benchmarks: summarizeBenchmarks(sha, bench.benchmarks, ids),
  }
}

function summarizeMachine(commit, machine) {
  if (machine == null) return null
  if (typeof machine !== 'object' || Array.isArray(machine)) {
    throw new SummaryError(`${commit}: machine must be an object or null`)
  }
  const keys = ['os', 'release', 'arch', 'cpu', 'cpus']
  const present = Object.keys(machine)
  if (present.length !== keys.length || keys.some(key => !Object.hasOwn(machine, key))) {
    throw new SummaryError(`${commit}: machine keys must be ${keys.join(', ')}`)
  }
  const cpus = machine.cpus
  if (typeof cpus !== 'number' || !Number.isInteger(cpus) || cpus < 1) {
    throw new SummaryError(`${commit}: machine cpus must be a positive integer`)
  }
  return {
    os: requireText(machine.os, `${commit} machine os`),
    release: requireText(machine.release, `${commit} machine release`),
    arch: requireText(machine.arch, `${commit} machine arch`),
    cpu: requireText(machine.cpu, `${commit} machine cpu`),
    cpus,
  }
}

function summarizeGuests(commit, guests) {
  if (guests == null || typeof guests !== 'object' || Array.isArray(guests)) {
    throw new SummaryError(`${commit}: guests must be an object`)
  }
  const out = {}
  for (const [id, guest] of Object.entries(guests)) {
    if (typeof guest?.rule_lines === 'number') out[id] = count(guest.rule_lines, `${commit} ${id} rule_lines`)
  }
  return out
}

function summarizeTasks(commit, tasks) {
  if (tasks == null) return null
  if (tasks.host !== 'go' || tasks.environment !== 'go native' || tasks.source !== 'make tasks') {
    throw new SummaryError(`${commit}: tasks are recorded from native Go`)
  }
  if (!Array.isArray(tasks.results) || tasks.results.length === 0) {
    throw new SummaryError(`${commit}: tasks results must be a non-empty array`)
  }
  const guests = {}
  for (const row of tasks.results) {
    const guest = requireText(row?.guest, `${commit} guest`)
    const status = row.status
    if (status !== 'pass' && status !== 'fail' && status !== 'unsupported') {
      throw new SummaryError(`${commit} ${guest}: status ${status}`)
    }
    const bucket = guests[guest] ?? { pass: 0, fail: 0, unsupported: 0, steps: 0 }
    if (status === 'pass') {
      bucket.pass += 1
      bucket.steps += count(row.applied_steps, `${commit} ${guest} applied_steps`)
    } else if (status === 'fail') {
      bucket.fail += 1
    } else {
      bucket.unsupported += 1
    }
    guests[guest] = bucket
  }
  return guests
}

const COUNTER_AXES = ['regex_evals', 'regex_matches', 'state_bytes', 'rule_count', 'rule_chars']
const PROBLEM_ROW_KEYS = ['problem', 'solution', 'status', 'applied_steps', 'regex_evals', 'regex_matches', 'state_bytes', 'state_peak', 'rule_count', 'rule_chars', 'duration_ms']
const LANG_ROW_KEYS = ['lang', 'program', 'status', 'applied_steps', 'regex_evals', 'regex_matches', 'state_bytes', 'state_peak', 'rule_count', 'rule_chars', 'duration_ms']

function summarizeProblems(commit, version, problems) {
  if (version === 2) {
    if (problems !== undefined) throw new SummaryError(`${commit}: schema 2 must not store problems`)
    return null
  }
  return summarizeCounters(commit, 'problems', problems, 'make problems', PROBLEM_ROW_KEYS, row => {
    const problem = slug(row.problem, `${commit} problem`)
    const solution = slug(row.solution, `${commit} ${problem} solution`)
    return [`${problem}/${solution}`, { problem, solution }]
  })
}

function summarizeLangs(commit, version, langs) {
  if (version === 2) {
    if (langs !== undefined) throw new SummaryError(`${commit}: schema 2 must not store langs`)
    return null
  }
  return summarizeCounters(commit, 'langs', langs, 'make langs', LANG_ROW_KEYS, row => {
    const lang = langId(row.lang, `${commit} lang`)
    const program = programPath(row.program, `${commit} ${lang} program`)
    return [`${lang}/${program}`, { lang, program }]
  })
}

function summarizeCounters(commit, field, suite, source, rowKeys, identityOf) {
  if (suite == null || typeof suite !== 'object' || Array.isArray(suite)) {
    throw new SummaryError(`${commit}: ${field} must be an object`)
  }
  const suiteKeys = ['source', 'host', 'environment', 'results']
  const present = Object.keys(suite)
  if (present.length !== suiteKeys.length || suiteKeys.some(key => !Object.hasOwn(suite, key))) {
    throw new SummaryError(`${commit}: ${field} keys must be source, host, environment, and results`)
  }
  if (suite.source !== source) throw new SummaryError(`${commit}: ${field} source must be ${source}`)
  if (suite.host !== 'go' || suite.environment !== 'go native') {
    throw new SummaryError(`${commit}: ${field} is recorded from native Go`)
  }
  if (!Array.isArray(suite.results) || suite.results.length === 0) {
    throw new SummaryError(`${commit}: ${field} results must be a non-empty array`)
  }
  const seen = new Set()
  return suite.results.map(row => {
    if (row == null || typeof row !== 'object' || Array.isArray(row)) {
      throw new SummaryError(`${commit}: ${field} row must be an object`)
    }
    const rowPresent = Object.keys(row)
    if (rowPresent.length !== rowKeys.length || rowKeys.some(key => !Object.hasOwn(row, key))) {
      throw new SummaryError(`${commit}: ${field} row keys must be ${rowKeys.join(', ')}`)
    }
    const [identity, names] = identityOf(row)
    if (seen.has(identity)) throw new SummaryError(`${commit}: duplicate ${field} row ${identity}`)
    seen.add(identity)
    count(row.duration_ms, `${commit} ${identity} duration_ms`)
    return { ...names, ...counterFields(commit, identity, row) }
  })
}

function counterFields(commit, identity, row) {
  const status = row.status
  if (status !== 'pass' && status !== 'fail') throw new SummaryError(`${commit} ${identity}: status ${status}`)
  const out = { status }
  for (const key of ['applied_steps', 'state_peak', ...COUNTER_AXES]) {
    if (status === 'fail') {
      if (row[key] !== null) throw new SummaryError(`${commit} ${identity}: fail clears ${key}`)
      continue
    }
    const value = count(row[key], `${commit} ${identity} ${key}`)
    if (COUNTER_AXES.includes(key)) out[key] = value
  }
  if (status === 'pass' && (out.rule_count < 1 || out.rule_chars < 1)) {
    throw new SummaryError(`${commit} ${identity}: rule count and rule chars come from the source`)
  }
  if (status === 'fail') {
    for (const key of COUNTER_AXES) out[key] = null
  }
  return out
}

function slug(value, label) {
  const text = requireText(value, label)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text)) throw new SummaryError(`${label} must be a lowercase slug`)
  return text
}

function langId(value, label) {
  const text = requireText(value, label)
  if (!/^[a-z][a-z0-9-]*$/.test(text)) throw new SummaryError(`${label} must be a lowercase slug`)
  return text
}

function programPath(value, label) {
  const text = requireText(value, label)
  if (text.includes('\\') || text.startsWith('/') || text.includes('..') || !(text.endsWith('.thue') || text.endsWith('.tpp'))) {
    throw new SummaryError(`${label} must be a repo-relative .thue or .tpp path`)
  }
  return text
}

function summarizeBenchmarks(commit, benchmarks, ids) {
  if (benchmarks == null) return null
  if (!Array.isArray(benchmarks.workloads) || benchmarks.workloads.length === 0) {
    throw new SummaryError(`${commit}: workloads must be a non-empty array`)
  }
  return benchmarks.workloads.map(workload => {
    const id = requireText(workload?.id, `${commit} workload`)
    const hosts = workload.hosts
    if (hosts == null || typeof hosts !== 'object' || Array.isArray(hosts)) {
      throw new SummaryError(`${commit} ${id}: hosts must be an object`)
    }
    const names = Object.keys(hosts)
    if (names.length === 0 || names.some(name => !ids.includes(name))) {
      throw new SummaryError(`${commit} ${id}: unknown benchmark host`)
    }
    const steps = new Set(names.map(name => hosts[name].applied_steps))
    const probes = new Set(names.map(name => hosts[name].probes))
    if (steps.size !== 1 || probes.size !== 1) {
      throw new SummaryError(`${commit} ${id}: hosts disagree on applied_steps or probes`)
    }
    return {
      id,
      steps: count(workload.hosts[names[0]].applied_steps, `${commit} ${id} steps`),
      probes: count(workload.hosts[names[0]].probes, `${commit} ${id} probes`),
      max_steps: count(workload.max_steps, `${commit} ${id} max_steps`),
      max_evals: count(workload.max_evals, `${commit} ${id} max_evals`),
      max_state_bytes: count(workload.max_state_bytes, `${commit} ${id} max_state_bytes`),
      timeout_seconds: count(workload.timeout_seconds, `${commit} ${id} timeout_seconds`),
      memory_cap_bytes: count(workload.memory_cap_bytes, `${commit} ${id} memory_cap_bytes`),
      hosts: ids.filter(name => name in hosts).map(name => {
        const row = hosts[name]
        const memory = row.memory_bytes
        if (memory !== null) count(memory, `${commit} ${id} ${name} memory_bytes`)
        return {
          id: name,
          environment: requireText(row.environment, `${commit} ${id} ${name} environment`),
          duration_ms: count(row.duration_ms, `${commit} ${id} ${name} duration_ms`),
          memory_bytes: memory,
          exit_code: row.exit_code,
        }
      }),
    }
  })
}

function git(args) {
  try {
    return execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    throw new SummaryError(`git ${args.join(' ')} failed: ${detail}`)
  }
}

function utcTimestamp(iso) {
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) throw new SummaryError(`bad commit timestamp ${iso}`)
  const stamp = parsed.toISOString().replace(/\.\d{3}Z$/, 'Z')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(stamp)) {
    throw new SummaryError(`bad commit timestamp ${iso}`)
  }
  return stamp
}

function headMeasurement(latest) {
  if (latest?.schema_version !== 2 && latest?.schema_version !== 3) throw new SummaryError('metrics/latest.json schema_version must be 2 or 3')
  if ('commit' in latest || 'author' in latest || 'timestamp' in latest) {
    throw new SummaryError('metrics/latest.json must not store a commit; the summary uses HEAD')
  }
  if (latest.machine == null || typeof latest.machine !== 'object' || Array.isArray(latest.machine)) {
    throw new SummaryError('metrics/latest.json machine is required')
  }
  const sha = git(['rev-parse', 'HEAD'])
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new SummaryError(`HEAD is not a full sha: ${sha}`)
  const author = git(['log', '-1', '--format=%an <%ae>', 'HEAD'])
  const timestamp = utcTimestamp(git(['log', '-1', '--format=%aI', 'HEAD']))
  const [year, month, day] = timestamp.slice(0, 10).split('-')
  return {
    rel: `metrics/${year}/${month}/${day}/${sha}/bench.json`,
    document: { ...latest, commit: sha, author, timestamp },
  }
}

function readBenches() {
  const paths = globSync('metrics/**/bench.json', { cwd: repoRoot }).sort()
  if (paths.length === 0) throw new SummaryError('metrics/**/bench.json matched nothing')
  const latestPath = join(repoRoot, 'metrics', 'latest.json')
  if (!existsSync(latestPath)) throw new SummaryError('metrics/latest.json does not exist')
  const files = paths.map(rel => ({
    rel,
    document: JSON.parse(readFileSync(join(repoRoot, rel), 'utf8')),
  }))
  files.push(headMeasurement(JSON.parse(readFileSync(latestPath, 'utf8'))))
  return files
}

function main() {
  const summary = summarize(readBenches(), hostIds())
  mkdirSync(dirname(summaryPath), { recursive: true })
  writeFileSync(summaryPath, `${JSON.stringify(summary)}\n`)
  const measured = summary.entries.filter(entry => entry.tasks && entry.benchmarks).length
  console.log(`summary: ${summary.entries.length} commits, ${measured} measured, ${summaryPath}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
