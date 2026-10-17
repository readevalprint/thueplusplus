import raw from './generated/catalog.json'
import { repositoryBlob, repositoryTree } from './hosts'

export type CatalogStatus = 'pass' | 'fail'
export type CatalogLangStatus = CatalogStatus | 'missing'

export interface CatalogCommit {
  commit: string
  author: string
  timestamp: string
}

export interface CatalogPoint {
  commit: string
  solution: string
  cost: number
  steps: number
  regexEvals: number
  regexMatches: number
  stateBytes: number
  statePeak: number
  ruleCount: number
  ruleChars: number
}

export interface CatalogSolution {
  id: string
  status: CatalogStatus
  steps: number | null
  cost: number | null
  regexEvals: number | null
  regexMatches: number | null
  stateBytes: number | null
  statePeak: number | null
  ruleCount: number | null
  ruleChars: number | null
  solution: string
  solutionPath: string
}

export interface CatalogVersion {
  id: string
  name: string
  color: string
  missing: boolean
  notes: string
  author: string
  solutions: CatalogSolution[]
  series: CatalogPoint[]
}

export interface SolvedPoint extends CatalogCommit {
  count: number
  added: string[]
}

export interface AggregatePoint extends CatalogCommit {
  cost: number
}

export interface CatalogRuleset {
  id: string
  name: string
  color: string
  passing: number
  total: number
  common: number
  aggregate: number | null
  solved: SolvedPoint[]
  aggregateSeries: AggregatePoint[]
}

export interface ProblemCase {
  name: string
  reads: Record<string, string[]>
  writes: Record<string, string>
}

export interface ProblemResource {
  name: string
  read: boolean
  write: boolean
}

export interface CatalogProblem {
  id: string
  title: string
  description: string
  summary: string
  credit: string
  path: string
  canonical: string
  documentTitle: string
  resources: ProblemResource[]
  cases: ProblemCase[]
  versions: CatalogVersion[]
}

export interface CatalogLang {
  id: string
  language: string
  name: string
  program: string | null
  status: CatalogLangStatus
  steps: number | null
  cost: number | null
  regexEvals: number | null
  regexMatches: number | null
  stateBytes: number | null
  statePeak: number | null
  ruleCount: number | null
  ruleChars: number | null
}

export interface Catalog {
  schemaVersion: 3
  specVersion: string
  commit: string
  author: string
  timestamp: string
  commonProblems: string[]
  rulesets: CatalogRuleset[]
  commits: CatalogCommit[]
  problems: CatalogProblem[]
}

export interface RouteMetaFields {
  documentTitle: string
  description: string
  canonical: string
  robots: string
}

export function rulesetColor(id: string): string {
  const ruleset = catalog.rulesets.find(item => item.id === id)
  if (!ruleset) throw new Error(`ruleset ${id} has no chart color`)
  return ruleset.color
}

export const COST_METRIC = { id: 'cost', label: 'Cost', anchor: 'cost' } as const

export function runningBest(commits: readonly string[], points: readonly CatalogPoint[]): (number | undefined)[] {
  const atCommit = new Map<string, number>()
  for (const point of points) {
    if (!Number.isInteger(point.cost) || point.cost < 0) throw new Error(`cost for ${point.solution} is not a non-negative integer`)
    const prior = atCommit.get(point.commit)
    atCommit.set(point.commit, prior === undefined ? point.cost : Math.min(prior, point.cost))
  }
  let best: number | undefined
  return commits.map(commit => {
    const value = atCommit.get(commit)
    if (value !== undefined) best = best === undefined ? value : Math.min(best, value)
    return best
  })
}

function assertCatalog(value: unknown): Catalog {
  if (value == null || typeof value !== 'object') throw new Error('catalog.json is not an object')
  const catalog = value as Catalog
  if (catalog.schemaVersion !== 3) throw new Error(`catalog schemaVersion must be 3, got ${String(catalog.schemaVersion)}`)
  if (!Array.isArray(catalog.problems) || catalog.problems.length === 0) throw new Error('catalog has no problems')
  if (!Array.isArray(catalog.commits) || catalog.commits.length === 0) throw new Error('catalog has no commits')
  if (!Array.isArray(catalog.rulesets) || catalog.rulesets.length === 0) throw new Error('catalog has no rulesets')
  for (const problem of catalog.problems) {
    if (!Array.isArray(problem.cases) || problem.cases.length === 0) throw new Error(`${problem.id} has no cases`)
    if (!Array.isArray(problem.resources) || problem.resources.length === 0) throw new Error(`${problem.id} has no resources`)
    if (!problem.credit.startsWith('Adapted from the Rosetta Code')) throw new Error(`${problem.id} credit is missing`)
  }
  return catalog
}

export const catalog = assertCatalog(raw)

export function problemById(id: string): CatalogProblem | undefined {
  return catalog.problems.find(problem => problem.id === id)
}

export function solutionPath(problemId: string, solutionId: string): string {
  return `/problems/${problemId}/${solutionId}`
}

export function versionById(problem: CatalogProblem, solutionId: string): CatalogVersion | undefined {
  return problem.versions.find(version => version.id === solutionId)
}

