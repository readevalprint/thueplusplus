// SPDX-License-Identifier: AGPL-3.0-or-later
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('../dist/', import.meta.url).pathname
const repoRoot = new URL('../../', import.meta.url).pathname
const requiredAssets = ['thuepp.wasm', 'wasm_exec.js', 'robots.txt', 'sitemap.xml', 'deploy.json', 'og-image.png', 'favicon.png', 'icon-192.png', 'icon-512.png', 'brand/thuepp-mark.svg']
const staticRoutes = ['playground', 'embed', 'embed/demo']
const challengeSlugs = readdirSync(join(repoRoot, 'challenges'))
  .filter(name => /^\d{2}_[a-z0-9][a-z0-9-]*$/.test(name) && existsSync(join(repoRoot, 'challenges', name, 'readme.md')))
  .sort()
const solutionIdsByChallenge = Object.fromEntries(challengeSlugs.map(slug => [slug, solutionIdsForChallenge(slug)]))
const generatedRoutes = [
  ...staticRoutes,
  'challenges',
  ...challengeSlugs.flatMap(slug => [
    `challenges/${slug}`,
    `challenges/${slug}/solutions`,
    ...solutionIdsByChallenge[slug].map(solutionId => `challenges/${slug}/solutions/${solutionId}`),
  ]),
]

for (const asset of requiredAssets) {
  const path = join(dist, asset)
  const stat = statSync(path)
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`demo production build is missing non-empty ${asset}`)
  }
}

