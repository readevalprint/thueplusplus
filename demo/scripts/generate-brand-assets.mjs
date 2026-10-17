import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deflateSync, inflateSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'
import {
  cardViewBox,
  compileMarks,
  faviconSvg,
  hat,
  markModel,
  paint,
  viewBoxFor,
} from '../src/rex/geometry.mjs'

const publicDir = new URL('../public/', import.meta.url).pathname
const brandDir = join(publicDir, 'brand')

const crcTable = new Uint32Array(256)
for (let n = 0; n < 256; n += 1) {
  let c = n
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
  crcTable[n] = c >>> 0
}

function crc32(buffer) {
  let c = 0xffffffff
  for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type, 'ascii')
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))
  return Buffer.concat([length, typeBuffer, data, crc])
}

/** @param {number} width @param {number} height @param {(x: number, y: number) => number[]} draw */
export function encodePng(width, height, draw) {
  const bytesPerPixel = 4
  const stride = width * bytesPerPixel
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = draw(x, y)
      const offset = y * (stride + 1) + 1 + x * bytesPerPixel
      raw[offset] = r
      raw[offset + 1] = g
      raw[offset + 2] = b
      raw[offset + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/** @param {Buffer} buffer */
export function decodePng(buffer) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (!buffer.subarray(0, 8).equals(signature)) throw new Error('not a png')
  let offset = 8
  let width = 0
  let height = 0
  const idat = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii')
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    offset += 12 + length
    if (type === 'IHDR') {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      if (data[8] !== 8 || data[9] !== 6) throw new Error('png must be 8-bit rgba')
    } else if (type === 'IDAT') {
      idat.push(data)
    } else if (type === 'IEND') {
      break
    }
  }
  const inflated = inflateSync(Buffer.concat(idat))
  const stride = width * 4
  const pixels = Buffer.alloc(width * height * 4)
  let src = 0
  let prev = Buffer.alloc(stride)
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[src]
    src += 1
    const row = Buffer.from(inflated.subarray(src, src + stride))
    src += stride
    for (let i = 0; i < stride; i += 1) {
      const left = i >= 4 ? row[i - 4] : 0
      const up = prev[i]
      const upLeft = i >= 4 ? prev[i - 4] : 0
      if (filter === 0) {
        // none
      } else if (filter === 1) {
        row[i] = (row[i] + left) & 255
      } else if (filter === 2) {
        row[i] = (row[i] + up) & 255
      } else if (filter === 3) {
        row[i] = (row[i] + Math.floor((left + up) / 2)) & 255
      } else if (filter === 4) {
        row[i] = (row[i] + paeth(left, up, upLeft)) & 255
      } else {
        throw new Error(`unsupported png filter ${filter}`)
      }
    }
    row.copy(pixels, y * stride)
    prev = row
  }
  return { width, height, pixels }
}

/** @param {number} a @param {number} b @param {number} c */
function paeth(a, b, c) {
  const p = a + b - c
  const pa = Math.abs(p - a)
  const pb = Math.abs(p - b)
  const pc = Math.abs(p - c)
  if (pa <= pb && pa <= pc) return a
  if (pb <= pc) return b
  return c
}

/** @param {CompiledLike} shape */
function shapeBounds(shape) {
  if (shape.kind === 'poly' || shape.kind === 'stroke') {
    const pad = shape.kind === 'stroke' ? shape.radius : 0
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    for (const point of shape.points) {
      minX = Math.min(minX, point.x - pad)
      minY = Math.min(minY, point.y - pad)
      maxX = Math.max(maxX, point.x + pad)
      maxY = Math.max(maxY, point.y + pad)
    }
    return { minX, minY, maxX, maxY }
  }
  if (shape.kind === 'ellipse') return { minX: shape.cx - shape.rx, minY: shape.cy - shape.ry, maxX: shape.cx + shape.rx, maxY: shape.cy + shape.ry }
  if (shape.kind === 'circle') return { minX: shape.cx - shape.r, minY: shape.cy - shape.r, maxX: shape.cx + shape.r, maxY: shape.cy + shape.r }
  return { minX: shape.x, minY: shape.y, maxX: shape.x + shape.w, maxY: shape.y + shape.h }
}

/** @param {number} x @param {number} y @param {{x:number,y:number}[]} poly */
function insidePolygon(x, y, poly) {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i, i += 1) {
    const pi = poly[i]
    const pj = poly[j]
    if ((pi.y > y) !== (pj.y > y)) {
      const xCross = ((pj.x - pi.x) * (y - pi.y)) / (pj.y - pi.y) + pi.x
      if (x < xCross) inside = !inside
    }
  }
  return inside
}

