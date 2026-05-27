import { copyFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('../dist/', import.meta.url).pathname
const staticRoutes = ['playground', 'embed', 'embed/demo']

for (const route of staticRoutes) {
  const routeDir = join(dist, route)
  mkdirSync(routeDir, { recursive: true })
  copyFileSync(join(dist, 'index.html'), join(routeDir, 'index.html'))
}

// Keep a custom fallback for unknown direct SPA links. The explicit route
// copies above make known routes return HTTP 200 instead of GitLab Pages'
// custom-404 status.
copyFileSync(join(dist, 'index.html'), join(dist, '404.html'))

console.log(`demo production dist static routes ok: ${staticRoutes.join(', ')}`)
