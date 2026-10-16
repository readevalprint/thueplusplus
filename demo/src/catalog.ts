import raw from './generated/catalog.json'

export type CatalogStatus = 'pass' | 'fail' | 'unsupported'

export interface CatalogGuest {
  id: string
  name: string
  program: string
  ruleCount: number
  passCount: number
  taskCount: number
  stepCount: number
}

export interface CatalogCase {
  name: string
  stdin: string
  stdout: string
  stderr: string
  exitCode: number
}

export interface CatalogGuestResult {
  id: string
  name: string
  status: CatalogStatus
  stepCount: number | null
  solution: string | null
  solutionPath: string | null
  reason: string | null
  error: string | null
}

export interface CatalogTask {
  id: string
  title: string
  description: string
  summary: string
  path: string
  canonical: string
  documentTitle: string
  cases: CatalogCase[]
  guests: CatalogGuestResult[]
}

export interface Catalog {
  schemaVersion: 1
  specVersion: string
  commit: string
  commitDirty: boolean
  author: string
  timestamp: string
  guests: CatalogGuest[]
  tasks: CatalogTask[]
}

export interface RouteMetaFields {
  documentTitle: string
  description: string
  canonical: string
  robots: string
}

function assertCatalog(value: unknown): Catalog {
  if (value == null || typeof value !== 'object') throw new Error('catalog.json is not an object')
  const catalog = value as Catalog
  if (catalog.schemaVersion !== 1) throw new Error(`catalog schemaVersion must be 1, got ${String(catalog.schemaVersion)}`)
  if (!Array.isArray(catalog.tasks) || catalog.tasks.length === 0) throw new Error('catalog has no tasks')
  if (!Array.isArray(catalog.guests) || catalog.guests.length === 0) throw new Error('catalog has no guests')
  return catalog
}

export const catalog = assertCatalog(raw)

export function taskById(id: string): CatalogTask | undefined {
  return catalog.tasks.find(task => task.id === id)
}

export function taskRouteMeta(taskId: string): RouteMetaFields {
  const task = taskById(taskId)
  if (!task) {
    return {
      documentTitle: 'Task not found — Thue++',
      description: `No task ${taskId} is in the suite.`,
      canonical: 'https://thuelang.org/tasks',
      robots: 'noindex,follow',
    }
  }
  return {
    documentTitle: task.documentTitle,
    description: task.summary,
    canonical: task.canonical,
    robots: 'index,follow',
  }
}

export function rankGuests(guests: CatalogGuest[]): CatalogGuest[] {
  return [...guests].sort((left, right) => {
    if (right.passCount !== left.passCount) return right.passCount - left.passCount
    if (left.stepCount !== right.stepCount) return left.stepCount - right.stepCount
    if (left.ruleCount !== right.ruleCount) return left.ruleCount - right.ruleCount
    if (left.id < right.id) return -1
    if (left.id > right.id) return 1
    return 0
  })
}

export function statusVariant(status: CatalogStatus): 'default' | 'secondary' | 'destructive' {
  if (status === 'pass') return 'default'
  if (status === 'fail') return 'destructive'
  return 'secondary'
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