const index = readFileSync(join(dist, 'index.html'), 'utf8')
const fallback = readFileSync(join(dist, '404.html'), 'utf8')
assertRootAssetUrls(index, 'index.html')
assertNoReadmePrerender(fallback, '404.html')
assertRootAssetUrls(fallback, '404.html')
if (!fallback.includes('data-test="app-fallback-shell"')) {
  throw new Error('demo production dist 404.html must include a neutral app fallback shell')
}
for (const route of generatedRoutes) {
  const routePath = join(dist, route, 'index.html')
  if (!existsSync(routePath)) {
    throw new Error(`demo production dist is missing ${route}/index.html for direct route loads on GitLab Pages`)
  }
  const routeIndex = readFileSync(routePath, 'utf8')
  assertRootAssetUrls(routeIndex, `${route}/index.html`)
  if (route.startsWith('challenges')) {
    assertNoReadmePrerender(routeIndex, `${route}/index.html`)
  }
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
const sitemap = readFileSync(join(dist, 'sitemap.xml'), 'utf8')
for (const loc of ['https://thuelang.org/', ...generatedRoutes.map(routeCanonicalUrl)]) {
  if (!sitemap.includes(`<loc>${loc}</loc>`)) {
    throw new Error(`sitemap.xml is missing canonical route ${loc}`)
  }
}
for (const slug of challengeSlugs) {
  const challengeIndex = readFileSync(join(dist, 'challenges', slug, 'index.html'), 'utf8')
  const title = titleFromChallengeReadme(slug)
  if (!challengeIndex.includes(`<title>${escapeHtml(title)} — Thue++ Challenge</title>`)) {
    throw new Error(`challenge route ${slug}/index.html must include challenge-specific title metadata`)
  }
  if (!challengeIndex.includes(`https://thuelang.org/challenges/${slug}/`)) {
    throw new Error(`challenge route ${slug}/index.html must include canonical challenge URL`)
  }
}

const deploy = JSON.parse(readFileSync(join(dist, 'deploy.json'), 'utf8'))
if (!/^[0-9a-f]{40}$/.test(deploy.commit_sha)) {
  throw new Error('deploy.json must include a 40-character commit_sha')
}
const expectedCommitSha = env('CI_COMMIT_SHA') ?? git(['rev-parse', 'HEAD'])
if (expectedCommitSha && deploy.commit_sha !== expectedCommitSha) {
  throw new Error(`deploy.json commit_sha ${deploy.commit_sha} does not match current build commit ${expectedCommitSha}`)
}
if (typeof deploy.branch !== 'string' || deploy.branch.length === 0) {
  throw new Error('deploy.json must include a non-empty branch')
}
const expectedBranch = env('CI_COMMIT_BRANCH') ?? git(['branch', '--show-current'])
if (expectedBranch && deploy.branch !== expectedBranch) {
  throw new Error(`deploy.json branch ${deploy.branch} does not match current build branch ${expectedBranch}`)
}
if (Number.isNaN(Date.parse(deploy.built_at))) {
  throw new Error('deploy.json must include a parseable built_at timestamp')
}
if (typeof deploy.source_host !== 'string' || deploy.source_host.length === 0) {
  throw new Error('deploy.json must include a non-empty source_host')
}
if (deploy.source_host === 'gitlab.com') {
  for (const requiredGitlabField of ['pipeline_id', 'pipeline_url', 'job_id', 'job_url', 'project_path']) {
    if (typeof deploy[requiredGitlabField] !== 'string' || deploy[requiredGitlabField].length === 0) {
      throw new Error(`deploy.json must include ${requiredGitlabField} in GitLab.com Pages builds`)
    }
  }
}
for (const optionalUrlField of ['pipeline_url', 'job_url']) {
  if (deploy[optionalUrlField] !== null && !/^https?:\/\//.test(deploy[optionalUrlField])) {
    throw new Error(`deploy.json ${optionalUrlField} must be null or an HTTP(S) URL`)
  }
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

function assertRootAssetUrls(html, label) {
  if (!html.includes('src="/assets/') || !html.includes('href="/assets/')) {
    throw new Error(`demo production dist ${label} must use origin-root asset URLs so nested static routes load assets from the site root`)
  }
}

function assertNoReadmePrerender(html, label) {
  for (const forbidden of ['data-prerendered="true"', 'prerendered-readme', 'data-test="readme-index"', 'semi-Thue system', 'Hello world']) {
    if (html.includes(forbidden)) {
      throw new Error(`demo production dist ${label} must not include root README prerender marker ${forbidden}`)
    }
  }
}

function titleFromChallengeReadme(slug) {
  const readme = readFileSync(join(repoRoot, 'challenges', slug, 'readme.md'), 'utf8')
  const match = readme.match(/^---\n([\s\S]*?)\n---\n/)
  if (!match) return titleFromSlug(slug)
  const titleLine = match[1].split('\n').find(line => line.startsWith('title:'))
  return titleLine ? titleLine.slice('title:'.length).trim() : titleFromSlug(slug)
}

function solutionIdsForChallenge(slug) {
  const solutionsDir = join(repoRoot, 'challenges', slug, 'solutions')
  if (!existsSync(solutionsDir)) return []
  return readdirSync(solutionsDir)
    .filter(name => name.endsWith('.json'))
    .map(name => {
      const record = JSON.parse(readFileSync(join(solutionsDir, name), 'utf8'))
      return record.solution_id || name.replace(/\.json$/, '')
    })
    .sort()
}

function routeCanonicalUrl(route) {
  if (route === 'playground' || route.startsWith('embed')) return `https://thuelang.org/${route}`
  if (route === 'challenges') return 'https://thuelang.org/challenges/'
  if (/^challenges\/[^/]+$/.test(route)) return `https://thuelang.org/${route}/`
  return `https://thuelang.org/${route}`
}

function titleFromSlug(slug) {
  return slug.replace(/^\d{2}_/, '').split('-').filter(Boolean).map(word => `${word[0].toUpperCase()}${word.slice(1)}`).join(' ')
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function env(name) {
  const value = process.env[name]
  return value && value.trim() ? value : null
}

function git(args) {
  try {
    const value = execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' }).trim()
    return value || null
  } catch {
    return null
  }
}
