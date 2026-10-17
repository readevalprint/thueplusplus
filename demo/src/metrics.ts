import { parse as parseToml } from 'smol-toml'
import rawSummary from './generated/summary.json'
import hostsToml from '../../hosts.toml?raw'
import environments from '../../metrics/environments.json'
import { repositoryUrl } from './hosts'

export const HOST_IDS = readHostIds(hostsToml)
const REQUIRED_ENVIRONMENTS = {
  python: 'python',
  go: 'go native',
  wasm: 'wasm (node)',
  rust: 'rust',
  cpp: 'cpp',
} as const
const WORKLOAD_LABELS: Record<string, string> = {
  'probe-cost': 'Probe cost',
  'state-rewrite': 'State rewrite',
  regex: 'Regex',
  io: 'I/O',
  guest: 'Forth',
  rewrite: 'Rewrite',
}
const ENTRY_KEYS = ['commit', 'author', 'timestamp', 'machine', 'guests', 'tasks', 'problems', 'langs', 'benchmarks']
const PROBLEM_KEYS = ['problem', 'solution', 'status', 'regex_evals', 'regex_matches', 'state_bytes', 'rule_count', 'rule_chars']
const LANG_KEYS = ['lang', 'program', 'status', 'regex_evals', 'regex_matches', 'state_bytes', 'rule_count', 'rule_chars']
const COUNTER_KEYS = ['regex_evals', 'regex_matches', 'state_bytes', 'rule_count', 'rule_chars'] as const
const MACHINE_KEYS = ['os', 'release', 'arch', 'cpu', 'cpus']
const TASK_GUEST_KEYS = ['pass', 'fail', 'unsupported', 'steps']
const WORKLOAD_KEYS = ['id', 'steps', 'probes', 'max_steps', 'max_evals', 'max_state_bytes', 'timeout_seconds', 'memory_cap_bytes', 'hosts']
const HOST_KEYS = ['id', 'environment', 'duration_ms', 'memory_bytes', 'exit_code']

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

export interface Machine {
  os: string
  release: string
  arch: string
  cpu: string
  cpus: number
}

export interface SeriesPoint {
  commit: string
  until: string
  value: number
}

export interface NamedSeries {
  id: string
  label: string
  points: SeriesPoint[]
}

export interface RuleChart {
  order: string[]
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
  memoryBytes: number | null
  exitCode: number
}

export interface WorkloadCommit extends CommitRef {
  machine: Machine | null
  id: string
  appliedSteps: number
  probes: number
  maxSteps: number
  maxEvals: number
  maxStateBytes: number
  timeoutSeconds: number
  memoryCapBytes: number
  hosts: BenchmarkHost[]
}

interface TaskGuestRow {
  pass: number
  fail: number
  unsupported: number
  steps: number
}

interface WorkloadRow {
  id: string
  appliedSteps: number
  probes: number
  maxSteps: number
  maxEvals: number
  maxStateBytes: number
  timeoutSeconds: number
  memoryCapBytes: number
  hosts: BenchmarkHost[]
}

export interface PassCounters {
  status: 'pass'
  regexEvals: number
  regexMatches: number
  stateBytes: number
  ruleCount: number
  ruleChars: number
}

export interface FailCounters {
  status: 'fail'
  regexEvals: null
  regexMatches: null
  stateBytes: null
  ruleCount: null
  ruleChars: null
}

export type CounterRow = PassCounters | FailCounters

export type ProblemRow = CounterRow & {
  problem: string
  solution: string
}

export type LangRow = CounterRow & {
  lang: string
  program: string
}

interface HistoryEntry extends CommitRef {
  machine: Machine | null
  guests: Record<string, number>
  tasks: Record<string, TaskGuestRow> | null
  problems: ProblemRow[] | null
  langs: LangRow[] | null
  benchmarks: WorkloadRow[] | null
}

export interface History {
  schemaVersion: 1
  entries: HistoryEntry[]
}

