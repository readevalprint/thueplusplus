import { execFileSync } from 'node:child_process'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { decodePng, manifestJson, rasterize } from './generate-brand-assets.mjs'
import {
  MARK,
  compileMarks,
  faviconSvg,
  hat,
  markModel,
  paint,
  viewBoxFor,
} from '../src/rex/geometry.mjs'

const demo = fileURLToPath(new URL('../', import.meta.url))
const root = fileURLToPath(new URL('../../', import.meta.url))

function read(path) {
  return readFileSync(join(root, path), 'utf8')
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function header() {
  const source = read('demo/src/components/Mark.vue')
  assert(source.includes("markModel('header')"), 'header mark does not use the shared model')
  assert(source.includes('currentColor'), 'header marks are not currentColor')
  assert(source.includes('var(--signal)'), 'header hat is not the signal token')
  assert(!source.includes('++</span>') && !source.includes('>++<'), 'header still draws the ++ mark')
  const model = markModel('header')
  const eyes = model.parts.filter(part => part.role === 'eye')
  const dots = model.parts.filter(part => part.role === 'dot')
  const crowns = model.parts.filter(part => part.role === 'hat' && part.kind === 'path')
  assert(eyes.length === 2, `header eyes ${eyes.length}`)
  assert(dots.length === 4, `header dots ${dots.length}`)
  assert(crowns.length === 1 && crowns[0].d === hat.crown, 'header crown is not the shared path')
  assert(model.parts.some(part => part.role === 'band'), 'header is missing the hard-hat band')
  console.log('header-rex: six-marks hard-hat currentColor signal')
}

function crisp() {
  const source = read('demo/src/components/Mark.vue')
  assert(source.includes('<svg'), 'header mark is not an inline svg')
  assert(source.includes('h-10'), 'header mark has no fixed height')
  assert(!source.includes('<img') && !source.includes('.png'), 'header mark is a bitmap')
  console.log('header-crisp: inline-svg')
}

function blink() {
  const source = read('demo/src/components/Mark.vue')
  const allow = source.indexOf('@media (prefers-reduced-motion: no-preference)')
  const reduce = source.indexOf('@media (prefers-reduced-motion: reduce)')
  const animation = source.indexOf('animation: rex-blink 230ms linear')
  assert(allow >= 0 && reduce > allow && animation > allow && animation < reduce, 'blink animation is not limited to reduced-motion no-preference')
  const reduceBlock = source.slice(reduce, source.indexOf('@keyframes'))
  assert(reduceBlock.includes('animation: none'), 'reduced motion does not disable the blink')
  assert(source.includes('scaleY(0.14)'), 'blink does not use the shared shut scale')
  console.log('blink: reduced-motion')
}

function faviconFile() {
  const svg = read('demo/public/favicon.svg')
  assert(svg === faviconSvg(), 'favicon.svg drifted from the shared geometry')
  assert(svg.includes('color-scheme: light dark'), 'favicon.svg does not opt into both schemes')
  assert(svg.includes('@media (prefers-color-scheme: dark)'), 'favicon.svg has no dark scheme')
  assert(svg.includes(paint.iconInkLight.hex) && svg.includes(paint.iconInkDark.hex), 'favicon.svg misses a scheme ink')
  assert(svg.includes(paint.hat.hex), 'favicon.svg misses the hat color')
  assert(svg.includes(hat.crown), 'favicon.svg misses the shared crown')
  assert(!svg.includes(hat.shine), 'small favicon still draws the shine stroke')
  console.log('favicon-svg: scheme-adaptive shared-geometry')
}

function pngSize(path) {
  const decoded = decodePng(readFileSync(join(root, path)))
  return decoded
}

function icons() {
  const favicon = pngSize('demo/public/favicon.png')
  const icon192 = pngSize('demo/public/icon-192.png')
  const icon512 = pngSize('demo/public/icon-512.png')
  const apple = pngSize('demo/public/apple-touch-icon.png')
  assert(favicon.width === 32 && favicon.height === 32, `favicon.png is ${favicon.width}x${favicon.height}`)
  assert(icon192.width === 192 && icon192.height === 192, `icon-192 is ${icon192.width}`)
  assert(icon512.width === 512 && icon512.height === 512, `icon-512 is ${icon512.width}`)
  assert(apple.width === 180 && apple.height === 180, `apple touch is ${apple.width}`)
  for (const [name, image] of [['favicon', favicon], ['192', icon192], ['512', icon512], ['apple', apple]]) {
    assert(countOrange(image) > 20, `${name} has no hard hat`)
  }
  const manifest = read('demo/public/site.webmanifest')
  assert(manifest === manifestJson(), 'site.webmanifest drifted from the generator')
  assert(manifest.includes('/favicon.svg') && manifest.includes('/icon-192.png') && manifest.includes('/icon-512.png'), 'manifest is missing rex icons')
  assert(readBars(favicon, 'dark').length === 2, 'favicon.png does not read as two eye bars')
  console.log('icons: png-32 png-192 png-512 apple-180 manifest')
}

function small() {
  for (const size of [16, 32]) {
    for (const scheme of ['light', 'dark']) {
      const image = decodePng(rasterize({
        width: size,
        height: size,
        viewBox: viewBoxFor('icon'),
        shapes: compileMarks('icon'),
        scheme,
        ink: 'contrast',
        background: null,
        samples: 8,
      }))
      const bars = readBars(image, scheme)
      assert(bars.length === 2, `${size}px ${scheme} eye bars: ${bars.length}`)
      for (const bar of bars) assert(bar.tall, `${size}px ${scheme} eye bar is not vertical`)
      const orange = countOrange(image)
      const ink = countInk(image, scheme)
      assert(orange > 8, `${size}px ${scheme} has no hat`)
      assert(ink > orange, `${size}px ${scheme} hat is larger than the body`)
      assert(ink > size * size * 0.18, `${size}px ${scheme} body does not fill the icon`)
      assert(hatAboveEyes(image, scheme), `${size}px ${scheme} hat is not above the eyes`)
    }
  }
  console.log('small-rex: 16-hat-eyes 32-hat-eyes')
}

function source() {
  const crown = hat.crown
  const skip = new Set(['node_modules', 'dist', '.git', 'build', '.wasm-public', '.cache', 'target'])
  const text = new Set(['.vue', '.mjs', '.js', '.ts', '.svg', '.html', '.css', '.md', '.json'])
  /** @type {string[]} */
  const hits = []
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      if (skip.has(name)) continue
      const path = join(dir, name)
      const info = statSync(path)
      if (info.isDirectory()) {
        walk(path)
        continue
      }
      if (!text.has(extname(name))) continue
      if (readFileSync(path, 'utf8').includes(crown)) hits.push(relative(root, path))
    }
  }
  walk(root)
  hits.sort()
  const allowed = [
    'demo/public/brand/thue-mark.svg',
    'demo/public/favicon.svg',
    'demo/src/rex/geometry.mjs',
  ]
  assert(JSON.stringify(hits) === JSON.stringify(allowed), `crown path lives in ${hits.join(', ')}`)
  const figure = read('demo/src/components/RexFigure.vue')
  assert(figure.includes('hat.crown'), 'RexFigure does not use the shared crown')
  assert(figure.includes('MARK.eyeW') && figure.includes('MARK.dotR'), 'RexFigure still inlines mark sizes')
  console.log('single-source: geometry.mjs')
}

