/**
 * Static Rex geometry. One source for the hero figure, the header mark,
 * and the favicon.
 *
 * The six marks are the mascot rest pose: eye bars 7×22, dots radius 7,
 * the same constants `motion.ts` exports. The hard hat is the path data
 * RexFigure used to inline. Positions are y-down, origin between the feet.
 * The hat is drawn in eye-midpoint local space and translated by `hatAt`.
 */

/** @typedef {'hat' | 'band' | 'shine' | 'stroke' | 'eye' | 'dot'} MarkRole */
/** @typedef {'hat' | 'world'} MarkSpace */
/**
 * @typedef {{ kind: 'path', d: string, role: MarkRole, space: MarkSpace }} PathPart
 * @typedef {{ kind: 'ellipse', cx: number, cy: number, rx: number, ry: number, role: MarkRole, space: MarkSpace }} EllipsePart
 * @typedef {{ kind: 'rect', x: number, y: number, w: number, h: number, rx: number, role: MarkRole, space: MarkSpace }} RectPart
 * @typedef {{ kind: 'circle', cx: number, cy: number, r: number, role: MarkRole, space: MarkSpace }} CirclePart
 * @typedef {PathPart | EllipsePart | RectPart | CirclePart} MarkPart
 * @typedef {{ x: number, y: number }} Pt
 * @typedef {{ role: MarkRole, kind: 'poly', points: Pt[] } | { role: MarkRole, kind: 'ellipse', cx: number, cy: number, rx: number, ry: number } | { role: MarkRole, kind: 'circle', cx: number, cy: number, r: number } | { role: MarkRole, kind: 'roundrect', x: number, y: number, w: number, h: number, rx: number } | { role: MarkRole, kind: 'stroke', points: Pt[], radius: number }} Compiled
 */

export const MARK = {
  eyeW: 7,
  eyeH: 22,
  eyeDx: 10.5,
  eyeDy: -64,
  dotR: 7,
  handDx: 18,
  handDy: -33,
  footDx: 14,
}

export const hat = {
  crown: 'M-16 -13 C-20 -34 20 -34 16 -13 Z',
  brim: { cx: 0, cy: -12, rx: 24, ry: 5.2 },
  band: { x: -9, y: -19, w: 18, h: 4.5, rx: 1 },
  shine: 'M-7 -30 Q-1 -35 5 -28',
  strokeWidth: 1.3,
  shineWidth: 1.6,
  strokeOpacity: 0.4,
  shineOpacity: 0.55,
}

/** Theme-matched paints. Hex and rgba are the same color. */
export const paint = {
  hat: { hex: '#ff5a36', rgba: [255, 90, 54, 255] },
  band: { hex: '#c43b1d', rgba: [196, 59, 29, 255] },
  hatInk: { hex: '#1a100c', rgba: [26, 16, 12, 255] },
  shine: { hex: '#ffffff', rgba: [255, 255, 255, 255] },
  boneLight: { hex: '#1a1916', rgba: [26, 25, 22, 255] },
  boneDark: { hex: '#e8e6e1', rgba: [232, 230, 225, 255] },
  void: { hex: '#0a0a0c', rgba: [10, 10, 12, 255] },
  /** Pure ink for the 16 and 32 pixel icon. Bone grays wash out at that size. */
  iconInkLight: { hex: '#000000', rgba: [0, 0, 0, 255] },
  iconInkDark: { hex: '#ffffff', rgba: [255, 255, 255, 255] },
}

export const hatFill = paint.hat.hex
export const bandFill = paint.band.hex
export const hatInk = paint.hatInk.hex
export const shineFill = paint.shine.hex

/**
 * Closed eye height is `1 - 0.86 * blink` at full blink, matching framePose.
 * The hover blink lasts 230ms: 70 close, 30 hold, 130 open.
 */
export const BLINK_SHUT = 0.14
export const BLINK_MS = 230

/**
 * 16-unit icon canvas. One unit is one pixel at 16px and two pixels at 32px.
 * The hat is the shared crown, scaled down. The eyes and dots are heavier
 * than the rest pose so the body, not the hat, fills the canvas.
 */
const ICON_BOX = { x: 0, y: 0, w: 16, h: 16 }
const ICON_HAT_SCALE = 0.17

/**
 * @param {'icon' | 'header' | 'full'} detail
 * @returns {{ hatAt: { x: number, y: number }, hatScale: number, parts: MarkPart[] }}
 */
