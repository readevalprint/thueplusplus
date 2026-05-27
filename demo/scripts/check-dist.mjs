import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('../dist/', import.meta.url).pathname
const requiredAssets = ['thuepp.wasm', 'wasm_exec.js']
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
  const routeIndex = readFileSync(join(dist, route, 'index.html'), 'utf8')
  if (routeIndex !== index) {
    throw new Error(`demo production dist ${route}/index.html must match index.html for direct route loads on GitLab Pages`)
  }
}
if (!index.includes('src="/assets/') || !index.includes('href="/assets/')) {
  throw new Error('demo production index must use origin-root asset URLs so nested static routes load assets from the site root')
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
