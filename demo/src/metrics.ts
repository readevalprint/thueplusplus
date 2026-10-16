import { parse as parseToml } from 'smol-toml'
import rawHistory from '../../metrics/history.json'
import hostsToml from '../../hosts.toml?raw'
import environments from '../../metrics/environments.json'

export const HOST_IDS = readHostIds(hostsToml)
const REQUIRED_ENVIRONMENTS = {
  python: 'python',
  go: 'go native',
  wasm: 'wasm (node)',
  rust: 'rust',
  cpp: 'cpp',
} as const
const TASK_STATUSES = ['pass', 'fail', 'unsupported'] as const
const ENTRY_KEYS = ['commit', 'author', 'timestamp', 'guests', 'tasks', 'benchmarks']
const GUEST_KEYS = ['program', 'rule_lines', 'error']
const TASK_KEYS = ['source', 'results']
const TASK_ROW_KEYS = ['task', 'guest', 'host', 'environment', 'pass', 'status', 'applied_steps', 'probes']
const BENCHMARK_KEYS = ['program', 'max_steps', 'max_evals', 'max_state_bytes', 'timeout_seconds', 'memory_cap_bytes', 'hosts']
const BENCHMARK_HOST_KEYS = ['duration_ms', 'exit_code', 'applied_steps', 'probes', 'host_timeout_seconds', 'environment']

export class HistoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HistoryError'
  }
}

function assertEnvironmentMap(): void {
  const keys = Object.keys(REQUIRED_ENVIRONMENTS)
  const loadedKeys = Object.keys(environments)
  if (loadedKeys.length !== keys.length || keys.some(key => environments[key as keyof typeof environments] !== REQUIRED_ENVIRONMENTS[key as keyof typeof REQUIRED_ENVIRONMENTS])) {
    throw new HistoryError('metrics/environments.json does not match the host labels')
  }
  const labels = new Set(Object.values(REQUIRED_ENVIRONMENTS))
  if (labels.size !== keys.length) throw new HistoryError('environment labels must be unique')
  if (REQUIRED_ENVIRONMENTS.go.includes('wasm')) {
    throw new HistoryError('go native label must not say wasm')
  }
}

assertEnvironmentMap()

export function assertEnvironment(host: string, environment: string): void {
  const expected = REQUIRED_ENVIRONMENTS[host as keyof typeof REQUIRED_ENVIRONMENTS]
  if (expected === undefined || environment !== expected) {
    throw new HistoryError(`host ${host} is ${expected ?? 'unlabeled'}, not ${environment}`)
  }
  if (host === 'go' && environment.includes('wasm')) throw new HistoryError('go native timing labeled as wasm')
  if (host === 'wasm' && environment === REQUIRED_ENVIRONMENTS.go) throw new HistoryError('wasm timing labeled as go native')
}

export interface CommitRef {
  commit: string
  author: string
  timestamp: string
}

export interface GuestRulePoint {
  commit: string
  value: number
}

export interface NamedSeries {
  id: string
  label: string
  points: GuestRulePoint[]
}

export interface RuleChart {
  commits: CommitRef[]
  series: NamedSeries[]
}

export interface TaskGuest {
  id: string
  name: string
  passCount: number
  failCount: number
  unsupportedCount: number
  taskCount: number
  stepCount: number
}

export interface TaskCommit extends CommitRef {
  guests: TaskGuest[]
}

export interface BenchmarkHost {
  id: string
  environment: string
  durationMs: number
  exitCode: number
}

export interface BenchmarkCommit extends CommitRef {
  appliedSteps: number
  probes: number
  maxSteps: number
  maxEvals: number
  maxStateBytes: number
  timeoutSeconds: number
  memoryCapBytes: number
  hosts: BenchmarkHost[]
}

interface TaskRow {
  task: string
  guest: string
  host: string
  status: 'pass' | 'fail' | 'unsupported'
  applied_steps: number | null
  probes: number | null
}

interface HistoryGuest {
  program: string
  rule_lines: number | null
}

interface HistoryEntry extends CommitRef {
  guests: Record<string, HistoryGuest>
  tasks: { results: TaskRow[] } | null
  benchmarks: {
    appliedSteps: number
    probes: number
    maxSteps: number
    maxEvals: number
    maxStateBytes: number
    timeoutSeconds: number
    memoryCapBytes: number
    hosts: BenchmarkHost[]
  } | null
}

export interface History {
  schemaVersion: 1
  entries: HistoryEntry[]
}