export function markModel(detail) {
  if (detail !== 'icon' && detail !== 'header' && detail !== 'full') {
    throw new Error(`unknown rex detail ${String(detail)}`)
  }
  if (detail === 'icon') return iconModel()
  const { eyeW, eyeH, eyeDx, eyeDy, dotR, handDx, handDy, footDx } = MARK
  const eyeRx = Math.min(eyeW / 2, eyeH / 2)
  /** @type {MarkPart[]} */
  const parts = [
    { kind: 'path', d: hat.crown, role: 'hat', space: 'hat' },
    { kind: 'ellipse', ...hat.brim, role: 'hat', space: 'hat' },
  ]
  if (detail === 'full') {
    parts.push({ kind: 'path', d: hat.crown, role: 'stroke', space: 'hat' })
    parts.push({ kind: 'rect', ...hat.band, role: 'band', space: 'hat' })
    parts.push({ kind: 'path', d: hat.shine, role: 'shine', space: 'hat' })
  } else {
    parts.push({ kind: 'rect', ...hat.band, role: 'band', space: 'hat' })
  }
  parts.push(
    { kind: 'rect', x: -eyeDx - eyeW / 2, y: eyeDy - eyeH / 2, w: eyeW, h: eyeH, rx: eyeRx, role: 'eye', space: 'world' },
    { kind: 'rect', x: eyeDx - eyeW / 2, y: eyeDy - eyeH / 2, w: eyeW, h: eyeH, rx: eyeRx, role: 'eye', space: 'world' },
    { kind: 'circle', cx: -handDx, cy: handDy, r: dotR, role: 'dot', space: 'world' },
    { kind: 'circle', cx: handDx, cy: handDy, r: dotR, role: 'dot', space: 'world' },
    { kind: 'circle', cx: -footDx, cy: -dotR, r: dotR, role: 'dot', space: 'world' },
    { kind: 'circle', cx: footDx, cy: -dotR, r: dotR, role: 'dot', space: 'world' },
  )
  return { hatAt: { x: 0, y: eyeDy }, hatScale: 1, parts }
}

/** Bold 16-unit Rex. Hat local y=-34 is the crown top. */
function iconModel() {
  const hatScale = ICON_HAT_SCALE
  const hatAt = { x: 8, y: 0.15 + 34 * hatScale }
  const eyeW = 3
  const eyeH = 5
  const eyeY = 4.85
  const eyeRx = 1
  const dotR = 1.6
  /** @type {MarkPart[]} */
  const parts = [
    { kind: 'path', d: hat.crown, role: 'hat', space: 'hat' },
    { kind: 'ellipse', ...hat.brim, role: 'hat', space: 'hat' },
    { kind: 'rect', x: 4, y: eyeY, w: eyeW, h: eyeH, rx: eyeRx, role: 'eye', space: 'world' },
    { kind: 'rect', x: 9, y: eyeY, w: eyeW, h: eyeH, rx: eyeRx, role: 'eye', space: 'world' },
    { kind: 'circle', cx: 2.15, cy: 10.35, r: dotR, role: 'dot', space: 'world' },
    { kind: 'circle', cx: 13.85, cy: 10.35, r: dotR, role: 'dot', space: 'world' },
    { kind: 'circle', cx: 5.5, cy: 13.9, r: dotR, role: 'dot', space: 'world' },
    { kind: 'circle', cx: 10.5, cy: 13.9, r: dotR, role: 'dot', space: 'world' },
  ]
  return { hatAt, hatScale, parts }
}

/** @param {string} d */
export function flattenPath(d) {
  const tokens = d.match(/[MCQZ]|-?\d*\.?\d+(?:e[+-]?\d+)?/gi)
  if (!tokens) throw new Error(`empty path ${d}`)
  /** @type {Pt[]} */
  const points = []
  /** @type {Pt | null} */
  let start = null
  /** @type {Pt | null} */
  let cursor = null
  let i = 0
  const num = () => {
    const token = tokens[i++]
    if (token === undefined || /[A-Za-z]/.test(token)) throw new Error(`path ${d} expected a number`)
    return Number(token)
  }
  while (i < tokens.length) {
    const op = tokens[i++]
    if (op === 'M') {
      const point = { x: num(), y: num() }
      start = point
      cursor = point
      points.push(point)
    } else if (op === 'C') {
      if (!cursor) throw new Error(`path ${d} has a curve with no start`)
      const p1 = { x: num(), y: num() }
      const p2 = { x: num(), y: num() }
      const p3 = { x: num(), y: num() }
      flattenCubic(cursor, p1, p2, p3, 0.05, points)
      cursor = p3
    } else if (op === 'Q') {
      if (!cursor) throw new Error(`path ${d} has a curve with no start`)
      const p1 = { x: num(), y: num() }
      const p2 = { x: num(), y: num() }
      flattenQuad(cursor, p1, p2, 0.05, points)
      cursor = p2
    } else if (op === 'Z') {
      if (!start || !cursor) throw new Error(`path ${d} closes nothing`)
      if (cursor.x !== start.x || cursor.y !== start.y) points.push(start)
      cursor = start
    } else {
      throw new Error(`path ${d} uses unsupported command ${String(op)}`)
    }
  }
  return points
}

