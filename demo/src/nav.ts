import { siteHosts } from './hosts'
import { projects } from './projects'

export interface NavItem {
  title: string
  description: string
  to: string
}

export interface NavGroup {
  title: string
  items: NavItem[]
}

export interface NavDirect {
  title: string
  to: string
}

const installNotes: Record<string, string> = {
  go: 'The native Go engine and the thue command.',
  python: 'The Python package and the thue console script.',
  wasm: 'The Go engine compiled to WebAssembly, and the Node command.',
  rust: 'The thue crate and command.',
  cpp: 'The CMake library and the thue command.',
}

for (const host of siteHosts) {
  if (!installNotes[host.id]) throw new Error(`install menu has no note for ${host.id}`)
}

export const navGroups: NavGroup[] = [
  {
    title: 'Docs',
    items: [
      {
        title: 'Language reference',
        description: 'Operators, resources, and the limits a run starts with.',
        to: '/docs/language',
      },
      {
        title: 'Problems',
        description: 'Input and output contracts, the suite, and each solution.',
        to: '/problems',
      },
      {
        title: 'Guides',
        description: 'A short tour of a program and a run in the browser.',
        to: '/docs/guides',
      },
    ],
  },
  {
    title: 'Install',
    items: [
      {
        title: 'Quick start',
        description: 'Supported platforms and what is coming soon.',
        to: '/install',
      },
      ...siteHosts.map(host => ({
        title: host.title,
        description: installNotes[host.id],
        to: host.href,
      })),
    ],
  },
  {
    title: 'Projects',
    items: [
      {
        title: 'Sandboxed projects',
        description: 'Interpreters and apps the engine runs.',
        to: '/projects',
      },
      ...projects.map(project => ({
        title: project.name,
        description: project.description,
        to: `/projects#${project.id}`,
      })),
    ],
  },
]

export const navDirect: NavDirect[] = [
  { title: 'Metrics', to: '/metrics' },
  { title: 'Playground', to: '/playground' },
  { title: 'Contribute', to: '/contribute' },
  { title: 'Autoresearch prompt', to: '/autoresearch' },
]

export function navItemCurrent(path: string, hash: string, to: string): boolean {
  const hashIndex = to.indexOf('#')
  const target = hashIndex === -1 ? to : to.slice(0, hashIndex)
  const fragment = hashIndex === -1 ? '' : to.slice(hashIndex)
  return path === target && fragment === hash
}

export function navGroupCurrent(path: string, group: NavGroup): boolean {
  return group.items.some(item => {
    const target = item.to.split('#')[0]
    return path === target || path.startsWith(`${target}/`)
  })
}