/** @param {number} px @param {number} py @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
function distanceToSegment(px, py, a, b) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len2 = dx * dx + dy * dy
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a.x) * dx + (py - a.y) * dy) / len2))
  return Math.hypot(px - (a.x + t * dx), py - (a.y + t * dy))
}

/** @param {number} x @param {number} y @param {CompiledLike} shape */
function hits(x, y, shape) {
  if (shape.kind === 'poly') return insidePolygon(x, y, shape.points)
  if (shape.kind === 'stroke') {
    for (let i = 1; i < shape.points.length; i += 1) {
      if (distanceToSegment(x, y, shape.points[i - 1], shape.points[i]) <= shape.radius) return true
    }
    return false
  }
  if (shape.kind === 'ellipse') {
    return ((x - shape.cx) / shape.rx) ** 2 + ((y - shape.cy) / shape.ry) ** 2 <= 1
  }
  if (shape.kind === 'circle') return (x - shape.cx) ** 2 + (y - shape.cy) ** 2 <= shape.r ** 2
  const rx = Math.min(shape.rx, shape.w / 2, shape.h / 2)
  const left = shape.x + rx
  const right = shape.x + shape.w - rx
  const top = shape.y + rx
  const bottom = shape.y + shape.h - rx
  const px = Math.max(left, Math.min(right, x))
  const py = Math.max(top, Math.min(bottom, y))
  return (x - px) ** 2 + (y - py) ** 2 <= rx ** 2
}

/**
 * @param {number[]} dst
 * @param {number[]} src
 */
function over(dst, src) {
  const sa = src[3] / 255
  const da = dst[3] / 255
  const outA = sa + da * (1 - sa)
  if (outA === 0) return [0, 0, 0, 0]
  return [
    (src[0] * sa + dst[0] * da * (1 - sa)) / outA,
    (src[1] * sa + dst[1] * da * (1 - sa)) / outA,
    (src[2] * sa + dst[2] * da * (1 - sa)) / outA,
    outA * 255,
  ]
}

/**
 * @param {'light' | 'dark'} scheme
 * @param {string} role
 */
function colorFor(scheme, role) {
  if (role === 'hat') return paint.hat.rgba
  if (role === 'band') return paint.band.rgba
  if (role === 'shine') return [paint.shine.rgba[0], paint.shine.rgba[1], paint.shine.rgba[2], Math.round(255 * hat.shineOpacity)]
  if (role === 'stroke') return [paint.hatInk.rgba[0], paint.hatInk.rgba[1], paint.hatInk.rgba[2], Math.round(255 * hat.strokeOpacity)]
  if (role === 'eye' || role === 'dot') return scheme === 'dark' ? paint.boneDark.rgba : paint.boneLight.rgba
  throw new Error(`unknown rex paint role ${role}`)
}

/**
 * @param {{
 *   width: number,
 *   height: number,
 *   viewBox: { x: number, y: number, w: number, h: number },
 *   shapes: CompiledLike[],
 *   scheme: 'light' | 'dark',
 *   background: number[] | null,
 *   samples: number,
 * }} spec
 */
export function rasterize(spec) {
  const shapes = spec.shapes.map(shape => ({ shape, bounds: shapeBounds(shape), color: colorFor(spec.scheme, shape.role) }))
  const samples = spec.samples
  return encodePng(spec.width, spec.height, (x, y) => {
    /** @type {number[]} */
    let acc = [0, 0, 0, 0]
    const n2 = samples * samples
    for (let sy = 0; sy < samples; sy += 1) {
      for (let sx = 0; sx < samples; sx += 1) {
        const px = x + (sx + 0.5) / samples
        const py = y + (sy + 0.5) / samples
        const wx = spec.viewBox.x + (px / spec.width) * spec.viewBox.w
        const wy = spec.viewBox.y + (py / spec.height) * spec.viewBox.h
        /** @type {number[]} */
        let color = spec.background ? spec.background : [0, 0, 0, 0]
        for (const item of shapes) {
          const box = item.bounds
          if (wx < box.minX || wx > box.maxX || wy < box.minY || wy > box.maxY) continue
          if (!hits(wx, wy, item.shape)) continue
          color = over(color, item.color)
        }
        acc = [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2], acc[3] + color[3]]
      }
    }
    return acc.map(channel => Math.max(0, Math.min(255, Math.round(channel / n2))))
  })
}

/** @param {number} size */
function samplesFor(size) {
  if (size <= 32) return 8
  if (size <= 192) return 4
  return 3
}

export function manifestJson() {
  return `${JSON.stringify({
    name: 'Thue++',
    short_name: 'Thue++',
    description: 'Deterministic string-rewrite programming language and browser playground.',
    start_url: '/',
    display: 'standalone',
    background_color: paint.void.hex,
    theme_color: paint.void.hex,
    icons: [
      { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  }, null, 2)}\n`
}

