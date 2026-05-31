// SPDX-License-Identifier: AGPL-3.0-or-later
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

const dist = new URL('../dist/', import.meta.url).pathname
const demoRoot = new URL('../', import.meta.url).pathname
const repoRoot = new URL('../../', import.meta.url).pathname
const staticRoutes = ['playground', 'embed', 'embed/demo']

copyPublicAssets()

const rootIndexPath = join(dist, 'index.html')
const rootIndex = injectPrerenderedReadme(readFileSync(rootIndexPath, 'utf8'))
writeFileSync(rootIndexPath, rootIndex)

for (const route of staticRoutes) {
  const routeDir = join(dist, route)
  mkdirSync(routeDir, { recursive: true })
  const html = routeHtml(route, rootIndex)
  writeFileSync(join(routeDir, 'index.html'), html)
}

// Keep a custom fallback for unknown direct SPA links. The explicit route
// copies above make known routes return HTTP 200 instead of GitLab Pages'
// custom-404 status.
copyFileSync(rootIndexPath, join(dist, '404.html'))

console.log(`demo production dist static routes ok: ${staticRoutes.join(', ')}`)

function copyPublicAssets() {
  const publicDir = join(demoRoot, 'public')
  if (!existsSync(publicDir)) return
  cpSync(publicDir, dist, { recursive: true, force: true })
}

function routeHtml(route, html) {
  if (route === 'playground') {
    return updateMetadata(html, {
      title: 'Thue++ Playground — Run String-Rewrite Programs in the Browser',
      description: 'Run Thue++ examples in the browser playground, inspect state transitions, and experiment with deterministic regex rewrite rules.',
      canonical: 'https://thuelang.org/playground',
      robots: 'index,follow',
    })
  }
  return updateMetadata(html, {
    title: route === 'embed/demo' ? 'Thue++ Embed Demo' : 'Thue++ Embed',
    description: 'Embeddable Thue++ playground surface.',
    canonical: `https://thuelang.org/${route}`,
    robots: 'noindex,follow',
  })
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

function injectPrerenderedReadme(html) {
  const readme = readFileSync(join(repoRoot, 'README.md'), 'utf8')
  const prerendered = renderMarkdown(readme)
  return html.replace('<div id="app"></div>', `<div id="app">\n${prerendered}\n    </div>`)
}

function renderMarkdown(markdown) {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const body = []
  const headings = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim() || /^\s*<!--[\s\S]*-->\s*$/.test(line)) { i += 1; continue }
    const fence = line.match(/^```([^`]*)$/)
    if (fence) {
      const lang = fence[1].trim().split(/\s+/)[0]
      const code = []
      i += 1
      while (i < lines.length && !lines[i].startsWith('```')) { code.push(lines[i]); i += 1 }
      if (i < lines.length) i += 1
      body.push(`          <pre class="readme-code"><code${lang ? ` class="language-${escapeAttribute(lang)}"` : ''}>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }
    const heading = line.match(/^(#{1,6})\s+(.+)$/)
    if (heading) {
      const level = heading[1].length
      const text = stripMarkdown(heading[2].trim())
      const id = slugify(text)
      if (level <= 3) headings.push({ id, level, text })
      body.push(`          <h${level} id="${id}">${renderInline(heading[2].trim())}</h${level}>`)
      i += 1
      continue
    }
    if (/^\s*[-*]\s+/.test(line)) {
      body.push('          <ul>')
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        body.push(`            <li>${renderInline(lines[i].replace(/^\s*[-*]\s+/, '').trim())}</li>`)
        i += 1
      }
      body.push('          </ul>')
      continue
    }
    if (line.startsWith('> ')) {
      body.push(`          <blockquote>${renderInline(line.slice(2).trim())}</blockquote>`)
      i += 1
      continue
    }
    const paragraph = []
    while (i < lines.length && lines[i].trim() && !/^```/.test(lines[i]) && !/^(#{1,6})\s+/.test(lines[i]) && !/^\s*[-*]\s+/.test(lines[i]) && !/^\s*<!--[\s\S]*-->\s*$/.test(lines[i])) {
      paragraph.push(lines[i].trim())
      i += 1
    }
    if (paragraph.length) body.push(`          <p>${renderInline(paragraph.join(' '))}</p>`)
  }
  return [
    '      <main class="readme-page prerendered-readme" data-prerendered="true">',
    renderToc(headings),
    '        <article class="readme-document">',
    ...body,
    '        </article>',
    '      </main>',
  ].join('\n')
}

function renderToc(headings) {
  const links = headings.map((heading, index) => {
    const active = index === 0 ? ' class="active" aria-current="location"' : ''
    return `          <a href="#${escapeAttribute(heading.id)}"${active} data-level="${heading.level}">${escapeHtml(heading.text)}</a>`
  })
  return [
    '        <nav class="readme-toc" aria-label="Table of contents" data-test="readme-toc">',
    '          <p>On this page</p>',
    ...links,
    '        </nav>',
  ].join('\n')
}

function renderInline(text) {
  let html = escapeHtml(text)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|[^)]+)\)/g, (_match, label, href) => `<a href="${escapeAttribute(href)}">${label}</a>`)
  return html
}

function stripMarkdown(text) {
  return text.replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[*_]/g, '')
}

function slugify(text) {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
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
