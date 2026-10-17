import { parse as parseToml } from 'smol-toml'
import hostsToml from '../../hosts.toml?raw'
import pageRecords from './pages.json'

export interface SiteHost {
  id: string
  landing: string
  title: string
  anchor: string
  href: string
}

interface Presentation {
  landing: string
  title: string
  anchor: string
}

const PRESENTATION: Record<string, Presentation> = {
  go: { landing: 'go', title: 'Go', anchor: 'go' },
  python: { landing: 'python', title: 'Python', anchor: 'python' },
  wasm: { landing: 'js', title: 'JavaScript', anchor: 'javascript' },
  rust: { landing: 'rust', title: 'Rust', anchor: 'rust' },
  cpp: { landing: 'cpp', title: 'C++', anchor: 'cpp' },
}

// Landing sentence and install page order. Every hosts.toml id is required.
const SITE_ORDER = ['go', 'python', 'wasm', 'rust', 'cpp']

export const soonLanguages = ['erlang', 'ocaml', 'perl', 'ruby', 'haskell']

export const repositoryUrl = 'https://github.com/thuelang/thueplusplus'

interface InstallPageRecord {
  path: string
  title: string
  documentTitle: string
  links: { title: string; href: string }[]
}

const PLATFORM_PAGE: Record<string, string> = {
  go: 'installGo',
  python: 'installPython',
  wasm: 'installJs',
  rust: 'installRust',
  cpp: 'installCpp',
}

const PLATFORM_LINKS = [
  { title: 'Install', href: '#install' },
  { title: 'Library', href: '#library' },
  { title: 'CLI', href: '#cli' },
  { title: 'API', href: '#api' },
]

function readHostIds(text: string): string[] {
  const parsed = parseToml(text) as { host?: { id?: unknown }[] }
  if (!Array.isArray(parsed.host) || parsed.host.length === 0) {
    throw new Error('hosts.toml host must be a non-empty array')
  }
  const ids = parsed.host.map((row, index) => {
    if (typeof row?.id !== 'string' || row.id.length === 0) {
      throw new Error(`hosts.toml host #${index + 1} id is empty`)
    }
    return row.id
  })
  if (new Set(ids).size !== ids.length) throw new Error('hosts.toml has a duplicate id')
  return ids
}

function englishList(items: string[], conjunction: 'and' | 'or'): string {
  if (items.length < 2) throw new Error('a host list needs at least two names')
  if (items.length === 2) return `${items[0]} ${conjunction} ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, ${conjunction} ${items[items.length - 1]}`
}

const registryIds = readHostIds(hostsToml)
const registrySet = new Set(registryIds)
for (const id of SITE_ORDER) {
  if (!registrySet.has(id)) throw new Error(`site host ${id} is not in hosts.toml`)
  if (!PRESENTATION[id]) throw new Error(`site host ${id} has no presentation`)
}
for (const id of registryIds) {
  if (!SITE_ORDER.includes(id)) throw new Error(`hosts.toml host ${id} is missing from the site order`)
}

const landingNames = new Set(SITE_ORDER.map(id => PRESENTATION[id].landing))
for (const name of soonLanguages) {
  if (landingNames.has(name)) throw new Error(`${name} is both shipped and soon`)
}

export const siteHosts: SiteHost[] = SITE_ORDER.map(id => {
  const presentation = PRESENTATION[id]
  return {
    id,
    landing: presentation.landing,
    title: presentation.title,
    anchor: presentation.anchor,
    href: `/install/${presentation.landing}`,
  }
})

const hostTitles = siteHosts.map(host => host.title)
export const shippedHosts = englishList(hostTitles, 'and')
export const hostProseList = englishList(hostTitles, 'or')

const records = pageRecords as Record<string, InstallPageRecord>
const installOverview = records.install
if (!installOverview) throw new Error('pages.json is missing install')
if (installOverview.path !== '/install') throw new Error('pages.json install path must be /install')
const overviewLinks = [
  { title: 'Quick start', href: '#quick-start' },
  { title: 'Supported', href: '#supported' },
  { title: 'Coming soon', href: '#coming-soon' },
]
if (JSON.stringify(installOverview.links) !== JSON.stringify(overviewLinks)) {
  throw new Error(`pages.json install links must be ${JSON.stringify(overviewLinks)}`)
}

for (const host of siteHosts) {
  const key = PLATFORM_PAGE[host.id]
  if (!key) throw new Error(`install page key is missing for ${host.id}`)
  const page = records[key]
  if (!page) throw new Error(`pages.json is missing ${key}`)
  if (page.path !== host.href) throw new Error(`pages.json ${key} path must be ${host.href}`)
  if (page.title !== `${host.title}.`) throw new Error(`pages.json ${key} title must be ${host.title}.`)
  if (page.documentTitle !== `Thue++ Install — ${host.title}`) {
    throw new Error(`pages.json ${key} documentTitle must be Thue++ Install — ${host.title}`)
  }
  if (JSON.stringify(page.links) !== JSON.stringify(PLATFORM_LINKS)) {
    throw new Error(`pages.json ${key} links must be ${JSON.stringify(PLATFORM_LINKS)}`)
  }
}
