// SPDX-License-Identifier: AGPL-3.0-or-later
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { deflateSync } from 'node:zlib'

const publicDir = new URL('../public/', import.meta.url).pathname
const brandDir = join(publicDir, 'brand')
mkdirSync(brandDir, { recursive: true })

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" role="img" aria-labelledby="title desc">
  <title id="title">Thue++ rewrite operator mark</title>
  <desc id="desc">A dark Thue++ mark with the ::= rewrite operator centered.</desc>
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#111827"/>
      <stop offset="1" stop-color="#020617"/>
    </linearGradient>
    <linearGradient id="fg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f8fafc"/>
      <stop offset="1" stop-color="#a7f3d0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" rx="72" fill="url(#bg)"/>
  <rect x="48" y="48" width="1104" height="534" rx="48" fill="none" stroke="#22c55e" stroke-opacity="0.28" stroke-width="8"/>
  <g fill="url(#fg)">
    <circle cx="320" cy="245" r="42"/>
    <circle cx="320" cy="385" r="42"/>
    <circle cx="455" cy="245" r="42"/>
    <circle cx="455" cy="385" r="42"/>
    <rect x="575" y="242" width="310" height="58" rx="29"/>
    <rect x="575" y="330" width="310" height="58" rx="29"/>
  </g>
  <text x="600" y="548" text-anchor="middle" fill="#e5e7eb" font-family="Inter, ui-sans-serif, system-ui, sans-serif" font-size="44" font-weight="700" letter-spacing="0.08em">THUE++</text>
</svg>
`

writeFileSync(join(brandDir, 'thuepp-mark.svg'), svg)

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
function png(width, height, draw) {
  const bytesPerPixel = 4
  const stride = width * bytesPerPixel
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = draw(x, y, width, height)
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
function roundedRectMask(x, y, w, h, rx, ry, width, height) {
  const left = rx
  const right = width - rx
  const top = ry
  const bottom = height - ry
  const px = Math.max(left, Math.min(right, x))
  const py = Math.max(top, Math.min(bottom, y))
  return (x - px) ** 2 + (y - py) ** 2 <= rx ** 2
}
function markPixel(x, y, width, height) {
  const bg1 = [17, 24, 39]
  const bg2 = [2, 6, 23]
  const t = (x / width + y / height) / 2
  let color = bg1.map((v, i) => Math.round(v * (1 - t) + bg2[i] * t))
  const margin = Math.min(width, height) * 0.075
  const border = Math.max(2, Math.round(Math.min(width, height) * 0.012))
  const insideOuter = roundedRectMask(x, y, width - margin * 2, height - margin * 2, margin * 0.65, margin * 0.65, width, height)
  const insideInner = roundedRectMask(x, y, width - (margin + border) * 2, height - (margin + border) * 2, margin * 0.5, margin * 0.5, width, height)
  if (insideOuter && !insideInner) color = [34, 197, 94]

  const scale = Math.min(width / 1200, height / 630)
  const ox = (width - 1200 * scale) / 2
  const oy = (height - 630 * scale) / 2
  const sx = (x - ox) / scale
  const sy = (y - oy) / scale
  const dotRadius = 42
  for (const [cx, cy] of [[320,245],[320,385],[455,245],[455,385]]) {
    if ((sx - cx) ** 2 + (sy - cy) ** 2 <= dotRadius ** 2) return [248, 250, 252, 255]
  }
  for (const [rx, ry, rw, rh] of [[575,242,310,58],[575,330,310,58]]) {
    const cr = rh / 2
    const px = Math.max(rx + cr, Math.min(rx + rw - cr, sx))
    const py = Math.max(ry + cr, Math.min(ry + rh - cr, sy))
    if ((sx - px) ** 2 + (sy - py) ** 2 <= cr ** 2) return [248, 250, 252, 255]
  }
  return [...color, 255]
}

writeFileSync(join(publicDir, 'og-image.png'), png(1200, 630, markPixel))
writeFileSync(join(publicDir, 'icon-512.png'), png(512, 512, markPixel))
writeFileSync(join(publicDir, 'icon-192.png'), png(192, 192, markPixel))
writeFileSync(join(publicDir, 'favicon.png'), png(64, 64, markPixel))

console.log('generated Thue++ brand assets')