export function loadHistory(value: unknown): History {
  if (!isRecord(value) || !exactKeys(value, ['schema_version', 'entries'])) {
    throw new HistoryError('summary keys must be schema_version and entries')
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

export function workloadLabel(id: string): string {
  const label = WORKLOAD_LABELS[id]
  if (label === undefined) throw new HistoryError(`workload ${id} has no label`)
  return label
}

export function commitUrl(commit: string): string {
  return `${repositoryUrl}/commit/${commit}`
}

export function collapseRuns(samples: readonly { commit: string; value: number | null }[]): SeriesPoint[] {
  const points: SeriesPoint[] = []
  let open: SeriesPoint | null = null
  for (const sample of samples) {
    if (sample.value === null) {
      if (open) points.push(open)
      open = null
      continue
    }
    if (open && open.value === sample.value) {
      open = { commit: open.commit, until: sample.commit, value: open.value }
      continue
    }
    if (open) points.push(open)
    open = { commit: sample.commit, until: sample.commit, value: sample.value }
  }
  if (open) points.push(open)
  return points
}

export function changeAxis(order: readonly CommitRef[], series: readonly NamedSeries[]): CommitRef[] {
  const index = new Map(order.map((commit, position) => [commit.commit, position]))
  const changes = new Set<string>()
  for (const item of series) {
    for (const point of item.points) {
      if (!index.has(point.commit)) throw new HistoryError(`change ${point.commit} is not on the chart`)
      changes.add(point.commit)
    }
  }
  return order.filter(commit => changes.has(commit.commit))
}

export function pointAt(points: readonly SeriesPoint[], commit: string, order: readonly string[]): SeriesPoint | undefined {
  const index = order.indexOf(commit)
  if (index < 0) throw new HistoryError(`commit ${commit} is not on the chart`)
  return points.find(point => {
    const start = order.indexOf(point.commit)
    const end = order.indexOf(point.until)
    if (start < 0 || end < 0 || end < start) throw new HistoryError(`range ${point.commit} is not on the chart`)
    return start <= index && index <= end
  })
}

export function commitSpan(point: SeriesPoint): string {
  const start = point.commit.slice(0, 12)
  const end = point.until.slice(0, 12)
  return start === end ? start : `${start}…${end}`
}

export function rangeLabel(point: SeriesPoint): string {
  return `${commitSpan(point)} · ${point.value}`
}

export function guestRuleChart(history: History, order: readonly string[], names: ReadonlyMap<string, string>): RuleChart {
  const ids = guestIds(history, order)
  const domain = history.entries.filter(entry => ids.some(id => typeof entry.guests[id] === 'number'))
  const series = ids.map(id => ({
    id,
    label: guestName(id, names),
    points: collapseRuns(domain.map(entry => ({
      commit: entry.commit,
      value: typeof entry.guests[id] === 'number' ? entry.guests[id] : null,
    }))),
  })).filter(item => item.points.length > 0)
  const commits = domain.map(commitRef)
  return { order: domain.map(entry => entry.commit), commits: changeAxis(commits, series), series }
}

export function taskCommits(history: History, order: readonly string[], names: ReadonlyMap<string, string>): TaskCommit[] {
  const ids = guestIds(history, order)
  return history.entries.flatMap(entry => {
    if (!entry.tasks) return []
    const guests = ids.flatMap(id => {
      const row = entry.tasks?.[id]
      if (!row) return []
      return [{
        id,
        name: guestName(id, names),
        passCount: row.pass,
        failCount: row.fail,
        unsupportedCount: row.unsupported,
        taskCount: row.pass + row.fail + row.unsupported,
        stepCount: row.steps,
      }]
    })
    return [{ ...commitRef(entry), guests }]
  })
}

export type HostMeasure = 'durationMs' | 'memoryBytes'

export function hostRatio(commit: WorkloadCommit, hostId: string, measure: HostMeasure): number | null {
  const host = commit.hosts.find(item => item.id === hostId)
  const baseline = commit.hosts.find(item => item.id === 'go')
  if (!host || !baseline) return null
  const value = host[measure]
  const base = baseline[measure]
  if (measure === 'durationMs') {
    if (value === null || base === null || value <= 0 || base <= 0) {
      throw new HistoryError(`${commit.commit} ${hostId} duration ratio ${value}/${base}`)
    }
    return value / base
  }
  if (value === null || base === null || value <= 0 || base <= 0) return null
  return value / base
}

export function formatTimesGo(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) throw new HistoryError(`ratio ${ratio}`)
  const rounded = Math.round(ratio * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${text}× go`
}

export function hostMeasurementText(commit: WorkloadCommit, hostId: string, measure: HostMeasure): string {
  const host = commit.hosts.find(item => item.id === hostId)
  const ratio = hostRatio(commit, hostId, measure)
  if (!host || ratio === null) throw new HistoryError(`${commit.commit} ${hostId} has no ${measure} ratio`)
  const memory = host.memoryBytes === null ? '' : ` · ${host.memoryBytes} bytes`
  return `${formatTimesGo(ratio)} · ${host.durationMs} ms${memory}`
}

export function machineLabel(machine: Machine | null): string {
  if (machine === null) return ''
  return `${machine.os} ${machine.release} · ${machine.arch} · ${machine.cpu} · ${machine.cpus} cores`
}

export function hostRatioSeries(commits: readonly WorkloadCommit[], measure: HostMeasure): NamedSeries[] {
  const present = new Set(commits.flatMap(commit => commit.hosts.map(host => host.id)))
  return HOST_IDS.filter(id => present.has(id)).map(id => {
    const sample = commits.flatMap(commit => commit.hosts).find(host => host.id === id)
    if (!sample) throw new HistoryError(`host ${id} has no measurement`)
    assertEnvironment(id, sample.environment)
    return {
      id,
      label: sample.environment,
      points: collapseRuns(commits.map(commit => ({
        commit: commit.commit,
        value: hostRatio(commit, id, measure),
      }))),
    }
  }).filter(item => item.points.length > 0)
}

export function countSeries(commits: readonly WorkloadCommit[]): NamedSeries[] {
  return [
    {
      id: 'steps',
      label: 'Steps',
      points: collapseRuns(commits.map(commit => ({ commit: commit.commit, value: commit.appliedSteps }))),
    },
    {
      id: 'probes',
      label: 'Probes',
      points: collapseRuns(commits.map(commit => ({ commit: commit.commit, value: commit.probes }))),
    },
  ]
}

export function workloadIds(history: History): string[] {
  const ids: string[] = []
  for (const entry of history.entries) {
    for (const workload of entry.benchmarks ?? []) {
      if (!ids.includes(workload.id)) ids.push(workload.id)
    }
  }
  return ids
}

export function benchmarkCommits(history: History, workloadId: string): WorkloadCommit[] {
  if (!/^[a-z][a-z0-9-]*$/.test(workloadId)) throw new HistoryError(`workload ${workloadId}`)
  const commits = history.entries.flatMap(entry => {
    const workload = entry.benchmarks?.find(item => item.id === workloadId)
    if (!workload) return []
    return [{ ...commitRef(entry), machine: entry.machine, ...workload }]
  })
  if (commits.length === 0) throw new HistoryError(`workload ${workloadId} has no commits`)
  return commits
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
    points: collapseRuns(commits.map(commit => {
      const row = commit.guests.find(item => item.id === guest.id)
      return { commit: commit.commit, value: row ? row[field] : null }
    })),
  })).filter(item => item.points.length > 0)
}

export const history = loadHistory(rawSummary)

function guestIds(history: History, order: readonly string[]): string[] {
  const present = new Set<string>()
  for (const entry of history.entries) {
    for (const id of Object.keys(entry.guests)) present.add(id)
    for (const id of Object.keys(entry.tasks ?? {})) present.add(id)
  }
  const ids = order.filter(id => present.has(id))
  for (const id of present) {
    if (!ids.includes(id)) ids.push(id)
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
  const problems = loadProblems(commit, value.problems)
  const langs = loadLangs(commit, value.langs)
  if ((problems === null) !== (langs === null)) {
    throw new HistoryError(`${commit}: problems and langs are recorded together`)
  }
  return {
    commit,
    author,
    timestamp,
    machine: loadMachine(commit, value.machine),
    guests: loadGuests(commit, value.guests),
    tasks: loadTasks(commit, value.tasks),
    problems,
    langs,
    benchmarks: loadBenchmarks(commit, value.benchmarks),
  }
}

function loadProblems(commit: string, value: unknown): ProblemRow[] | null {
  if (value === null) return null
  if (!Array.isArray(value) || value.length === 0) {
    throw new HistoryError(`${commit}: problems must be a non-empty array or null`)
  }
  const seen = new Set<string>()
  return value.map(row => {
    const loaded = loadCounterRow(commit, 'problem', row, PROBLEM_KEYS, (record) => {
      const problem = requireSlug(record.problem, `${commit} problem`)
      const solution = requireSlug(record.solution, `${commit} ${problem} solution`)
      return { identity: `${problem}/${solution}`, names: { problem, solution } }
    })
    if (seen.has(`${loaded.problem}/${loaded.solution}`)) {
      throw new HistoryError(`${commit}: duplicate problem ${loaded.problem}/${loaded.solution}`)
    }
    seen.add(`${loaded.problem}/${loaded.solution}`)
    return loaded
  })
}

function loadLangs(commit: string, value: unknown): LangRow[] | null {
  if (value === null) return null
  if (!Array.isArray(value) || value.length === 0) {
    throw new HistoryError(`${commit}: langs must be a non-empty array or null`)
  }
  const seen = new Set<string>()
  return value.map(row => {
    const loaded = loadCounterRow(commit, 'lang', row, LANG_KEYS, (record) => {
      const lang = requireLang(record.lang, `${commit} lang`)
      const program = requireProgram(record.program, `${commit} ${lang} program`)
      return { identity: lang, names: { lang, program } }
    })
    if (seen.has(loaded.lang)) throw new HistoryError(`${commit}: duplicate lang ${loaded.lang}`)
    seen.add(loaded.lang)
    return loaded
  })
}

function loadCounterRow<Names extends Record<string, string>>(
  commit: string,
  field: string,
  value: unknown,
  keys: readonly string[],
  namesOf: (record: Record<string, unknown>) => { identity: string, names: Names },
): Names & CounterRow {
  if (!isRecord(value) || !exactKeys(value, keys)) {
    throw new HistoryError(`${commit}: ${field} keys must be ${keys.join(', ')}`)
  }
  const { identity, names } = namesOf(value)
  const status = value.status
  if (status !== 'pass' && status !== 'fail') throw new HistoryError(`${commit} ${identity}: status ${String(status)}`)
  if (status === 'fail') {
    for (const key of COUNTER_KEYS) {
      if (value[key] !== null) throw new HistoryError(`${commit} ${identity}: fail clears ${key}`)
    }
    return { ...names, status, regexEvals: null, regexMatches: null, stateBytes: null, ruleCount: null, ruleChars: null }
  }
  const regexEvals = nonNegativeInt(value.regex_evals, `${commit} ${identity} regex_evals`)
  const regexMatches = nonNegativeInt(value.regex_matches, `${commit} ${identity} regex_matches`)
  const stateBytes = nonNegativeInt(value.state_bytes, `${commit} ${identity} state_bytes`)
  const ruleCount = nonNegativeInt(value.rule_count, `${commit} ${identity} rule_count`)
  const ruleChars = nonNegativeInt(value.rule_chars, `${commit} ${identity} rule_chars`)
  if (ruleCount < 1 || ruleChars < 1) {
    throw new HistoryError(`${commit} ${identity}: rule count and rule chars come from the source`)
  }
  return { ...names, status, regexEvals, regexMatches, stateBytes, ruleCount, ruleChars }
}

function loadMachine(commit: string, value: unknown): Machine | null {
  if (value === null) return null
  if (!isRecord(value) || !exactKeys(value, MACHINE_KEYS)) {
    throw new HistoryError(`${commit}: machine keys must be ${MACHINE_KEYS.join(', ')}`)
  }
  return {
    os: requireText(value.os, `${commit} machine os`),
    release: requireText(value.release, `${commit} machine release`),
    arch: requireText(value.arch, `${commit} machine arch`),
    cpu: requireText(value.cpu, `${commit} machine cpu`),
    cpus: positiveInt(value.cpus, `${commit} machine cpus`),
  }
}

function loadGuests(commit: string, value: unknown): Record<string, number> {
  if (!isRecord(value)) throw new HistoryError(`${commit}: guests must be an object`)
  const guests: Record<string, number> = {}
  for (const [guestId, ruleLines] of Object.entries(value)) {
    if (guestId.length === 0) throw new HistoryError(`${commit}: guest id must be a non-empty string`)
    guests[guestId] = nonNegativeInt(ruleLines, `${commit} ${guestId} rule_lines`)
  }
  return guests
}

function loadTasks(commit: string, value: unknown): HistoryEntry['tasks'] {
  if (value === null) return null
  if (!isRecord(value) || Object.keys(value).length === 0) {
    throw new HistoryError(`${commit}: tasks must be a non-empty object or null`)
  }
  const tasks: Record<string, TaskGuestRow> = {}
  for (const [guestId, row] of Object.entries(value)) {
    if (guestId.length === 0) throw new HistoryError(`${commit}: guest id must be a non-empty string`)
    if (!isRecord(row) || !exactKeys(row, TASK_GUEST_KEYS)) {
      throw new HistoryError(`${commit} ${guestId}: task keys must be ${TASK_GUEST_KEYS.join(', ')}`)
    }
    const pass = nonNegativeInt(row.pass, `${commit} ${guestId} pass`)
    const fail = nonNegativeInt(row.fail, `${commit} ${guestId} fail`)
    const unsupported = nonNegativeInt(row.unsupported, `${commit} ${guestId} unsupported`)
    if (pass + fail + unsupported < 1) throw new HistoryError(`${commit} ${guestId}: tasks are empty`)
    tasks[guestId] = { pass, fail, unsupported, steps: nonNegativeInt(row.steps, `${commit} ${guestId} steps`) }
  }
  return tasks
}

function loadBenchmarks(commit: string, value: unknown): HistoryEntry['benchmarks'] {
  if (value === null) return null
  if (!Array.isArray(value) || value.length === 0) {
    throw new HistoryError(`${commit}: benchmarks must be a non-empty array or null`)
  }
  const seen = new Set<string>()
  return value.map(workload => {
    const loaded = loadWorkload(commit, workload)
    if (seen.has(loaded.id)) throw new HistoryError(`${commit}: duplicate workload ${loaded.id}`)
    seen.add(loaded.id)
    return loaded
  })
}

function loadWorkload(commit: string, value: unknown): WorkloadRow {
  if (!isRecord(value) || !exactKeys(value, WORKLOAD_KEYS)) {
    throw new HistoryError(`${commit}: workload keys must be ${WORKLOAD_KEYS.join(', ')}`)
  }
  const id = value.id
  if (typeof id !== 'string' || !/^[a-z][a-z0-9-]*$/.test(id)) {
    throw new HistoryError(`${commit}: workload id must be a lowercase slug`)
  }
  if (!Array.isArray(value.hosts) || value.hosts.length === 0) {
    throw new HistoryError(`${commit} ${id}: hosts must be a non-empty array`)
  }
  const seen = new Set<string>()
  const hosts = value.hosts.map(host => loadHost(commit, id, host, seen))
  return {
    id,
    appliedSteps: nonNegativeInt(value.steps, `${commit} ${id} steps`),
    probes: nonNegativeInt(value.probes, `${commit} ${id} probes`),
    maxSteps: positiveInt(value.max_steps, `${commit} ${id} max_steps`),
    maxEvals: positiveInt(value.max_evals, `${commit} ${id} max_evals`),
    maxStateBytes: positiveInt(value.max_state_bytes, `${commit} ${id} max_state_bytes`),
    timeoutSeconds: positiveInt(value.timeout_seconds, `${commit} ${id} timeout_seconds`),
    memoryCapBytes: positiveInt(value.memory_cap_bytes, `${commit} ${id} memory_cap_bytes`),
    hosts: HOST_IDS.filter(hostId => hosts.some(host => host.id === hostId)).map(hostId => {
      const host = hosts.find(item => item.id === hostId)
      if (!host) throw new HistoryError(`${commit} ${id}: missing host ${hostId}`)
      return host
    }),
  }
}

function loadHost(commit: string, workload: string, value: unknown, seen: Set<string>): BenchmarkHost {
  if (!isRecord(value) || !exactKeys(value, HOST_KEYS)) {
    throw new HistoryError(`${commit} ${workload}: host keys must be ${HOST_KEYS.join(', ')}`)
  }
  const id = requireText(value.id, `${commit} ${workload} host`)
  if (!HOST_IDS.includes(id)) throw new HistoryError(`${commit}: unknown benchmark host ${id}`)
  if (seen.has(id)) throw new HistoryError(`${commit} ${workload}: duplicate host ${id}`)
  seen.add(id)
  const environment = requireText(value.environment, `${commit} ${workload} ${id} environment`)
  assertEnvironment(id, environment)
  const memory = value.memory_bytes
  if (memory !== null) nonNegativeInt(memory, `${commit} ${workload} ${id} memory_bytes`)
  return {
    id,
    environment,
    durationMs: nonNegativeInt(value.duration_ms, `${commit} ${workload} ${id} duration_ms`),
    memoryBytes: memory === null ? null : nonNegativeInt(memory, `${commit} ${workload} ${id} memory_bytes`),
    exitCode: anyInt(value.exit_code, `${commit} ${workload} ${id} exit_code`),
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

function requireSlug(value: unknown, label: string): string {
  const text = requireText(value, label)
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(text)) throw new HistoryError(`${label} must be a lowercase slug`)
  return text
}

function requireLang(value: unknown, label: string): string {
  const text = requireText(value, label)
  if (!/^[a-z][a-z0-9-]*$/.test(text)) throw new HistoryError(`${label} must be a lowercase slug`)
  return text
}

function requireProgram(value: unknown, label: string): string {
  const text = requireText(value, label)
  if (text.includes('\\') || text.startsWith('/') || text.includes('..') || !(text.endsWith('.thue') || text.endsWith('.tpp'))) {
    throw new HistoryError(`${label} must be a repo-relative .thue or .tpp path`)
  }
  return text
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const present = Object.keys(value)
  return present.length === keys.length && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
}
