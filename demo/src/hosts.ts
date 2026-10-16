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
}

// Landing sentence and Hosts page order. Every hosts.toml id is required.
const SITE_ORDER = ['go', 'python', 'wasm', 'rust']

export const soonLanguages = ['cpp', 'erlang', 'ocaml', 'perl', 'ruby', 'haskell']

export const repositoryUrl = 'https://github.com/readevalprint/thueplusplus'

interface HostsPageRecord {
  title: string
  documentTitle: string
  links: { title: string; href: string }[]
}

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
    href: `/hosts#${presentation.anchor}`,
  }
})

const hostTitles = siteHosts.map(host => host.title)
export const shippedHosts = englishList(hostTitles, 'and')
export const hostProseList = englishList(hostTitles, 'or')
export const hostsPageTitle = `${shippedHosts}.`
export const hostsDocumentTitle = `Thue++ Hosts — ${shippedHosts}`

const hostsPage = (pageRecords as { hosts: HostsPageRecord }).hosts
if (hostsPage.title !== hostsPageTitle) {
  throw new Error(`pages.json hosts title must be ${hostsPageTitle}`)
}
if (hostsPage.documentTitle !== hostsDocumentTitle) {
  throw new Error(`pages.json hosts documentTitle must be ${hostsDocumentTitle}`)
}
const expectedLinks = siteHosts.map(host => ({ title: host.title, href: `#${host.anchor}` }))
if (JSON.stringify(hostsPage.links) !== JSON.stringify(expectedLinks)) {
  throw new Error(`pages.json hosts links must be ${JSON.stringify(expectedLinks)}`)
}
