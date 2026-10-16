import { catalog, type CatalogTask } from './catalog'
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
  if (path === pages.tasks.path) {
    return catalog.tasks.map(task => ({ title: task.title, href: task.path }))
  }
  const task = catalog.tasks.find(item => item.path === path)
  if (task) return taskPageLinks(task)
  return pageByPath(path)?.links ?? []
}

function taskPageLinks(task: CatalogTask): PageLink[] {
  return [
    { title: 'Description', href: '#description' },
    { title: 'Input and output', href: '#input-and-output' },
    ...task.guests.map(guest => ({ title: guest.name, href: `#${guest.id}` })),
  ]
}