export function bestVersion(problem: CatalogProblem): CatalogVersion {
  const ranked = problem.versions.filter(version => {
    const cost = version.solutions[0]?.cost
    return version.solutions[0]?.status === 'pass' && cost != null
  })
  if (ranked.length === 0) throw new Error(`${problem.id} has no passing solution`)
  return ranked.reduce((best, version) => {
    const cost = version.solutions[0].cost
    const bestCost = best.solutions[0].cost
    if (cost == null || bestCost == null) throw new Error(`${problem.id} cost is missing`)
    if (cost < bestCost) return version
    if (cost === bestCost && version.id === 'direct') return version
    return best
  })
}

export function authorName(author: string): string {
  const match = author.match(/^(.*?)\s*</)
  const name = match ? match[1].trim() : author.trim()
  if (name.length === 0) throw new Error(`author is empty: ${author}`)
  return name
}

export function measuredOn(commit: string): string {
  const row = catalog.commits.find(item => item.commit === commit)
  if (!row) throw new Error(`commit ${commit} is not in the catalog`)
  return row.timestamp.slice(0, 10)
}

export function caseInput(item: ProblemCase): Record<string, string> {
  const reads: Record<string, string> = {}
  for (const [name, lines] of Object.entries(item.reads)) {
    if (!Array.isArray(lines) || lines.some(line => typeof line !== 'string')) throw new Error(`case ${item.name} reads are not lines`)
    reads[name] = lines.length === 0 ? '' : `${lines.join('\n')}\n`
  }
  return reads
}

export function solutionRouteMeta(problemId: string, solutionId: string): RouteMetaFields {
  const problem = problemById(problemId)
  const version = problem ? versionById(problem, solutionId) : undefined
  if (!problem || !version) {
    return {
      documentTitle: 'Solution not found — Thue++',
      description: `No solution ${problemId}/${solutionId} is in the suite.`,
      canonical: 'https://thuelang.org/problems',
      robots: 'noindex,follow',
    }
  }
  const solution = version.solutions[0]
  return {
    documentTitle: `Thue++ ${problem.title} — ${version.name}`,
    description: `${version.name} for ${problem.title}, cost ${solution?.cost ?? 'unknown'}.`,
    canonical: `https://thuelang.org${solutionPath(problem.id, version.id)}`,
    robots: 'index,follow',
  }
}

export function rulesetById(id: string): CatalogRuleset | undefined {
  return catalog.rulesets.find(ruleset => ruleset.id === id)
}

export function rulesetRouteMeta(rulesetId: string): RouteMetaFields {
  const ruleset = rulesetById(rulesetId)
  if (!ruleset) {
    return {
      documentTitle: 'Ruleset not found — Thue++',
      description: `No ruleset ${rulesetId} is in the suite.`,
      canonical: 'https://thuelang.org/problems',
      robots: 'noindex,follow',
    }
  }
  return {
    documentTitle: `Thue++ ${ruleset.name}`,
    description: `${ruleset.name} aggregate cost over the common problems.`,
    canonical: `https://thuelang.org/rulesets/${ruleset.id}`,
    robots: 'index,follow',
  }
}

export function problemRouteMeta(problemId: string): RouteMetaFields {
  const problem = problemById(problemId)
  if (!problem) {
    return {
      documentTitle: 'Problem not found — Thue++',
      description: `No problem ${problemId} is in the suite.`,
      canonical: 'https://thuelang.org/problems',
      robots: 'noindex,follow',
    }
  }
  return {
    documentTitle: problem.documentTitle,
    description: problem.summary,
    canonical: problem.canonical,
    robots: 'index,follow',
  }
}

export function statusVariant(status: CatalogStatus): 'outline' | 'destructive' {
  if (status === 'pass') return 'outline'
  return 'destructive'
}

export function versionStatus(version: CatalogVersion): CatalogStatus | null {
  if (version.missing || version.solutions.length === 0) return null
  if (version.solutions.some(solution => solution.status === 'fail')) return 'fail'
  return 'pass'
}

export function paragraphs(text: string): string[] {
  return text.split(/\n\n+/).map(item => item.trim()).filter(item => item.length > 0)
}

export function previewLine(text: string): string {
  const line = text.split('\n').find(item => item.length > 0) ?? ''
  if (line.length === 0) return 'empty'
  return line.length > 42 ? `${line.slice(0, 42)}…` : line
}

export function sourceUrl(program: string): string {
  return repositoryBlob(program)
}

export function improveUrl(path: string): string {
  return repositoryTree(path)
}

export function diagnosticText(point: Pick<CatalogPoint, 'regexEvals' | 'regexMatches' | 'stateBytes' | 'statePeak' | 'ruleCount' | 'ruleChars' | 'steps'>): string {
  return [
    `${point.regexEvals} regex evals`,
    `${point.regexMatches} regex matches`,
    `${point.stateBytes} cumulative state size`,
    `${point.statePeak} state peak`,
    `${point.ruleCount} rule count`,
    `${point.ruleChars} rule chars`,
    `${point.steps} steps`,
  ].join(' · ')
}
