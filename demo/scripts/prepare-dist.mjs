// SPDX-License-Identifier: AGPL-3.0-or-later
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('../dist/', import.meta.url).pathname
const demoRoot = new URL('../', import.meta.url).pathname
const repoRoot = new URL('../../', import.meta.url).pathname
const siteOrigin = 'https://thuelang.org'

copyPublicAssets()

const rootIndexPath = join(dist, 'index.html')
const appShell = readFileSync(rootIndexPath, 'utf8')
const challenges = loadChallenges()
const routes = buildRoutes(challenges)

const rootIndex = injectPrerenderedReadme(updateMetadata(appShell, {
  title: 'Thue++ — Deterministic String-Rewrite Programming Language',
  description: 'Thue++ is a rewrite-rule metalanguage for sandboxed DSLs, with ordered regex rewrites, exact arithmetic, explicit resources, and a browser playground.',
  canonical: `${siteOrigin}/`,
  robots: 'index,follow',
}))
writeFileSync(rootIndexPath, rootIndex)

for (const route of routes) {
  writeRoute(route.path, routeHtml(route))
}

writeFileSync(join(dist, '404.html'), fallbackHtml())
writeFileSync(join(dist, 'sitemap.xml'), sitemapXml(routes))

console.log(`demo production dist static routes ok: ${routes.map(route => route.path).join(', ')}`)

function copyPublicAssets() {
  const publicDir = join(demoRoot, 'public')
  if (!existsSync(publicDir)) return
  cpSync(publicDir, dist, { recursive: true, force: true })
}

function writeRoute(route, html) {
  const routeDir = join(dist, route)
  mkdirSync(routeDir, { recursive: true })
  writeFileSync(join(routeDir, 'index.html'), html)
}

function routeHtml(route) {
  return injectAppShell(updateMetadata(appShell, route.metadata), route.shell)
}

function fallbackHtml() {
  return injectAppShell(updateMetadata(appShell, {
    title: 'Thue++ — Loading',
    description: 'Loading the Thue++ app.',
    canonical: `${siteOrigin}/`,
    robots: 'noindex,follow',
  }), neutralShell('Loading Thue++', 'Preparing the app route…'))
}

function buildRoutes(challenges) {
  const routes = [
    {
      path: 'playground',
      metadata: {
        title: 'Thue++ Playground — Run String-Rewrite Programs in the Browser',
        description: 'Run Thue++ examples in the browser playground, inspect state transitions, and experiment with deterministic regex rewrite rules.',
        canonical: `${siteOrigin}/playground`,
        robots: 'index,follow',
      },
      shell: neutralShell('Loading playground', 'Preparing the editor, runtime, and examples…'),
    },
    {
      path: 'embed',
      metadata: embedMetadata('embed', 'Thue++ Embed'),
      shell: neutralShell('Loading embed', 'Preparing the embeddable playground…'),
    },
    {
      path: 'embed/demo',
      metadata: embedMetadata('embed/demo', 'Thue++ Embed Demo'),
      shell: neutralShell('Loading embed demo', 'Preparing the embeddable playground demo…'),
    },
    {
      path: 'challenges',
      metadata: {
        title: 'Learn Thue++ — Challenges',
        description: 'Learn Thue++ in small executable rewrite challenges and compare your answers with others.',
        canonical: `${siteOrigin}/challenges/`,
        robots: 'index,follow',
      },
      shell: challengesIndexShell(challenges),
    },
  ]

  for (const challenge of challenges) {
    routes.push({
      path: `challenges/${challenge.slug}`,
      metadata: {
        title: `${challenge.title} — Thue++ Challenge`,
        description: challenge.description,
        canonical: `${siteOrigin}/challenges/${challenge.slug}/`,
        robots: 'index,follow',
      },
      shell: challengeShell(challenge),
    })
    routes.push({
      path: `challenges/${challenge.slug}/solutions`,
      metadata: {
        title: `${challenge.title} Solutions — Thue++ Challenge`,
        description: `Ranked public solutions for the ${challenge.title} Thue++ challenge.`,
        canonical: `${siteOrigin}/challenges/${challenge.slug}/solutions`,
        robots: 'index,follow',
      },
      shell: challengeSolutionsShell(challenge),
    })
    for (const solution of challenge.solutions) {
      routes.push({
        path: `challenges/${challenge.slug}/solutions/${solution.id}`,
        metadata: {
          title: `${solution.title} — ${challenge.title} — Thue++ Challenge Solution`,
          description: `A public solution by ${solution.author} for the ${challenge.title} Thue++ challenge.`,
          canonical: `${siteOrigin}/challenges/${challenge.slug}/solutions/${solution.id}`,
          robots: 'index,follow',
        },
        shell: challengeSolutionShell(challenge, solution),
      })
    }
  }

  return routes
}

function embedMetadata(path, title) {
  return {
    title,
    description: 'Embeddable Thue++ playground surface.',
    canonical: `${siteOrigin}/${path}`,
    robots: 'noindex,follow',
  }
}

function loadChallenges() {
  return readdirSync(join(repoRoot, 'challenges'))
    .filter(slug => /^\d{2}_[a-z0-9][a-z0-9-]*$/.test(slug) && existsSync(join(repoRoot, 'challenges', slug, 'readme.md')))
    .sort()
    .map(slug => {
      const readme = readFileSync(join(repoRoot, 'challenges', slug, 'readme.md'), 'utf8')
      const { frontMatter, body } = splitFrontMatter(readme)
      const title = frontMatter.title || titleFromSlug(slug)
      return {
        slug,
        title,
        description: frontMatter.description || summaryFromBody(body) || `${title} Thue++ challenge.`,
        body,
        solutions: loadSolutions(slug),
      }
    })
}

