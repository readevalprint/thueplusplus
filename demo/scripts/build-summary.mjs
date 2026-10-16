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
  if (bench?.schema_version !== 2) throw new SummaryError(`${file.rel}: schema_version must be 2`)
  if (bench.commit !== sha) throw new SummaryError(`${file.rel}: commit does not match the directory`)
  const timestamp = requireText(bench.timestamp, `${sha} timestamp`)
  if (timestamp.slice(0, 10) !== `${year}-${month}-${day}`) {
    throw new SummaryError(`${file.rel}: date does not match ${timestamp}`)
  }
  return {
    commit: sha,
    author: requireText(bench.author, `${sha} author`),
    timestamp,
    guests: summarizeGuests(sha, bench.guests),
    tasks: summarizeTasks(sha, bench.tasks),
    benchmarks: summarizeBenchmarks(sha, bench.benchmarks, ids),
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
  if (latest?.schema_version !== 2) throw new SummaryError('metrics/latest.json schema_version must be 2')
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
