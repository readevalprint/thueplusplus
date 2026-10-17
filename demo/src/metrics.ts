import rawSummary from './generated/summary.json'
import environments from '../../metrics/environments.json'

const ENTRY_KEYS = ['commit', 'author', 'timestamp', 'machine', 'hosts']
const HOST_KEYS = ['id', 'environment', 'duration_ms', 'memory_bytes', 'runs']
const MACHINE_KEYS = ['os', 'release', 'arch', 'cpu', 'cpus']
const REQUIRED_ENVIRONMENTS: Record<string, string> = {
  python: 'python',
  go: 'go native',
  wasm: 'wasm (node)',
  rust: 'rust',
  cpp: 'cpp',
}

export class HistoryError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'HistoryError'
  }
}

if (JSON.stringify(environments) !== JSON.stringify(REQUIRED_ENVIRONMENTS)) {
  throw new HistoryError('metrics/environments.json does not match the host labels')
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

export interface HostRow {
  id: string
  environment: string
  durationMs: number
  memoryBytes: number
  runs: number
}

export interface HistoryEntry extends CommitRef {
  machine: Machine
  hosts: HostRow[]
}

export interface History {
  schemaVersion: 2
  entries: HistoryEntry[]
}

export type HostMeasure = 'durationMs' | 'memoryBytes'

export function commitUrl(commit: string): string {
  return `https://gitlab.com/thuelang/thueplusplus/-/commit/${commit}`
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
  const index = new Map(order.map(commit => [commit.commit, commit]))
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

export function hostRatio(entry: HistoryEntry, hostId: string, measure: HostMeasure): number | null {
  const host = entry.hosts.find(item => item.id === hostId)
  const baseline = entry.hosts.find(item => item.id === 'go')
  if (!host || !baseline) return null
  const value = host[measure]
  const base = baseline[measure]
  if (measure === 'durationMs') {
    if (value <= 0 || base <= 0) throw new HistoryError(`${entry.commit} ${hostId} duration ratio ${value}/${base}`)
    return value / base
  }
  if (value <= 0 || base <= 0) return null
  return value / base
}

export function formatTimesGo(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) throw new HistoryError(`ratio ${ratio}`)
  const rounded = Math.round(ratio * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${text}× go`
}

export function hostLine(entry: HistoryEntry, hostId: string, measure: HostMeasure): string {
  const host = entry.hosts.find(item => item.id === hostId)
  const ratio = hostRatio(entry, hostId, measure)
  if (!host || ratio === null) return `${host?.environment ?? hostId} · no ratio`
  return `${host.environment} · ${formatTimesGo(ratio)}`
}

export function hostChart(history: History, measure: HostMeasure): { commits: CommitRef[]; order: string[]; series: NamedSeries[] } {
  const ids = [...new Set(history.entries.flatMap(entry => entry.hosts.map(host => host.id)))]
  const series = ids.map(id => ({
    id,
    label: history.entries.flatMap(entry => entry.hosts).find(host => host.id === id)?.environment ?? id,
    points: collapseRuns(history.entries.map(entry => ({
      commit: entry.commit,
      value: hostRatio(entry, id, measure),
    }))),
  })).filter(item => item.points.length > 0)
  return {
    commits: history.entries,
    order: history.entries.map(entry => entry.commit),
    series,
  }
}

export function loadHistory(value: unknown): History {
  if (!isRecord(value) || Object.keys(value).sort().join() !== 'entries,schema_version') {
    throw new HistoryError('summary keys must be schema_version and entries')
  }
  if (value.schema_version !== 2) throw new HistoryError('schema_version must be 2')
  if (!Array.isArray(value.entries)) throw new HistoryError('entries must be an array')
  const entries = value.entries.map((entry, index) => loadEntry(entry, index))
  return { schemaVersion: 2, entries }
}

export const history = loadHistory(rawSummary)

function loadEntry(value: unknown, index: number): HistoryEntry {
  if (!isRecord(value) || Object.keys(value).sort().join() !== ENTRY_KEYS.slice().sort().join()) {
    throw new HistoryError(`entry #${index} keys must be ${ENTRY_KEYS.join(', ')}`)
  }
  const commit = value.commit
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/.test(commit)) {
    throw new HistoryError(`entry #${index} commit must be 40 lowercase hex characters`)
  }
  if (typeof value.author !== 'string' || !/^.+ <.+>$/.test(value.author)) {
    throw new HistoryError(`${commit}: author must be 'Name <email>'`)
  }
  if (typeof value.timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(value.timestamp)) {
    throw new HistoryError(`${commit}: timestamp must be YYYY-MM-DDTHH:MM:SSZ`)
  }
  if (!Array.isArray(value.hosts) || value.hosts.length === 0) throw new HistoryError(`${commit}: hosts must be a non-empty array`)
  return {
    commit,
    author: value.author,
    timestamp: value.timestamp,
    machine: loadMachine(commit, value.machine),
    hosts: value.hosts.map(host => loadHost(commit, host)),
  }
}

function loadMachine(commit: string, value: unknown): Machine {
  if (!isRecord(value) || Object.keys(value).sort().join() !== MACHINE_KEYS.slice().sort().join()) {
    throw new HistoryError(`${commit}: machine keys must be ${MACHINE_KEYS.join(', ')}`)
  }
  for (const key of ['os', 'release', 'arch', 'cpu'] as const) {
    if (typeof value[key] !== 'string' || value[key].trim() === '') throw new HistoryError(`${commit}: machine.${key}`)
  }
  if (typeof value.cpus !== 'number' || !Number.isInteger(value.cpus) || value.cpus < 1) {
    throw new HistoryError(`${commit}: machine.cpus`)
  }
  return {
    os: value.os as string,
    release: value.release as string,
    arch: value.arch as string,
    cpu: value.cpu as string,
    cpus: value.cpus,
  }
}

function loadHost(commit: string, value: unknown): HostRow {
  if (!isRecord(value) || Object.keys(value).sort().join() !== HOST_KEYS.slice().sort().join()) {
    throw new HistoryError(`${commit}: host keys must be ${HOST_KEYS.join(', ')}`)
  }
  const id = value.id
  if (typeof id !== 'string' || id.length === 0) throw new HistoryError(`${commit}: host id`)
  const expected = REQUIRED_ENVIRONMENTS[id]
  if (value.environment !== expected) throw new HistoryError(`${commit}: host ${id} is ${expected ?? 'unlabeled'}, not ${value.environment}`)
  return {
    id,
    environment: value.environment,
    durationMs: nonNegative(value.duration_ms, `${commit} ${id} duration_ms`),
    memoryBytes: nonNegative(value.memory_bytes, `${commit} ${id} memory_bytes`),
    runs: nonNegative(value.runs, `${commit} ${id} runs`),
  }
}

function nonNegative(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) throw new HistoryError(`${label} must be a non-negative integer`)
  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
