export interface SiteLink {
  title: string
  to: string
}

export const headerLinks: SiteLink[] = [
  { title: 'Install', to: '/install' },
  { title: 'Docs', to: '/docs' },
  { title: 'Leaderboard', to: '/problems' },
  { title: 'Contribute', to: '/contribute' },
]

export const footerLinks: SiteLink[] = [
  { title: 'Playground', to: '/playground' },
  { title: 'Projects', to: '/projects' },
  { title: 'Metrics', to: '/metrics' },
  { title: 'Autoresearch prompt', to: '/autoresearch' },
]

export function headerLinkCurrent(path: string, to: string): boolean {
  return path === to || path.startsWith(`${to}/`)
}
