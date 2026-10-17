import { catalog } from './catalog'
import { HistoryError, history, type History, type PassCounters, type ProblemRow } from './metrics'

export const VERSIONS = [
  { id: 'direct', label: 'direct' },
  { id: 'lisp', label: 'Lisp' },
  { id: 'forth', label: 'Forth' },
  { id: 'basic', label: 'BASIC' },
] as const

export const LANGUAGES = [
  { id: 'lisp', label: 'Lisp' },
  { id: 'forth', label: 'Forth' },
  { id: 'basic', label: 'BASIC' },
] as const

export type VersionId = (typeof VERSIONS)[number]['id']
export type LanguageId = (typeof LANGUAGES)[number]['id']

export const PARETO_AXES = [
  { id: 'regexEvals', label: 'Regex evals', short: 'Evals' },
  { id: 'regexMatches', label: 'Regex matches', short: 'Matches' },
  { id: 'stateBytes', label: 'Cumulative state size', short: 'State' },
  { id: 'ruleCount', label: 'Rule count', short: 'Rules' },
  { id: 'ruleChars', label: 'Rule chars', short: 'Chars' },
] as const

export type ParetoAxis = (typeof PARETO_AXES)[number]['id']

export interface ProblemRef {
  id: string
  title: string
  summary: string
  path: string
}

export interface TrendSample {
  commit: string
  timestamp: string
  value: number | null
  mark: boolean
}

export interface ParetoPoint {
  solution: string
  regexEvals: number
  regexMatches: number
  stateBytes: number
  ruleCount: number
  ruleChars: number
}

export interface VersionFront {
  id: VersionId
  label: string
  points: ParetoPoint[]
}

export interface CoverageMark {
  id: VersionId
  label: string
  filled: boolean
}

export interface ProblemCard {
  id: string
  title: string
  summary: string
  path: string
  gaps: number
  improvedAt: string
  marks: CoverageMark[]
  trend: TrendSample[]
  fronts: VersionFront[]
}

export interface LanguageCard {
  id: LanguageId
  label: string
  ruleCount: number | null
  ruleChars: number | null
  coverage: number
  overhead: number | null
  trend: TrendSample[]
}

export interface Overview {
  problemCount: number
  languages: LanguageCard[]
  problems: ProblemCard[]
}

const MAX_FRONT = 5

export function versionOf(solution: string): VersionId {
  if (solution === 'lisp' || solution.startsWith('lisp-')) return 'lisp'
  if (solution === 'forth' || solution.startsWith('forth-')) return 'forth'
  if (solution === 'basic' || solution.startsWith('basic-')) return 'basic'
  return 'direct'
}

export function geometricMean(ratios: readonly number[]): number {
  if (ratios.length === 0) throw new HistoryError('geometric mean of an empty set')
  let sum = 0
  for (const ratio of ratios) {
    if (!Number.isFinite(ratio) || ratio <= 0) throw new HistoryError(`ratio ${ratio}`)
    sum += Math.log(ratio)
  }
  if (ratios.length === 1) return ratios[0]
  return Math.exp(sum / ratios.length)
}

export function formatCount(value: number): string {
  if (!Number.isInteger(value) || value < 0) throw new HistoryError(`count ${value}`)
  return value.toLocaleString('en-US')
}

export function formatOverhead(ratio: number): string {
  if (!Number.isFinite(ratio) || ratio <= 0) throw new HistoryError(`overhead ${ratio}`)
  const rounded = Math.round(ratio * 10) / 10
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
  return `${text}×`
}

export function paretoScale(points: readonly ParetoPoint[]): 'log' | 'linear' {
  if (points.length === 0) throw new HistoryError('pareto chart has no points')
  for (const point of points) {
    for (const axis of PARETO_AXES) {
      const value = point[axis.id]
      if (!Number.isInteger(value) || value < 0) throw new HistoryError(`pareto ${point.solution} ${axis.id} is ${value}`)
      if (value === 0) return 'linear'
    }
  }
  return 'log'
}