/**
 * @param {Pt} p0
 * @param {Pt} p1
 * @param {Pt} p2
 * @param {Pt} p3
 * @param {number} tol
 * @param {Pt[]} out
 * @param {number} [depth]
 */
function flattenCubic(p0, p1, p2, p3, tol, out, depth = 0) {
  if (depth > 16 || curveFlat(p0, p1, p2, p3, tol)) {
    out.push(p3)
    return
  }
  const p01 = mid(p0, p1)
  const p12 = mid(p1, p2)
  const p23 = mid(p2, p3)
  const p012 = mid(p01, p12)
  const p123 = mid(p12, p23)
  const p0123 = mid(p012, p123)
  flattenCubic(p0, p01, p012, p0123, tol, out, depth + 1)
  flattenCubic(p0123, p123, p23, p3, tol, out, depth + 1)
}

/**
 * @param {Pt} p0
 * @param {Pt} p1
 * @param {Pt} p2
 * @param {number} tol
 * @param {Pt[]} out
 * @param {number} [depth]
 */
function flattenQuad(p0, p1, p2, tol, out, depth = 0) {
  const dx = p2.x - p0.x
  const dy = p2.y - p0.y
  const len = Math.hypot(dx, dy) || 1
  const dist = Math.abs((p1.x - p0.x) * dy - (p1.y - p0.y) * dx) / len
  if (depth > 16 || dist <= tol) {
    out.push(p2)
    return
  }
  const p01 = mid(p0, p1)
  const p12 = mid(p1, p2)
  const p012 = mid(p01, p12)
  flattenQuad(p0, p01, p012, tol, out, depth + 1)
  flattenQuad(p012, p12, p2, tol, out, depth + 1)
}

/**
 * @param {Pt} p0
 * @param {Pt} p1
 * @param {Pt} p2
 * @param {Pt} p3
 * @param {number} tol
 */
function curveFlat(p0, p1, p2, p3, tol) {
  const dx = p3.x - p0.x
  const dy = p3.y - p0.y
  const len = Math.hypot(dx, dy) || 1
  const d1 = Math.abs((p1.x - p0.x) * dy - (p1.y - p0.y) * dx) / len
  const d2 = Math.abs((p2.x - p0.x) * dy - (p2.y - p0.y) * dx) / len
  return d1 <= tol && d2 <= tol
}

/** @param {Pt} a @param {Pt} b */
function mid(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
}

/**
 * World-space primitives in draw order.
 * @param {'icon' | 'header' | 'full'} detail
 * @returns {Compiled[]}
 */
export function compileMarks(detail) {
  const model = markModel(detail)
  return model.parts.map(part => compilePart(part, model.hatAt, model.hatScale))
}

/**
 * @param {MarkPart} part
 * @param {{ x: number, y: number }} hatAt
 * @param {number} hatScale
 * @returns {Compiled}
 */
function compilePart(part, hatAt, hatScale) {
  const shift = (/** @type {number} */ x, /** @type {number} */ y) => (
    part.space === 'hat' ? { x: x * hatScale + hatAt.x, y: y * hatScale + hatAt.y } : { x, y }
  )
  if (part.kind === 'path') {
    const points = flattenPath(part.d).map(point => shift(point.x, point.y))
    if (part.role === 'shine' || part.role === 'stroke') {
      const width = part.role === 'shine' ? hat.shineWidth : hat.strokeWidth
      return { role: part.role, kind: 'stroke', points, radius: (width / 2) * hatScale }
    }
    return { role: part.role, kind: 'poly', points }
  }
  if (part.kind === 'ellipse') {
    const center = shift(part.cx, part.cy)
    const scale = part.space === 'hat' ? hatScale : 1
    return { role: part.role, kind: 'ellipse', cx: center.x, cy: center.y, rx: part.rx * scale, ry: part.ry * scale }
  }
  if (part.kind === 'rect') {
    const origin = shift(part.x, part.y)
    const scale = part.space === 'hat' ? hatScale : 1
    return { role: part.role, kind: 'roundrect', x: origin.x, y: origin.y, w: part.w * scale, h: part.h * scale, rx: part.rx * scale }
  }
  if (part.kind === 'circle') {
    const center = shift(part.cx, part.cy)
    const scale = part.space === 'hat' ? hatScale : 1
    return { role: part.role, kind: 'circle', cx: center.x, cy: center.y, r: part.r * scale }
  }
  const unknown = part
  throw new Error(`unknown mark part ${JSON.stringify(unknown)}`)
}

