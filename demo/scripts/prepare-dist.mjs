import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('../dist/', import.meta.url).pathname
const demoRoot = new URL('../', import.meta.url).pathname
const pages = JSON.parse(readFileSync(new URL('../src/pages.json', import.meta.url), 'utf8'))
const embed = {
  dir: 'embed',
  documentTitle: 'Thue++ Embed',
  description: 'Embeddable Thue++ playground surface.',
  canonical: 'https://thuelang.org/embed',
  robots: 'noindex,follow',
  title: 'Thue++ Embed',
}

copyPublicAssets()

const rootIndexPath = join(dist, 'index.html')
const built = readFileSync(rootIndexPath, 'utf8')
const homeHtml = renderPage(built, pages.home)
writeFileSync(rootIndexPath, homeHtml)
copyFileSync(rootIndexPath, join(dist, '404.html'))

for (const page of Object.values(pages)) {
  if (page.path === '/') continue
  const dir = page.path.replace(/^\//, '')
  mkdirSync(join(dist, dir), { recursive: true })
  writeFileSync(join(dist, dir, 'index.html'), renderPage(built, page))
}

mkdirSync(join(dist, embed.dir), { recursive: true })
writeFileSync(join(dist, embed.dir, 'index.html'), renderPage(built, embed))

const staticRoutes = [...Object.values(pages).filter(page => page.path !== '/').map(page => page.path.replace(/^\//, '')), embed.dir]
console.log(`demo production dist static routes ok: ${staticRoutes.join(', ')}`)

function copyPublicAssets() {
  const publicDir = join(demoRoot, 'public')
  if (!existsSync(publicDir)) return
  cpSync(publicDir, dist, { recursive: true, force: true })
}

function renderPage(html, page) {
  const withMeta = updateMetadata(html, {
    title: page.documentTitle,
    description: page.description,
    canonical: page.canonical,
    robots: page.robots,
  })
  const body = `      <h1>${escapeHtml(page.title)}</h1>`
  return withMeta.replace('<div id="app"></div>', `<div id="app">\n${body}\n    </div>`)
}

function updateMetadata(html, metadata) {
  let updated = html.replace(/<title>[^<]*<\/title>/, `<title>${escapeHtml(metadata.title)}</title>`)
  updated = setMeta(updated, 'name', 'description', metadata.description)
  updated = setMeta(updated, 'name', 'robots', metadata.robots)
  updated = setMeta(updated, 'property', 'og:title', metadata.title)
  updated = setMeta(updated, 'property', 'og:description', metadata.description)
  updated = setMeta(updated, 'property', 'og:url', metadata.canonical)
  updated = setMeta(updated, 'name', 'twitter:title', metadata.title)
  updated = setMeta(updated, 'name', 'twitter:description', metadata.description)
  updated = updated.replace(/<link rel="canonical" href="[^"]*" \/>/, `<link rel="canonical" href="${metadata.canonical}" />`)
  return updated
}

function setMeta(html, attr, key, value) {
  const escaped = escapeAttribute(value)
  const re = new RegExp(`<meta ${attr}="${escapeRegExp(key)}" content="[^"]*" \/>`)
  const tag = `<meta ${attr}="${key}" content="${escaped}" />`
  if (re.test(html)) return html.replace(re, tag)
  return html.replace('</head>', `    ${tag}\n  </head>`)
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", '&#39;')
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
