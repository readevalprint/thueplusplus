import { catalog, type CatalogProblem } from './catalog'
import pageRecords from './pages.json'

export interface PageLink {
  title: string
  href: string
}

export interface PageRecord {
  path: string
  kicker: string
  title: string
  description: string
  documentTitle: string
  canonical: string
  robots: string
  links: PageLink[]
}

export const pages = pageRecords as Record<string, PageRecord>

export const shellPages = Object.values(pages)

export function pageByPath(path: string): PageRecord | undefined {
  return shellPages.find(page => page.path === path)
}

export function pageLinks(path: string): PageLink[] {
  if (path === pages.problems.path) {
    return catalog.problems.map(problem => ({ title: problem.title, href: problem.path }))
  }
  const problem = catalog.problems.find(item => item.path === path)
  if (problem) return problemPageLinks(problem)
  return pageByPath(path)?.links ?? []
}

function problemPageLinks(problem: CatalogProblem): PageLink[] {
  if (problem.versions.length === 0) throw new Error(`${problem.id} has no solutions`)
  return [
    { title: 'Cost', href: '#cost' },
    { title: 'Scoreboard', href: '#scoreboard' },
    { title: 'Example', href: '#example' },
    { title: 'Solutions', href: '#solutions' },
  ]
}