/** @param {'icon' | 'header' | 'full'} detail */
export function boundsOf(detail) {
  const shapes = compileMarks(detail)
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  const grow = (/** @type {number} */ x, /** @type {number} */ y) => {
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
  }
  for (const shape of shapes) {
    if (shape.kind === 'poly' || shape.kind === 'stroke') {
      const pad = shape.kind === 'stroke' ? shape.radius : 0
      for (const point of shape.points) grow(point.x - pad, point.y - pad), grow(point.x + pad, point.y + pad)
    } else if (shape.kind === 'ellipse') {
      grow(shape.cx - shape.rx, shape.cy - shape.ry)
      grow(shape.cx + shape.rx, shape.cy + shape.ry)
    } else if (shape.kind === 'circle') {
      grow(shape.cx - shape.r, shape.cy - shape.r)
      grow(shape.cx + shape.r, shape.cy + shape.r)
    } else {
      grow(shape.x, shape.y)
      grow(shape.x + shape.w, shape.y + shape.h)
    }
  }
  if (!Number.isFinite(minX)) throw new Error(`rex detail ${detail} has no bounds`)
  return { minX, minY, maxX, maxY }
}

/**
 * The icon viewBox is the 16-unit canvas. It must contain the bold icon.
 * @param {'icon' | 'header' | 'full'} detail
 */
export function viewBoxFor(detail) {
  const bounds = boundsOf(detail)
  if (detail === 'icon') {
    const box = ICON_BOX
    if (bounds.minX < box.x - 1e-6 || bounds.minY < box.y - 1e-6 || bounds.maxX > box.x + box.w + 1e-6 || bounds.maxY > box.y + box.h + 1e-6) {
      throw new Error(`icon viewBox clips rex ${JSON.stringify(bounds)}`)
    }
    return box
  }
  const pad = 2
  return {
    x: bounds.minX - pad,
    y: bounds.minY - pad,
    w: bounds.maxX - bounds.minX + pad * 2,
    h: bounds.maxY - bounds.minY + pad * 2,
  }
}

/** @param {'icon' | 'header' | 'full'} detail */
export function viewBoxString(detail) {
  const box = viewBoxFor(detail)
  return `${num(box.x)} ${num(box.y)} ${num(box.w)} ${num(box.h)}`
}

/** @param {number} value */
function num(value) {
  const rounded = Math.round(value * 100) / 100
  return String(rounded)
}

/** SVG favicon. Ink follows the browser scheme. The hat stays signal orange. */
export function faviconSvg() {
  const model = markModel('icon')
  const hatParts = model.parts.filter(part => part.space === 'hat')
  const worldParts = model.parts.filter(part => part.space === 'world')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBoxString('icon')}" role="img">
  <title>Rex</title>
  <style>
    :root { color-scheme: light dark; }
    .ink { fill: ${paint.iconInkLight.hex}; }
    .hat { fill: ${paint.hat.hex}; }
    @media (prefers-color-scheme: dark) {
      .ink { fill: ${paint.iconInkDark.hex}; }
    }
  </style>
  <g class="hat" transform="translate(${num(model.hatAt.x)} ${num(model.hatAt.y)}) scale(${num(model.hatScale)})">
    ${hatParts.map(svgElement).join('\n    ')}
  </g>
  <g class="ink">
    ${worldParts.map(svgElement).join('\n    ')}
  </g>
</svg>
`
}

/** @param {MarkPart} part */
function svgElement(part) {
  if (part.kind === 'path') return `<path d="${part.d}"/>`
  if (part.kind === 'ellipse') return `<ellipse cx="${num(part.cx)}" cy="${num(part.cy)}" rx="${num(part.rx)}" ry="${num(part.ry)}"/>`
  if (part.kind === 'rect') return `<rect x="${num(part.x)}" y="${num(part.y)}" width="${num(part.w)}" height="${num(part.h)}" rx="${num(part.rx)}"/>`
  if (part.kind === 'circle') return `<circle cx="${num(part.cx)}" cy="${num(part.cy)}" r="${num(part.r)}"/>`
  const unknown = part
  throw new Error(`cannot draw ${JSON.stringify(unknown)}`)
}

/**
 * Open-graph card viewBox: the full figure fills `fill` of the card height
 * and sits in the center. World units map onto the pixel frame.
 * @param {number} pixelW
 * @param {number} pixelH
 * @param {number} fill
 */
export function cardViewBox(pixelW, pixelH, fill = 0.78) {
  const bounds = boundsOf('full')
  const rexH = bounds.maxY - bounds.minY
  const worldH = rexH / fill
  const worldW = worldH * (pixelW / pixelH)
  const cx = (bounds.minX + bounds.maxX) / 2
  const cy = (bounds.minY + bounds.maxY) / 2
  return { x: cx - worldW / 2, y: cy - worldH / 2, w: worldW, h: worldH }
}
