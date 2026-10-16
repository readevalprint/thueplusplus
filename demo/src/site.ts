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
  return pageByPath(path)?.links ?? []
}