export function dominates(better: ParetoPoint, worse: ParetoPoint): boolean {
  let strict = false
  for (const axis of PARETO_AXES) {
    if (better[axis.id] > worse[axis.id]) return false
    if (better[axis.id] < worse[axis.id]) strict = true
  }
  return strict
}

export function buildOverview(source: History, problems: readonly ProblemRef[]): Overview {
  const latest = source.entries[source.entries.length - 1]
  if (!latest || latest.problems === null || latest.langs === null) {
    throw new HistoryError('latest measurement has no problems')
  }
  const measured = problemIds(latest.problems)
  const catalogIds = problems.map(problem => problem.id)
  for (const id of catalogIds) {
    if (!measured.includes(id)) throw new HistoryError(`problem ${id} has no measurement`)
  }
  for (const id of measured) {
    if (!catalogIds.includes(id)) throw new HistoryError(`problem ${id} is not in the catalog`)
  }
  const langs = new Map(latest.langs.map(row => [row.lang, row]))
  for (const lang of LANGUAGES) {
    if (!langs.has(lang.id)) throw new HistoryError(`latest measurement has no ${lang.id}`)
  }
  for (const row of latest.langs) {
    if (!LANGUAGES.some(lang => lang.id === row.lang)) throw new HistoryError(`unknown language ${row.lang}`)
  }
  const cards = problems.map(problem => problemCard(source, problem, latest.problems ?? []))
  cards.sort((left, right) => {
    if (right.gaps !== left.gaps) return right.gaps - left.gaps
    if (left.improvedAt !== right.improvedAt) return right.improvedAt < left.improvedAt ? -1 : 1
    return catalogIds.indexOf(left.id) - catalogIds.indexOf(right.id)
  })
  return {
    problemCount: measured.length,
    languages: LANGUAGES.map(lang => languageCard(source, lang.id, lang.label, latest.langs ?? [])),
    problems: cards,
  }
}

export function problemById(board: Overview, id: string): ProblemCard {
  const found = board.problems.find(problem => problem.id === id)
  if (!found) throw new HistoryError(`problem ${id} is not on the board`)
  return found
}

export const overview = buildOverview(history, catalog.tasks.map(task => ({
  id: task.id,
  title: task.title,
  summary: task.summary,
  path: task.path,
})))

function problemCard(source: History, problem: ProblemRef, latest: readonly ProblemRow[]): ProblemCard {
  const trend = markSeries(measured(source).map(entry => ({
    commit: entry.commit,
    timestamp: entry.timestamp,
    value: bestRegex(entry.problems ?? [], problem.id),
  })), 'improvement')
  const marks = VERSIONS.map(version => ({
    id: version.id,
    label: version.label,
    filled: covered(latest, problem.id, version.id),
  }))
  const improved = trend.filter(sample => sample.mark)
  return {
    ...problem,
    gaps: VERSIONS.length - marks.filter(mark => mark.filled).length,
    improvedAt: improved.length === 0 ? '' : improved[improved.length - 1].timestamp,
    marks,
    trend,
    fronts: VERSIONS.map(version => ({
      id: version.id,
      label: version.label,
      points: front(latest, problem.id, version.id),
    })),
  }
}

function languageCard(source: History, id: LanguageId, label: string, latest: History['entries'][number]['langs']): LanguageCard {
  if (latest === null) throw new HistoryError('latest measurement has no languages')
  const row = latest.find(item => item.lang === id)
  if (!row) throw new HistoryError(`latest measurement has no ${id}`)
  const trend = markSeries(measured(source).map(entry => ({
    commit: entry.commit,
    timestamp: entry.timestamp,
    value: entry.problems === null ? null : overhead(entry.problems, id),
  })), 'change')
  return {
    id,
    label,
    ruleCount: row.status === 'pass' ? row.ruleCount : null,
    ruleChars: row.status === 'pass' ? row.ruleChars : null,
    coverage: coverage(latestProblems(source), id),
    overhead: overhead(latestProblems(source), id),
    trend,
  }
}