function pose() {
  const motion = read('demo/src/rex/motion.ts')
  const value = (name) => {
    const match = motion.match(new RegExp(`export const ${name} = (-?\\d+(?:\\.\\d+)?)`))
    if (!match) throw new Error(`motion.ts is missing export const ${name}`)
    return Number(match[1])
  }
  assert(MARK.dotR === value('DOT_R'), 'dot radius drifted')
  assert(MARK.eyeW === value('EYE_W'), 'eye width drifted')
  assert(MARK.eyeH === value('EYE_H'), 'eye height drifted')
  assert(MARK.eyeDx === value('EYE_DX'), 'eye dx drifted')
  assert(MARK.eyeDy === value('EYE_DY'), 'eye dy drifted')
  assert(MARK.handDx === value('HAND_DX'), 'hand dx drifted')
  assert(MARK.handDy === value('HAND_DY'), 'hand dy drifted')
  assert(MARK.footDx === value('FOOT_DX'), 'foot dx drifted')
  const css = read('demo/src/style.css')
  const dark = css.match(/:root,\s*\.dark\s*\{[^}]+\}/)
  const light = css.match(/html:not\(\.dark\)\s*\{[^}]+\}/)
  if (!dark || !light) throw new Error('theme blocks missing')
  const token = (block, name) => {
    const match = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`))
    if (!match) throw new Error(`missing --${name}`)
    return match[1].toLowerCase()
  }
  assert(token(dark[0], 'bone') === paint.boneDark.hex, 'dark bone drifted')
  assert(token(light[0], 'bone') === paint.boneLight.hex, 'light bone drifted')
  assert(token(dark[0], 'signal') === paint.hat.hex, 'dark signal drifted')
  assert(token(light[0], 'signal') === paint.hat.hex, 'light signal drifted')
  assert(token(dark[0], 'void') === paint.void.hex, 'void drifted')
  console.log('pose: matches-motion')
}

function html() {
  const index = read('demo/index.html')
  assert(index.includes('<link rel="icon" type="image/svg+xml" href="/favicon.svg" sizes="any" />'), 'missing svg icon link')
  assert(index.includes('<link rel="icon" type="image/png" href="/favicon.png" sizes="32x32" />'), 'missing png fallback')
  assert(index.includes('<link rel="apple-touch-icon" href="/apple-touch-icon.png" />'), 'missing apple touch icon')
  assert(index.includes('<link rel="manifest" href="/site.webmanifest" />'), 'missing manifest link')
  console.log('index: svg-icon png-fallback apple-touch manifest')
}

function og() {
  const image = pngSize('demo/public/og-image.png')
  assert(image.width === 1200 && image.height === 630, `og-image is ${image.width}x${image.height}`)
  let green = 0
  const { pixels, width, height } = image
  for (let i = 0; i < width * height; i += 1) {
    const r = pixels[i * 4]
    const g = pixels[i * 4 + 1]
    const b = pixels[i * 4 + 2]
    if (g > 150 && g > r + 40 && g > b + 40) green += 1
  }
  assert(green === 0, `og-image still has ${green} green frame pixels`)
  assert(countOrange(image) > 500, 'og-image has no rex hat')
  console.log('og: rex-not-assign')
}

function scope() {
  const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
  assert(dirty === '', `worktree is dirty:\n${dirty}`)
  const names = execFileSync('git', ['diff', '--name-only', 'origin/main...HEAD'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
  const allowed = new Set([
    'CHANGELOG.md',
    'demo/index.html',
    'demo/package.json',
    'demo/public/apple-touch-icon.png',
    'demo/public/brand/thue-mark.svg',
    'demo/public/favicon.png',
    'demo/public/favicon.svg',
    'demo/public/icon-192.png',
    'demo/public/icon-512.png',
    'demo/public/og-image.png',
    'demo/public/site.webmanifest',
    'demo/scripts/check-dist.mjs',
    'demo/scripts/check-rex-brand.mjs',
    'demo/scripts/generate-brand-assets.mjs',
    'demo/src/components/Mark.vue',
    'demo/src/components/RexFigure.vue',
    'demo/src/rex/geometry.mjs',
    'demo/src/rex/geometry.test.ts',
  ])
  const extra = names.filter(name => !allowed.has(name))
  assert(extra.length === 0, `diff leaves the header and favicon scope: ${extra.join(', ')}`)
  assert(names.includes('demo/src/components/Mark.vue'), 'diff is missing the header mark')
  assert(names.includes('demo/public/favicon.svg'), 'diff is missing the svg favicon')
  console.log('scope: header-favicon')
}

function changelog() {
  const text = read('CHANGELOG.md')
  const unreleased = text.split(/^## \[/m)[1] ?? ''
  assert(unreleased.startsWith('Unreleased'), 'changelog has no Unreleased section')
  assert(/favicon/i.test(unreleased) && /Rex/.test(unreleased), 'changelog Unreleased section does not record Rex as the favicon')
  console.log('changelog: rex-favicon')
}

function shots() {
  const files = [
    ['light-tab', '/opt/cursor/artifacts/favicon-tab-light.png'],
    ['dark-tab', '/opt/cursor/artifacts/favicon-tab-dark.png'],
    ['light-header', '/opt/cursor/artifacts/header-light.png'],
    ['dark-header', '/opt/cursor/artifacts/header-dark.png'],
  ]
  for (const [name, path] of files) {
    const info = statSync(path)
    assert(info.isFile() && info.size > 2000, `${name} screenshot missing at ${path}`)
  }
  console.log('shots: light-tab dark-tab light-header dark-header')
}

function pr() {
  const raw = execFileSync('gh', ['pr', 'view', '--json', 'body,mergeable,url'], { cwd: root, encoding: 'utf8' })
  const view = JSON.parse(raw)
  assert(/closes\s+#96/i.test(view.body), 'PR body does not close #96')
  assert(view.mergeable === 'MERGEABLE', `PR is ${view.mergeable}`)
  assert(view.body.includes('favicon-tab-light') && view.body.includes('header-dark'), 'PR body is missing the screenshots')
  console.log('pr: closes-96 mergeable')
}

function ci() {
  const raw = execFileSync('gh', ['pr', 'checks', '--json', 'name,state,bucket'], { cwd: root, encoding: 'utf8' })
  const checks = JSON.parse(raw)
  assert(Array.isArray(checks) && checks.length > 0, 'PR has no checks')
  const pending = []
  const failed = []
  for (const check of checks) {
    if (/vercel/i.test(check.name)) continue
    if (check.bucket === 'skipping' || check.state === 'SKIPPED') continue
    if (check.bucket === 'pending' || check.state === 'PENDING' || check.state === 'QUEUED' || check.state === 'IN_PROGRESS') pending.push(check.name)
    else if (check.bucket !== 'pass' && check.state !== 'SUCCESS') failed.push(`${check.name}=${check.state}`)
  }
  assert(pending.length === 0, `CI still running: ${pending.join(', ')}`)
  assert(failed.length === 0, `CI failed: ${failed.join(', ')}`)
  const metrics = checks.find(check => /metric/i.test(check.name) || check.name === 'record')
  assert(metrics && (metrics.bucket === 'pass' || metrics.state === 'SUCCESS'), 'metrics job is not green')
  console.log('ci: green')
}

function merged() {
  const raw = execFileSync('gh', ['pr', 'view', '--json', 'state,mergedAt'], { cwd: root, encoding: 'utf8' })
  const view = JSON.parse(raw)
  assert(view.state === 'MERGED', `PR state is ${view.state}`)
  console.log('merged: yes')
}

/** @param {{ width: number, height: number, pixels: Buffer }} image */
function countOrange(image) {
  let count = 0
  for (let i = 0; i < image.width * image.height; i += 1) {
    const offset = i * 4
    const r = image.pixels[offset]
    const g = image.pixels[offset + 1]
    const b = image.pixels[offset + 2]
    const a = image.pixels[offset + 3]
    if (a > 180 && r > 200 && g > 40 && g < 140 && b < 90) count += 1
  }
  return count
}

/**
 * @param {{ width: number, height: number, pixels: Buffer }} image
 * @param {'light' | 'dark'} scheme
 */
function iconInk(scheme) {
  return scheme === 'dark' ? paint.iconInkDark.rgba : paint.iconInkLight.rgba
}

function countInk(image, scheme) {
  const ink = iconInk(scheme)
  let count = 0
  for (let i = 0; i < image.width * image.height; i += 1) {
    const offset = i * 4
    if (image.pixels[offset + 3] < 180) continue
    if (near(image.pixels, offset, ink, 36)) count += 1
  }
  return count
}

function readBars(image, scheme) {
  const ink = iconInk(scheme)
  const minRun = Math.ceil(image.height * 0.22)
  const columns = new Array(image.width).fill(0)
  for (let x = 0; x < image.width; x += 1) {
    let run = 0
    let best = 0
    for (let y = 0; y < image.height; y += 1) {
      const offset = (y * image.width + x) * 4
      const on = image.pixels[offset + 3] >= 140 && near(image.pixels, offset, ink, 48)
      if (on) {
        run += 1
        if (run > best) best = run
      } else {
        run = 0
      }
    }
    columns[x] = best
  }
  /** @type {{ x0: number, x1: number, tall: boolean }[]} */
  const bars = []
  let start = -1
  for (let x = 0; x <= columns.length; x += 1) {
    const on = x < columns.length && columns[x] >= minRun
    if (on && start < 0) start = x
    if (!on && start >= 0) {
      const width = x - start
      let height = 0
      for (let column = start; column < x; column += 1) height = Math.max(height, columns[column])
      bars.push({ x0: start, x1: x - 1, tall: height > width })
      start = -1
    }
  }
  return bars
}

/**
 * @param {{ width: number, height: number, pixels: Buffer }} image
 * @param {'light' | 'dark'} scheme
 */
function hatAboveEyes(image, scheme) {
  const ink = iconInk(scheme)
  let hatY = 0
  let hatN = 0
  let eyeY = 0
  let eyeN = 0
  for (let y = 0; y < image.height; y += 1) {
    for (let x = 0; x < image.width; x += 1) {
      const offset = (y * image.width + x) * 4
      if (image.pixels[offset + 3] < 180) continue
      const r = image.pixels[offset]
      const g = image.pixels[offset + 1]
      const b = image.pixels[offset + 2]
      if (r > 200 && g > 40 && g < 140 && b < 90) {
        hatY += y
        hatN += 1
      } else if (near(image.pixels, offset, ink, 36)) {
        eyeY += y
        eyeN += 1
      }
    }
  }
  return hatN > 0 && eyeN > 0 && hatY / hatN < eyeY / eyeN
}

/** @param {Buffer} pixels @param {number} offset @param {number[]} target @param {number} tol */
function near(pixels, offset, target, tol) {
  return Math.abs(pixels[offset] - target[0]) <= tol
    && Math.abs(pixels[offset + 1] - target[1]) <= tol
    && Math.abs(pixels[offset + 2] - target[2]) <= tol
}

const checks = {
  header,
  crisp,
  blink,
  'favicon-svg': faviconFile,
  icons,
  small,
  source,
  pose,
  html,
  og,
  scope,
  changelog,
  shots,
  pr,
  ci,
  merged,
}

const local = ['header', 'crisp', 'blink', 'favicon-svg', 'icons', 'small', 'source', 'pose', 'html', 'og', 'changelog']

const mode = process.argv[2] ?? 'local'
if (mode === 'local') {
  for (const name of local) checks[name]()
} else if (checks[mode]) {
  checks[mode]()
} else {
  throw new Error(`unknown check ${mode}`)
}