/** Open-graph card. Same full-figure geometry the PNG rasterizes. */
export function cardSvg() {
  const box = cardViewBox(1200, 630)
  const model = markModel('full')
  const ink = paint.boneDark.hex
  const hatMarkup = model.parts.filter(part => part.space === 'hat').map(part => drawPart(part, ink)).join('\n    ')
  const markMarkup = model.parts.filter(part => part.space === 'world').map(part => drawPart(part, ink)).join('\n    ')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.x} ${box.y} ${box.w} ${box.h}" role="img">
  <title>Thue++ Rex</title>
  <desc>Rex, the Thue++ mascot, centered on a dark card.</desc>
  <rect x="${box.x}" y="${box.y}" width="${box.w}" height="${box.h}" fill="${paint.void.hex}"/>
  <g transform="translate(${model.hatAt.x} ${model.hatAt.y})">
    ${hatMarkup}
  </g>
  <g>
    ${markMarkup}
  </g>
</svg>
`
}

/** @param {import('../src/rex/geometry.mjs').MarkPart} part */
function drawPart(part, ink) {
  if (part.kind === 'path' && part.role === 'hat') return `<path d="${part.d}" fill="${paint.hat.hex}"/>`
  if (part.kind === 'path' && part.role === 'stroke') {
    return `<path d="${part.d}" fill="none" stroke="${paint.hatInk.hex}" stroke-width="${hat.strokeWidth}" opacity="${hat.strokeOpacity}"/>`
  }
  if (part.kind === 'path' && part.role === 'shine') {
    return `<path d="${part.d}" fill="none" stroke="${paint.shine.hex}" stroke-width="${hat.shineWidth}" stroke-linecap="round" opacity="${hat.shineOpacity}"/>`
  }
  if (part.kind === 'ellipse') return `<ellipse cx="${part.cx}" cy="${part.cy}" rx="${part.rx}" ry="${part.ry}" fill="${paint.hat.hex}"/>`
  if (part.kind === 'rect' && part.role === 'band') {
    return `<rect x="${part.x}" y="${part.y}" width="${part.w}" height="${part.h}" rx="${part.rx}" fill="${paint.band.hex}"/>`
  }
  if (part.kind === 'rect') return `<rect x="${part.x}" y="${part.y}" width="${part.w}" height="${part.h}" rx="${part.rx}" fill="${ink}"/>`
  if (part.kind === 'circle') return `<circle cx="${part.cx}" cy="${part.cy}" r="${part.r}" fill="${ink}"/>`
  throw new Error(`cannot draw ${part.kind} ${part.role}`)
}

function writeAll() {
  mkdirSync(brandDir, { recursive: true })
  const icon = compileMarks('icon')
  const iconBox = viewBoxFor('icon')
  const full = compileMarks('full')
  const square = viewBoxFor('full')
  const side = Math.max(square.w, square.h)
  const squareBox = {
    x: square.x + square.w / 2 - side / 2,
    y: square.y + square.h / 2 - side / 2,
    w: side,
    h: side,
  }
  writeFileSync(join(publicDir, 'favicon.svg'), faviconSvg())
  writeFileSync(join(publicDir, 'favicon.png'), rasterize({
    width: 32,
    height: 32,
    viewBox: iconBox,
    shapes: icon,
    scheme: 'dark',
    background: paint.void.rgba,
    samples: samplesFor(32),
  }))
  writeFileSync(join(publicDir, 'icon-192.png'), rasterize({
    width: 192,
    height: 192,
    viewBox: squareBox,
    shapes: full,
    scheme: 'dark',
    background: paint.void.rgba,
    samples: samplesFor(192),
  }))
  writeFileSync(join(publicDir, 'icon-512.png'), rasterize({
    width: 512,
    height: 512,
    viewBox: squareBox,
    shapes: full,
    scheme: 'dark',
    background: paint.void.rgba,
    samples: samplesFor(512),
  }))
  writeFileSync(join(publicDir, 'apple-touch-icon.png'), rasterize({
    width: 180,
    height: 180,
    viewBox: squareBox,
    shapes: full,
    scheme: 'dark',
    background: paint.void.rgba,
    samples: samplesFor(180),
  }))
  const card = cardViewBox(1200, 630)
  writeFileSync(join(publicDir, 'og-image.png'), rasterize({
    width: 1200,
    height: 630,
    viewBox: card,
    shapes: full,
    scheme: 'dark',
    background: paint.void.rgba,
    samples: samplesFor(1200),
  }))
  writeFileSync(join(brandDir, 'thue-mark.svg'), cardSvg())
  writeFileSync(join(publicDir, 'site.webmanifest'), manifestJson())
  console.log('generated Rex brand assets')
}

const entry = process.argv[1] ? pathToFileURL(process.argv[1]).href : ''
if (import.meta.url === entry) writeAll()
