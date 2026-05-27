import { copyFileSync } from 'node:fs'
import { join } from 'node:path'

const dist = new URL('../dist/', import.meta.url).pathname

// GitLab Pages does not rewrite arbitrary SPA paths like /playground to
// index.html. A custom 404.html lets direct route loads render the Vue app
// instead of GitLab's default 404 page.
copyFileSync(join(dist, 'index.html'), join(dist, '404.html'))

console.log('demo production dist SPA fallback ok')