export interface PlacedChart {
  width: number
  height: number
  plotLeft: number
  plotTop: number
  plotRight: number
  plotBottom: number
  yMax: number
  xAt: (index: number) => number
  yAt: (value: number) => number
}

export function loadHistory(value: unknown): History {
  if (!isRecord(value) || !exactKeys(value, ['schema_version', 'entries'])) {
    throw new HistoryError('history keys must be schema_version and entries')
  }
  if (value.schema_version !== 1) throw new HistoryError('schema_version must be 1')
  if (!Array.isArray(value.entries)) throw new HistoryError('entries must be an array')
  const seen = new Set<string>()
  let previous: [string, string] | null = null
  const entries = value.entries.map((entry, index) => {
    const loaded = loadEntry(entry, index + 1)
    if (seen.has(loaded.commit)) throw new HistoryError(`duplicate commit ${loaded.commit}`)
    seen.add(loaded.commit)
    const key: [string, string] = [loaded.timestamp, loaded.commit]
    if (previous && compareKey(key, previous) < 0) throw new HistoryError(`entries out of order at ${loaded.commit}`)
    previous = key
    return loaded
  })
  return { schemaVersion: 1, entries }
}

export function guestName(id: string, names: ReadonlyMap<string, string>): string {
  const known = names.get(id)
  if (known !== undefined) {
    if (known.length === 0) throw new HistoryError(`guest ${id} name is empty`)
    return known
  }
  if (!/^[a-z][a-z0-9-]*$/.test(id)) throw new HistoryError(`guest id ${id} has no name`)
  return id.charAt(0).toUpperCase() + id.slice(1)
}

export function commitUrl(commit: string): string {
  return `https://gitlab.com/thuelang/thueplusplus/-/commit/${commit}`
}

export function guestRuleChart(history: History, order: readonly string[], names: ReadonlyMap<string, string>): RuleChart {
  const ids = guestIds(history, order)
  const commits = history.entries.filter(entry => ids.some(id => typeof entry.guests[id]?.rule_lines === 'number'))
  return {
    commits: commits.map(commitRef),
    series: ids.map(id => ({
      id,
      label: guestName(id, names),
      points: commits.flatMap(entry => {
        const ruleLines = entry.guests[id]?.rule_lines
        if (typeof ruleLines !== 'number') return []
        return [{ commit: entry.commit, value: ruleLines }]
      }),
    })).filter(series => series.points.length > 0),
  }
}

export function taskCommits(history: History, order: readonly string[], names: ReadonlyMap<string, string>): TaskCommit[] {
  const ids = guestIds(history, order)
  return history.entries.flatMap(entry => {
    if (!entry.tasks) return []
    const guests = ids.flatMap(id => {
      const rows = entry.tasks!.results.filter(row => row.guest === id)
      if (rows.length === 0) return []
      return [summarizeGuest(id, guestName(id, names), rows)]
    })
    return [{ ...commitRef(entry), guests }]
  })
}

export function hostDurationSeries(commits: readonly BenchmarkCommit[]): NamedSeries[] {
  const present = new Set(commits.flatMap(commit => commit.hosts.map(host => host.id)))
  return HOST_IDS.filter(id => present.has(id)).map(id => {
    const sample = commits.flatMap(commit => commit.hosts).find(host => host.id === id)
    if (!sample) throw new HistoryError(`host ${id} has no duration`)
    assertEnvironment(id, sample.environment)
    return {
      id,
      label: sample.environment,
      points: commits.flatMap(commit => {
        const row = commit.hosts.find(host => host.id === id)
        if (!row) return []
        return [{ commit: commit.commit, value: row.durationMs }]
      }),
    }
  })
}

export function benchmarkCommits(history: History): BenchmarkCommit[] {
  return history.entries.flatMap(entry => {
    if (!entry.benchmarks) return []
    return [{ ...commitRef(entry), ...entry.benchmarks }]
  })
}

export function seriesFromField(commits: readonly TaskCommit[], field: 'passCount' | 'stepCount'): NamedSeries[] {
  const ids: { id: string; label: string }[] = []
  for (const commit of commits) {
    for (const guest of commit.guests) {
      if (!ids.some(item => item.id === guest.id)) ids.push({ id: guest.id, label: guest.name })
    }
  }
  return ids.map(guest => ({
    id: guest.id,
    label: guest.label,
    points: commits.flatMap(commit => {
      const row = commit.guests.find(item => item.id === guest.id)
      if (!row) return []
      return [{ commit: commit.commit, value: row[field] }]
    }),
  }))
}

