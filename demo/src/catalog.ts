import raw from './generated/catalog.json'

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
  id: 'direct' | 'lisp' | 'forth' | 'basic'
  name: string
  missing: boolean
  solutions: CatalogSolution[]
  series: CatalogPoint[]
}

export interface CatalogProblem {
  id: string
  title: string
  description: string
  summary: string
  path: string
  canonical: string
  documentTitle: string
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
  schemaVersion: 2
  specVersion: string
  commit: string
  author: string
  timestamp: string
  commits: CatalogCommit[]
  langs: CatalogLang[]
  problems: CatalogProblem[]
}

export interface RouteMetaFields {
  documentTitle: string
  description: string
  canonical: string
  robots: string
}

export const VERSION_COLORS: Record<CatalogVersion['id'], string> = {
  direct: 'var(--chart-1)',
  lisp: 'var(--chart-2)',
  forth: 'var(--chart-3)',
  basic: 'var(--chart-4)',
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
  if (catalog.schemaVersion !== 2) throw new Error(`catalog schemaVersion must be 2, got ${String(catalog.schemaVersion)}`)
  if (!Array.isArray(catalog.problems) || catalog.problems.length === 0) throw new Error('catalog has no problems')
  if (!Array.isArray(catalog.commits) || catalog.commits.length === 0) throw new Error('catalog has no commits')
  if (!Array.isArray(catalog.langs)) throw new Error('catalog has no langs')
  return catalog
}

export const catalog = assertCatalog(raw)

export function problemById(id: string): CatalogProblem | undefined {
  return catalog.problems.find(problem => problem.id === id)
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
  return `https://gitlab.com/thuelang/thueplusplus/-/blob/main/${program}`
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