function loadSolutions(slug) {
  const solutionsDir = join(repoRoot, 'challenges', slug, 'solutions')
  if (!existsSync(solutionsDir)) return []
  return readdirSync(solutionsDir)
    .filter(name => name.endsWith('.json'))
    .sort()
    .map(name => {
      const record = JSON.parse(readFileSync(join(solutionsDir, name), 'utf8'))
      return {
        id: record.solution_id || name.replace(/\.json$/, ''),
        title: record.solution_metadata?.title || titleFromSlug(name.replace(/\.json$/, '')),
        author: record.solution_metadata?.author || 'anonymous',
        rank: record.rank,
      }
    })
    .sort((left, right) => left.rank - right.rank || left.id.localeCompare(right.id))
}

function splitFrontMatter(markdown) {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  if (!match) return { frontMatter: {}, body: markdown }
  const frontMatter = {}
  for (const line of match[1].split('\n')) {
    const separator = line.indexOf(':')
    if (separator < 0) continue
    frontMatter[line.slice(0, separator).trim()] = line.slice(separator + 1).trim()
  }
  return { frontMatter, body: match[2] }
}

function summaryFromBody(markdown) {
  return markdown
    .replace(/```[\s\S]*?```/g, '')
    .split('\n')
    .map(line => line.trim())
    .find(line => line && !line.startsWith('#'))
    ?.replace(/`([^`]+)`/g, '$1')
    .slice(0, 180)
}

function neutralShell(title, description) {
  return [
    '      <main class="app-static-shell" data-test="app-fallback-shell">',
    `        <section class="app-static-card" aria-busy="true">`,
    `          <p class="app-static-eyebrow">Thue++</p>`,
    `          <h1>${escapeHtml(title)}</h1>`,
    `          <p>${escapeHtml(description)}</p>`,
    '          <div class="app-static-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>',
    '        </section>',
    '      </main>',
  ].join('\n')
}

function challengesIndexShell(challenges) {
  return [
    '      <main class="app-static-shell challenge-static-shell" data-test="challenge-index-static-shell">',
    '        <section class="app-static-card">',
    '          <p class="app-static-eyebrow">Thue++ Challenges</p>',
    '          <h1>Learn Thue++</h1>',
    '          <p>Loading the interactive challenge list…</p>',
    '          <ul class="app-static-route-list">',
    ...challenges.map(challenge => `            <li><a href="/challenges/${escapeAttribute(challenge.slug)}/">${escapeHtml(challenge.title)}</a></li>`),
    '          </ul>',
    '        </section>',
    '      </main>',
  ].join('\n')
}

function challengeShell(challenge) {
  return [
    `      <main class="app-static-shell challenge-static-shell" data-test="challenge-static-${escapeAttribute(challenge.slug)}">`,
    '        <section class="app-static-card">',
    '          <p class="app-static-eyebrow">Thue++ Challenge</p>',
    `          <h1>${escapeHtml(challenge.title)}</h1>`,
    `          <p>${escapeHtml(challenge.description)}</p>`,
    '          <div class="app-static-skeleton" aria-hidden="true"><span></span><span></span><span></span></div>',
    '        </section>',
    '      </main>',
  ].join('\n')
}

function challengeSolutionsShell(challenge) {
  return [
    `      <main class="app-static-shell challenge-static-shell" data-test="challenge-solutions-static-${escapeAttribute(challenge.slug)}">`,
    '        <section class="app-static-card">',
    '          <p class="app-static-eyebrow">Thue++ Challenge Solutions</p>',
    `          <h1>${escapeHtml(challenge.title)} Solutions</h1>`,
    `          <p>Loading ${escapeHtml(String(challenge.solutions.length))} ranked solution${challenge.solutions.length === 1 ? '' : 's'}…</p>`,
    '        </section>',
    '      </main>',
  ].join('\n')
}

function challengeSolutionShell(challenge, solution) {
  return [
    `      <main class="app-static-shell challenge-static-shell" data-test="challenge-solution-static-${escapeAttribute(solution.id)}">`,
    '        <section class="app-static-card">',
    '          <p class="app-static-eyebrow">Thue++ Challenge Solution</p>',
    `          <h1>${escapeHtml(solution.title)}</h1>`,
    `          <p>Loading ${escapeHtml(challenge.title)} solution by ${escapeHtml(solution.author)}…</p>`,
    '        </section>',
    '      </main>',
  ].join('\n')
}

function injectAppShell(html, shell) {
  return html.replace('<div id="app"></div>', `<div id="app">\n${shell}\n    </div>`)
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

function sitemapXml(routes) {
  const urls = [
    { loc: `${siteOrigin}/`, priority: '1.0' },
    ...routes.map(route => ({ loc: route.metadata.canonical, priority: route.path.startsWith('challenges') ? '0.7' : '0.8' })),
  ]
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls.map(url => `  <url>\n    <loc>${escapeHtml(url.loc)}</loc>\n    <priority>${url.priority}</priority>\n  </url>`),
    '</urlset>',
    '',
  ].join('\n')
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

function titleFromSlug(slug) {
  return slug.replace(/^\d{2}_/, '').split('-').filter(Boolean).map(word => `${word[0].toUpperCase()}${word.slice(1)}`).join(' ')
}

function escapeHtml(value) {
  return String(value)
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