export function placeChart(count: number, maxValue: number, width = 640, height = 220): PlacedChart {
  if (!Number.isInteger(count) || count < 1) throw new HistoryError(`chart count ${count}`)
  if (!Number.isFinite(maxValue) || maxValue < 0) throw new HistoryError(`chart max ${maxValue}`)
  const plotLeft = 72
  const plotRight = width - 12
  const plotTop = 14
  const plotBottom = height - 24
  const yMax = maxValue === 0 ? 1 : maxValue * 1.08
  return {
    width,
    height,
    plotLeft,
    plotTop,
    plotRight,
    plotBottom,
    yMax,
    xAt(index: number) {
      if (!Number.isInteger(index) || index < 0 || index >= count) throw new HistoryError(`chart index ${index}`)
      if (count === 1) return (plotLeft + plotRight) / 2
      return plotLeft + ((plotRight - plotLeft) * index) / (count - 1)
    },
    yAt(value: number) {
      if (!Number.isFinite(value) || value < 0 || value > yMax) throw new HistoryError(`chart value ${value}`)
      return plotBottom - ((plotBottom - plotTop) * value) / yMax
    },
  }
}

export const history = loadHistory(rawHistory)

function summarizeGuest(id: string, name: string, rows: TaskRow[]): TaskGuest {
  const tasks = new Map<string, TaskRow[]>()
  for (const row of rows) {
    const group = tasks.get(row.task) ?? []
    group.push(row)
    tasks.set(row.task, group)
  }
  let passCount = 0
  let failCount = 0
  let unsupportedCount = 0
  let stepCount = 0
  for (const [task, group] of tasks) {
    const outcome = taskOutcome(task, id, group)
    if (outcome.status === 'pass') {
      passCount += 1
      stepCount += outcome.steps
    } else if (outcome.status === 'fail') {
      failCount += 1
    } else {
      unsupportedCount += 1
    }
  }
  return { id, name, passCount, failCount, unsupportedCount, taskCount: tasks.size, stepCount }
}

function taskOutcome(task: string, guest: string, rows: TaskRow[]): { status: 'pass'; steps: number } | { status: 'fail' | 'unsupported' } {
  if (rows.some(row => row.status === 'fail')) return { status: 'fail' }
  if (rows.every(row => row.status === 'pass')) {
    const steps = new Set(rows.map(row => row.applied_steps))
    const probes = new Set(rows.map(row => row.probes))
    if (steps.size !== 1 || probes.size !== 1 || typeof rows[0].applied_steps !== 'number') {
      throw new HistoryError(`${task}/${guest}: hosts disagree on pass counts`)
    }
    return { status: 'pass', steps: rows[0].applied_steps }
  }
  if (rows.every(row => row.status === 'unsupported')) return { status: 'unsupported' }
  throw new HistoryError(`${task}/${guest}: hosts disagree on status`)
}

function guestIds(history: History, order: readonly string[]): string[] {
  const present = new Set<string>()
  for (const entry of history.entries) {
    for (const id of Object.keys(entry.guests)) present.add(id)
  }
  const ids = order.filter(id => present.has(id))
  for (const entry of history.entries) {
    for (const id of Object.keys(entry.guests)) {
      if (!ids.includes(id)) ids.push(id)
    }
  }
  return ids
}

function commitRef(entry: CommitRef): CommitRef {
  return { commit: entry.commit, author: entry.author, timestamp: entry.timestamp }
}

function loadEntry(value: unknown, index: number): HistoryEntry {
  if (!isRecord(value) || !exactKeys(value, ENTRY_KEYS)) {
    throw new HistoryError(`entry #${index} keys must be ${ENTRY_KEYS.join(', ')}`)
  }
  const commit = value.commit
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) {
    throw new HistoryError(`entry #${index} commit must be 40 lowercase hex characters`)
  }
  const author = value.author
  if (typeof author !== 'string' || !author.endsWith('>') || !author.includes('<') || author.split('<', 1)[0].trim().length === 0) {
    throw new HistoryError(`${commit}: author must be 'Name <email>'`)
  }
  const timestamp = value.timestamp
  if (typeof timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp)) {
    throw new HistoryError(`${commit}: timestamp must be YYYY-MM-DDTHH:MM:SSZ`)
  }
  return {
    commit,
    author,
    timestamp,
    guests: loadGuests(commit, value.guests),
    tasks: loadTasks(commit, value.tasks),
    benchmarks: loadBenchmarks(commit, value.benchmarks),
  }
}