function latestProblems(source: History): ProblemRow[] {
  const latest = source.entries[source.entries.length - 1]
  if (!latest || latest.problems === null) throw new HistoryError('latest measurement has no problems')
  return latest.problems
}

function measured(source: History): History['entries'] {
  return source.entries.filter(entry => {
    if ((entry.problems === null) !== (entry.langs === null)) {
      throw new HistoryError(`${entry.commit}: problems and langs are recorded together`)
    }
    return entry.problems !== null
  })
}

function problemIds(rows: readonly ProblemRow[]): string[] {
  const ids: string[] = []
  for (const row of rows) {
    if (!ids.includes(row.problem)) ids.push(row.problem)
  }
  return ids
}

function bestRegex(rows: readonly ProblemRow[], problem: string, version?: VersionId): number | null {
  const values = rows.flatMap(row => {
    if (row.problem !== problem || row.status !== 'pass') return []
    if (version !== undefined && versionOf(row.solution) !== version) return []
    return [row.regexEvals]
  })
  if (values.length === 0) return null
  return Math.min(...values)
}

function covered(rows: readonly ProblemRow[], problem: string, version: VersionId): boolean {
  return rows.some(row => row.problem === problem && row.status === 'pass' && versionOf(row.solution) === version)
}

function coverage(rows: readonly ProblemRow[], version: VersionId): number {
  const ids = new Set<string>()
  for (const row of rows) {
    if (row.status === 'pass' && versionOf(row.solution) === version) ids.add(row.problem)
  }
  return ids.size
}

export function overhead(rows: readonly ProblemRow[], lang: LanguageId): number | null {
  const shared = problemIds(rows).filter(id => VERSIONS.every(version => bestRegex(rows, id, version.id) !== null))
  if (shared.length === 0) return null
  return geometricMean(shared.map(id => ratio(rows, id, lang)))
}

function ratio(rows: readonly ProblemRow[], problem: string, lang: LanguageId): number {
  const langBest = bestRegex(rows, problem, lang)
  const directBest = bestRegex(rows, problem, 'direct')
  if (langBest === null || directBest === null || langBest <= 0 || directBest <= 0) {
    throw new HistoryError(`${problem} ${lang} regex evals ratio ${String(langBest)}/${String(directBest)}`)
  }
  return langBest / directBest
}

function front(rows: readonly ProblemRow[], problem: string, version: VersionId): ParetoPoint[] {
  const passing: ParetoPoint[] = []
  for (const row of rows) {
    if (row.problem !== problem || row.status !== 'pass' || versionOf(row.solution) !== version) continue
    passing.push(toPoint(row))
  }
  const kept = passing.filter(point => !passing.some(other => other.solution !== point.solution && dominates(other, point)))
  if (kept.length > MAX_FRONT) throw new HistoryError(`${problem} ${version} front has ${kept.length} solutions`)
  return kept
}

function toPoint(row: ProblemRow & PassCounters): ParetoPoint {
  return {
    solution: row.solution,
    regexEvals: row.regexEvals,
    regexMatches: row.regexMatches,
    stateBytes: row.stateBytes,
    ruleCount: row.ruleCount,
    ruleChars: row.ruleChars,
  }
}

function markSeries(
  samples: readonly { commit: string, timestamp: string, value: number | null }[],
  mode: 'improvement' | 'change',
): TrendSample[] {
  let previous: number | null = null
  let best: number | null = null
  return samples.map(sample => {
    if (sample.value === null) {
      if (mode === 'change') previous = null
      return { ...sample, mark: false }
    }
    if (mode === 'improvement') {
      const mark = best === null || sample.value < best
      if (mark) best = sample.value
      return { ...sample, mark }
    }
    const mark = previous === null || sample.value !== previous
    previous = sample.value
    return { ...sample, mark }
  })
}
