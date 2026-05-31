// SPDX-License-Identifier: AGPL-3.0-or-later
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('../dist/', import.meta.url).pathname
const requiredAssets = ['thuepp.wasm', 'wasm_exec.js', 'robots.txt', 'sitemap.xml', 'og-image.png', 'favicon.png', 'icon-192.png', 'icon-512.png', 'brand/thuepp-mark.svg']
const staticRoutes = ['playground', 'embed', 'embed/demo']

for (const asset of requiredAssets) {
  const path = join(dist, asset)
  const stat = statSync(path)
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`demo production build is missing non-empty ${asset}`)
  }
}

const index = readFileSync(join(dist, 'index.html'), 'utf8')
const fallback = readFileSync(join(dist, '404.html'), 'utf8')
if (fallback !== index) {
  throw new Error('demo production dist 404.html must match index.html for unknown direct SPA route fallback on GitLab Pages')
}
for (const route of staticRoutes) {
  const routePath = join(dist, route, 'index.html')
  if (!existsSync(routePath)) {
    throw new Error(`demo production dist is missing ${route}/index.html for direct route loads on GitLab Pages`)
  }
  const routeIndex = readFileSync(routePath, 'utf8')
  if (!routeIndex.includes('src="/assets/') || !routeIndex.includes('href="/assets/')) {
    throw new Error(`demo production dist ${route}/index.html must use origin-root asset URLs so nested static routes load assets from the site root`)
  }
}
if (!index.includes('src="/assets/') || !index.includes('href="/assets/')) {
  throw new Error('demo production index must use origin-root asset URLs so nested static routes load assets from the site root')
}
if (!index.includes('semi-Thue system') || !index.includes('Hello world') || !index.includes('data-prerendered="true"')) {
  throw new Error('demo production index must include prerendered README content for crawlers')
}
if (!index.includes('<nav class="readme-toc"') || index.indexOf('<nav class="readme-toc"') > index.indexOf('<article class="readme-document"')) {
  throw new Error('demo production index must prerender the README TOC before the article to avoid docs layout shift')
}
if (index.includes('modulepreload" crossorigin href="/assets/editor-monaco-')) {
  throw new Error('demo production index must not eagerly modulepreload the Monaco editor chunk')
}
const playgroundIndex = readFileSync(join(dist, 'playground', 'index.html'), 'utf8')
if (!playgroundIndex.includes('Thue++ Playground') || !playgroundIndex.includes('https://thuelang.org/playground')) {
  throw new Error('playground route index must include route-specific SEO metadata')
}
const embedIndex = readFileSync(join(dist, 'embed', 'index.html'), 'utf8')
if (!embedIndex.includes('noindex,follow')) {
  throw new Error('embed route index must be noindexed')
}

const jsFiles = readdirSync(join(dist, 'assets')).filter(name => name.endsWith('.js'))
for (const fileName of jsFiles) {
  const text = readFileSync(join(dist, 'assets', fileName), 'utf8')
  if (!text.includes('/thuepp.wasm') && !text.includes('/wasm_exec.js')) {
    continue
  }
  if (text.includes('new Worker("data:text/javascript') || text.includes("new Worker('data:text/javascript")) {
    throw new Error(`${fileName} inlines the browser worker as a data: URL`)
  }
}

console.log('demo production dist smoke ok')