function loadGuests(commit: string, value: unknown): Record<string, HistoryGuest> {
  if (!isRecord(value)) throw new HistoryError(`${commit}: guests must be an object`)
  const guests: Record<string, HistoryGuest> = {}
  for (const [guestId, guest] of Object.entries(value)) {
    if (guestId.length === 0) throw new HistoryError(`${commit}: guest id must be a non-empty string`)
    if (!isRecord(guest) || !subsetKeys(guest, GUEST_KEYS, ['program', 'rule_lines'])) {
      throw new HistoryError(`${commit} ${guestId}: guest keys must be program, rule_lines, and optional error`)
    }
    if (typeof guest.program !== 'string' || !guest.program.endsWith('.tpp')) {
      throw new HistoryError(`${commit} ${guestId}: program must be a .tpp path`)
    }
    const ruleLines = guest.rule_lines
    const error = guest.error
    if (ruleLines === null) {
      if (typeof error !== 'string' || error.length === 0) {
        throw new HistoryError(`${commit} ${guestId}: null rule_lines requires error`)
      }
      guests[guestId] = { program: guest.program, rule_lines: null }
      continue
    }
    guests[guestId] = { program: guest.program, rule_lines: nonNegativeInt(ruleLines, `${commit} ${guestId} rule_lines`) }
    if (error !== undefined) throw new HistoryError(`${commit} ${guestId}: error is only set when rule_lines is null`)
  }
  return guests
}

function loadTasks(commit: string, value: unknown): HistoryEntry['tasks'] {
  if (value === null) return null
  if (!isRecord(value) || !exactKeys(value, TASK_KEYS)) throw new HistoryError(`${commit}: tasks keys must be source and results`)
  if (value.source !== 'make tasks') throw new HistoryError(`${commit}: tasks source must be 'make tasks'`)
  if (!Array.isArray(value.results) || value.results.length === 0) {
    throw new HistoryError(`${commit}: tasks results must be a non-empty array`)
  }
  const seen = new Set<string>()
  const results = value.results.map(row => loadTaskRow(commit, row, seen))
  return { results }
}

function loadTaskRow(commit: string, value: unknown, seen: Set<string>): TaskRow {
  if (!isRecord(value) || !exactKeys(value, TASK_ROW_KEYS)) {
    throw new HistoryError(`${commit}: task row keys must be ${TASK_ROW_KEYS.join(', ')}`)
  }
  const task = requireText(value.task, `${commit}: task`)
  const guest = requireText(value.guest, `${commit}: guest`)
  const host = requireText(value.host, `${commit}: host`)
  if (!HOST_IDS.includes(host)) throw new HistoryError(`${commit}: unknown host ${host}`)
  assertEnvironment(host, requireText(value.environment, `${commit}: environment`))
  if (!TASK_STATUSES.includes(value.status as typeof TASK_STATUSES[number])) {
    throw new HistoryError(`${commit}: status ${String(value.status)}`)
  }
  const status = value.status as TaskRow['status']
  const applied = optionalCount(value.applied_steps, `${commit} ${task}/${guest}/${host} applied_steps`)
  const probes = optionalCount(value.probes, `${commit} ${task}/${guest}/${host} probes`)
  if (value.pass !== (status === 'pass')) throw new HistoryError(`${commit}: pass does not match status for ${task}/${guest}/${host}`)
  if (status === 'pass' && (applied === null || probes === null)) {
    throw new HistoryError(`${commit} ${task}/${guest}/${host} pass requires applied_steps and probes`)
  }
  if (status === 'unsupported' && (applied !== null || probes !== null)) {
    throw new HistoryError(`${commit} ${task}/${guest}/${host} unsupported clears applied_steps and probes`)
  }
  const identity = `${task}/${guest}/${host}`
  if (seen.has(identity)) throw new HistoryError(`${commit}: duplicate task row ${identity}`)
  seen.add(identity)
  return { task, guest, host, status, applied_steps: applied, probes }
}

function loadBenchmarks(commit: string, value: unknown): HistoryEntry['benchmarks'] {
  if (value === null) return null
  if (!isRecord(value) || !exactKeys(value, BENCHMARK_KEYS)) {
    throw new HistoryError(`${commit}: benchmark keys must be ${BENCHMARK_KEYS.join(', ')}`)
  }
  if (typeof value.program !== 'string' || value.program.length === 0) {
    throw new HistoryError(`${commit}: benchmark program must be a non-empty string`)
  }
  const hosts = value.hosts
  if (!isRecord(hosts) || Object.keys(hosts).length === 0) {
    throw new HistoryError(`${commit}: benchmark hosts must be a non-empty subset of ${HOST_IDS.join(', ')}`)
  }
  const unknown = Object.keys(hosts).filter(id => !HOST_IDS.includes(id))
  if (unknown.length > 0) throw new HistoryError(`${commit}: unknown benchmark host(s) ${unknown.join(', ')}`)
  const loaded = HOST_IDS.filter(id => id in hosts).map(id => {
    const row = hosts[id]
    if (!isRecord(row) || !exactKeys(row, BENCHMARK_HOST_KEYS)) {
      throw new HistoryError(`${commit} ${id}: benchmark host keys must be ${BENCHMARK_HOST_KEYS.join(', ')}`)
    }
    const timeout = row.host_timeout_seconds
    if (typeof timeout !== 'number' || !Number.isFinite(timeout) || timeout <= 0) {
      throw new HistoryError(`${commit} ${id}: host_timeout_seconds must be a positive number`)
    }
    const environment = requireText(row.environment, `${commit} ${id} environment`)
    assertEnvironment(id, environment)
    return {
      id,
      environment,
      durationMs: nonNegativeInt(row.duration_ms, `${commit} ${id} duration_ms`),
      exitCode: anyInt(row.exit_code, `${commit} ${id} exit_code`),
      appliedSteps: nonNegativeInt(row.applied_steps, `${commit} ${id} applied_steps`),
      probes: nonNegativeInt(row.probes, `${commit} ${id} probes`),
    }
  })
  const steps = new Set(loaded.map(host => host.appliedSteps))
  const probes = new Set(loaded.map(host => host.probes))
  if (steps.size !== 1 || probes.size !== 1) {
    throw new HistoryError(`${commit}: benchmark hosts disagree on applied_steps or probes`)
  }
  return {
    appliedSteps: loaded[0].appliedSteps,
    probes: loaded[0].probes,
    maxSteps: positiveInt(value.max_steps, `${commit} benchmarks.max_steps`),
    maxEvals: positiveInt(value.max_evals, `${commit} benchmarks.max_evals`),
    maxStateBytes: positiveInt(value.max_state_bytes, `${commit} benchmarks.max_state_bytes`),
    timeoutSeconds: positiveInt(value.timeout_seconds, `${commit} benchmarks.timeout_seconds`),
    memoryCapBytes: positiveInt(value.memory_cap_bytes, `${commit} benchmarks.memory_cap_bytes`),
    hosts: loaded.map(host => ({ id: host.id, environment: host.environment, durationMs: host.durationMs, exitCode: host.exitCode })),
  }
}

function readHostIds(text: string): string[] {
  const parsed = parseToml(text) as { host?: { id?: unknown }[] }
  if (!Array.isArray(parsed.host) || parsed.host.length === 0) {
    throw new HistoryError('hosts.toml host must be a non-empty array')
  }
  const ids = parsed.host.map((row, index) => {
    if (typeof row?.id !== 'string' || row.id.length === 0) {
      throw new HistoryError(`hosts.toml host #${index + 1} id is empty`)
    }
    return row.id
  })
  if (new Set(ids).size !== ids.length) throw new HistoryError('hosts.toml has a duplicate id')
  return ids
}

function compareKey(left: [string, string], right: [string, string]): number {
  if (left[0] < right[0]) return -1
  if (left[0] > right[0]) return 1
  if (left[1] < right[1]) return -1
  if (left[1] > right[1]) return 1
  return 0
}

function optionalCount(value: unknown, label: string): number | null {
  if (value === null) return null
  return nonNegativeInt(value, label)
}

function nonNegativeInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new HistoryError(`${label} must be a non-negative integer`)
  }
  return value
}

function positiveInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new HistoryError(`${label} must be a positive integer`)
  }
  return value
}

function anyInt(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) throw new HistoryError(`${label} must be an integer`)
  return value
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new HistoryError(`${label} must be a non-empty string`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(value)
  return present.length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
}

function subsetKeys(value: Record<string, unknown>, allowed: readonly string[], required: readonly string[]): boolean {
  return Object.keys(value).every(key => allowed.includes(key)) && required.every(key => Object.prototype.hasOwnProperty.call(value, key))
}
