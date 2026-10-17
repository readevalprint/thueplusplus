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

/** @typedef {'hard' | 'top' | 'party' | 'beanie' | 'wizard' | 'crown'} HatId */

/** Hard hat first. Clicking Rex walks this list and wraps. */
export const HAT_IDS = ['hard', 'top', 'party', 'beanie', 'wizard', 'crown']

export const HAT_STORAGE_KEY = 'rex-hat'

/**
 * Hollow center of the rest pose, halfway from the eyes to the ground.
 * Hat swaps scale to 0 here.
 */
export const BODY_CENTER = { x: 0, y: MARK.eyeDy / 2 }

/** Header reach. The slide stays under a fifth of the header figure. */
export const REACH_MAX = 12
export const REACH_STRETCH = 1.25
export const GLANCE_MAX = 3.2
export const REACH_FALLOFF_PX = 480
export const SWAP_MS = 720

/** @param {number} value */
function clamp01(value) {
  if (!Number.isFinite(value)) throw new Error(`expected a finite amount, got ${value}`)
  return Math.min(1, Math.max(0, value))
}

/** @param {number} t */
function smooth(t) {
  const x = clamp01(t)
  return x * x * (3 - 2 * x)
}

/** @param {string} value @returns {value is HatId} */
export function isHatId(value) {
  return HAT_IDS.includes(/** @type {HatId} */ (value))
}

/** @param {string} id @returns {HatId} */
export function nextHatId(id) {
  const index = HAT_IDS.indexOf(/** @type {HatId} */ (id))
  if (index < 0) throw new Error(`unknown hat ${id}`)
  return HAT_IDS[(index + 1) % HAT_IDS.length]
}

/**
 * @param {{ getItem(key: string): string | null }} storage
 * @returns {HatId}
 */
export function loadHat(storage) {
  const raw = storage.getItem(HAT_STORAGE_KEY)
  if (raw === null) return 'hard'
  if (!isHatId(raw)) throw new Error(`stored rex hat ${raw} is not in the wardrobe`)
  return raw
}

/**
 * @param {{ setItem(key: string, value: string): void }} storage
 * @param {string} id
 */
export function saveHat(storage, id) {
  if (!isHatId(id)) throw new Error(`unknown hat ${id}`)
  storage.setItem(HAT_STORAGE_KEY, id)
}

/**
 * @param {HatId} id
 * @param {{ x: number, y: number }} offset
 * @param {number} tilt
 * @param {MarkPart[]} parts
 * @returns {{ id: HatId, offset: { x: number, y: number }, tilt: number, parts: MarkPart[] }}
 */
function hatOf(id, offset, tilt, parts) {
  if (!Number.isFinite(tilt) || Math.abs(tilt) < 3 || Math.abs(tilt) > 12) {
    throw new Error(`hat ${id} tilt must be a few degrees, got ${tilt}`)
  }
  const shift = Math.hypot(offset.x, offset.y)
  if (!Number.isFinite(shift) || shift < 1 || shift > 5) {
    throw new Error(`hat ${id} must sit a little off center, got ${shift}`)
  }
  return { id, offset: { x: offset.x, y: offset.y }, tilt, parts }
}

/** @param {string} d @param {MarkRole} role @returns {PathPart} */
function hatPath(d, role) {
  return { kind: 'path', d, role, space: 'hat' }
}

/** @param {{ cx: number, cy: number, rx: number, ry: number }} brim @param {MarkRole} role @returns {EllipsePart} */
function hatEllipse(brim, role) {
  return { kind: 'ellipse', ...brim, role, space: 'hat' }
}

/** @param {{ x: number, y: number, w: number, h: number, rx: number }} band @param {MarkRole} role @returns {RectPart} */
function hatRect(band, role) {
  return { kind: 'rect', ...band, role, space: 'hat' }
}

/** @param {number} cx @param {number} cy @param {number} r @param {MarkRole} role @returns {CirclePart} */
function hatCircle(cx, cy, r, role) {
  return { kind: 'circle', cx, cy, r, role, space: 'hat' }
}

/**
 * Same line style as the hard hat: a filled silhouette, an ink stroke,
 * a darker band, and a shine. Local space is the eye midpoint, y down.
 * `offset` shifts the hat on the head. `tilt` is degrees, cocked from level.
 * @type {Record<HatId, { id: HatId, offset: { x: number, y: number }, tilt: number, parts: MarkPart[] }>}
 */
export const hats = {
  hard: hatOf('hard', { x: 2.4, y: 0.8 }, -6, [
    hatPath(hat.crown, 'hat'),
    hatEllipse(hat.brim, 'hat'),
    hatPath(hat.crown, 'stroke'),
    hatRect(hat.band, 'band'),
    hatPath(hat.shine, 'shine'),
  ]),
  top: hatOf('top', { x: -2.8, y: 0.4 }, 5, [
    hatPath('M-9 -13 L-11 -44 L11 -44 L9 -13 Z', 'hat'),
    hatEllipse({ cx: 0, cy: -12, rx: 20, ry: 4 }, 'hat'),
    hatPath('M-9 -13 L-11 -44 L11 -44 L9 -13 Z', 'stroke'),
    hatRect({ x: -9, y: -20, w: 18, h: 4.5, rx: 0.6 }, 'band'),
    hatPath('M-5 -38 L-5 -26', 'shine'),
  ]),
  party: hatOf('party', { x: 3.2, y: -0.6 }, 8, [
    hatPath('M-14 -12 L0 -42 L14 -12 Z', 'hat'),
    hatEllipse({ cx: 0, cy: -11.5, rx: 16, ry: 3.2 }, 'hat'),
    hatPath('M-14 -12 L0 -42 L14 -12 Z', 'stroke'),
    hatRect({ x: -7, y: -26, w: 14, h: 3.6, rx: 0.4 }, 'band'),
    hatPath('M-4 -36 L-1 -32', 'shine'),
    hatCircle(0, -44.2, 2.2, 'shine'),
  ]),
  beanie: hatOf('beanie', { x: -1.8, y: 1.2 }, -4, [
    hatPath('M-16 -10 C-19 -32 19 -32 16 -10 Z', 'hat'),
    hatPath('M-16 -10 C-19 -32 19 -32 16 -10 Z', 'stroke'),
    hatRect({ x: -17, y: -14, w: 34, h: 6.5, rx: 2 }, 'band'),
    hatPath('M-6 -28 Q-1 -33 4 -26', 'shine'),
    hatCircle(0, -33.5, 3.2, 'hat'),
  ]),
  wizard: hatOf('wizard', { x: 1.4, y: -1.1 }, -8, [
    hatPath('M-15 -12 C-10 -30 -1 -44 0 -46 C3 -40 12 -28 16 -12 Z', 'hat'),
    hatEllipse({ cx: 0, cy: -11.5, rx: 22, ry: 4.2 }, 'hat'),
    hatPath('M-15 -12 C-10 -30 -1 -44 0 -46 C3 -40 12 -28 16 -12 Z', 'stroke'),
    hatRect({ x: -8, y: -16, w: 16, h: 3.5, rx: 0.5 }, 'band'),
    hatPath('M-2 -40 L1 -32', 'shine'),
  ]),
  crown: hatOf('crown', { x: -3.4, y: 0.5 }, 7, [
    hatPath('M-16 -12 L-16 -24 L-9 -14 L-4 -30 L0 -15 L4 -30 L9 -14 L16 -24 L16 -12 Z', 'hat'),
    hatPath('M-16 -12 L-16 -24 L-9 -14 L-4 -30 L0 -15 L4 -30 L9 -14 L16 -24 L16 -12 Z', 'stroke'),
    hatRect({ x: -14, y: -14, w: 28, h: 3.5, rx: 0.5 }, 'band'),
    hatPath('M-4 -26 L-4 -20', 'shine'),
    hatCircle(-4, -22, 1.7, 'shine'),
    hatCircle(4, -22, 1.7, 'shine'),
    hatCircle(0, -16, 1.5, 'shine'),
  ]),
}

/** @param {string} id */
export function hatShape(id) {
  if (!isHatId(id)) throw new Error(`unknown hat ${id}`)
  return hats[id]
}

/**
 * Body center in hat-local space. The hat group origin is the eye midpoint.
 * @param {number} eyeX
 * @param {number} eyeY
 */
export function bodyCenterLocal(eyeX, eyeY) {
  return { x: BODY_CENTER.x - eyeX, y: BODY_CENTER.y - eyeY }
}

/**
 * Incoming hat grows from the body center to the head.
 * Outgoing hat shrinks from the head into the body center.
 * `t` is 0 at the click and 1 when the swap has finished.
 * The hats move from 0.16 to 0.92 so the hand can arrive first.
 * @param {number} t
 * @param {number} eyeX
 * @param {number} eyeY
 */
export function hatSwapFrame(t, eyeX, eyeY) {
  const eased = swapArrive(t)
  const center = bodyCenterLocal(eyeX, eyeY)
  return {
    incoming: {
      x: center.x * (1 - eased),
      y: center.y * (1 - eased),
      scale: eased,
    },
    outgoing: {
      x: center.x * eased,
      y: center.y * eased,
      scale: 1 - eased,
    },
  }
}

/** 0 before the hat moves, 1 when it has reached the head. */
export function swapArrive(t) {
  return smooth(clamp01((clamp01(t) - 0.16) / 0.76))
}

/**
 * Degrees of cock while a new hat settles. Reduced motion is the resting
 * tilt immediately, with no wobble. At the end of a swap the wobble is gone
 * and the angle is that hat's tilt.
 * @param {number} restTilt
 * @param {number} t
 * @param {boolean} reduced
 */
export function hatTiltAt(restTilt, t, reduced) {
  if (!Number.isFinite(restTilt)) throw new Error(`hat tilt must be finite, got ${restTilt}`)
  if (reduced) return restTilt
  const arrive = swapArrive(t)
  const wobble = Math.sin(arrive * Math.PI * 3) * (1 - arrive) * 4.5
  return restTilt * arrive + wobble
}

/**
 * Offset eases in with the hat. Reduced motion uses the resting offset.
 * @param {{ x: number, y: number }} offset
 * @param {number} t
 * @param {boolean} reduced
 */
export function hatOffsetAt(offset, t, reduced) {
  if (reduced) return { x: offset.x, y: offset.y }
  const arrive = swapArrive(t)
  return { x: offset.x * arrive, y: offset.y * arrive }
}

/**
 * @param {{ x: number, y: number }} a
 * @param {{ x: number, y: number }} b
 * @param {number} t
 */
function lerpPoint(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
}

/**
 * Right or left hand. It reaches the body center, follows the new hat up,
 * and returns to `rest`.
 * @param {number} t
 * @param {{ x: number, y: number }} rest
 */
export function pullHand(t, rest) {
  const u = clamp01(t)
  const center = { x: BODY_CENTER.x, y: BODY_CENTER.y }
  if (u <= 0.22) return lerpPoint(rest, center, smooth(u / 0.22))
  const frame = hatSwapFrame(u, 0, MARK.eyeDy)
  const anchor = { x: frame.incoming.x, y: MARK.eyeDy + frame.incoming.y }
  if (u <= 0.68) return anchor
  const releaseFrame = hatSwapFrame(0.68, 0, MARK.eyeDy)
  const release = { x: releaseFrame.incoming.x, y: MARK.eyeDy + releaseFrame.incoming.y }
  return lerpPoint(release, rest, smooth((u - 0.68) / 0.32))
}

/**
 * @param {number} distancePx
 * @param {{ reduced: boolean, touch: boolean, present: boolean }} flags
 */
export function reachAmount(distancePx, flags) {
  if (flags.reduced || flags.touch || !flags.present) return 0
  if (!Number.isFinite(distancePx) || distancePx < 0) throw new Error(`reach distance must be >= 0, got ${distancePx}`)
  return clamp01(1 - distancePx / REACH_FALLOFF_PX)
}

/**
 * Header reach target. `pointer` is in the header viewBox. Null means the
 * pointer has left the window. The nearer hand slides out along the pointer
 * and stretches, and the two hands trade that reach smoothly across x = 0.
 * The eyes glance. The body, the eye sides, and the hat do not mirror.
 * @param {{ pointer: { x: number, y: number } | null, distancePx: number, reduced: boolean, touch: boolean }} input
 */
export function reachPose(input) {
  const left = { x: -MARK.handDx, y: MARK.handDy }
  const right = { x: MARK.handDx, y: MARK.handDy }
  const amount = reachAmount(input.distancePx, {
    reduced: input.reduced,
    touch: input.touch,
    present: input.pointer !== null,
  })
  const rest = {
    side: /** @type {'left' | 'right' | 'none'} */ ('none'),
    handLX: left.x,
    handLY: left.y,
    handRX: right.x,
    handRY: right.y,
    eyeX: 0,
    eyeY: 0,
    radiusL: MARK.dotR,
    radiusR: MARK.dotR,
  }
  if (amount === 0 || !input.pointer) return rest
  const pointer = input.pointer
  // Shares are a continuous function of pointer x. Crossing the vertical
  // center trades the reach from one hand to the other. It never mirrors
  // the body, the eyes, or the hat, and neither hand's target jumps.
  const span = right.x - left.x
  const across = clamp01((pointer.x - left.x) / span)
  const rightShare = smooth(across)
  const leftShare = 1 - rightShare
  const leftOff = handReach(left, pointer, amount * leftShare)
  const rightOff = handReach(right, pointer, amount * rightShare)
  const ex = pointer.x
  const ey = pointer.y - MARK.eyeDy
  const eyeLength = Math.hypot(ex, ey)
  const glance = GLANCE_MAX * amount
  const eye = eyeLength < 1e-6 ? { x: 0, y: 0 } : { x: (ex / eyeLength) * glance, y: (ey / eyeLength) * glance }
  return {
    side: leftShare >= rightShare ? 'left' : 'right',
    handLX: left.x + leftOff.x,
    handLY: left.y + leftOff.y,
    handRX: right.x + rightOff.x,
    handRY: right.y + rightOff.y,
    eyeX: eye.x,
    eyeY: eye.y,
    radiusL: MARK.dotR * (1 + 0.22 * amount * leftShare),
    radiusR: MARK.dotR * (1 + 0.22 * amount * rightShare),
  }
}

/**
 * Slide one hand toward the pointer. `scaled` is the reach amount times
 * that hand's share, so a zero share stays at rest.
 * @param {{ x: number, y: number }} hand
 * @param {{ x: number, y: number }} pointer
 * @param {number} scaled
 */
function handReach(hand, pointer, scaled) {
  const dx = pointer.x - hand.x
  const dy = pointer.y - hand.y
  const length = Math.hypot(dx, dy)
  const slide = REACH_MAX * REACH_STRETCH * scaled
  if (length < 1e-6 || slide === 0) return { x: 0, y: 0 }
  // Stop at the pointer. A fixed-length slide flips sign as the pointer
  // passes the hand, which is the mirror.
  const dist = Math.min(length, slide)
  return { x: (dx / length) * dist, y: (dy / length) * dist }
}

/**
 * Exponential ease toward a target. `rate` is per second.
 * @param {number} current
 * @param {number} target
 * @param {number} dt
 * @param {number} [rate]
 */
export function easeToward(current, target, dt, rate = 14) {
  if (!Number.isFinite(current) || !Number.isFinite(target)) throw new Error('ease values must be finite')
  if (!Number.isFinite(dt) || dt < 0) throw new Error(`ease dt must be >= 0, got ${dt}`)
  if (!Number.isFinite(rate) || rate <= 0) throw new Error(`ease rate must be > 0, got ${rate}`)
  const gain = 1 - Math.exp(-rate * dt)
  return current + (target - current) * gain
}

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
 * @returns {{ hatAt: { x: number, y: number }, hatScale: number, hatTilt: number, hatOffset: { x: number, y: number }, parts: MarkPart[] }}
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
  return placeHardHat({ hatAt: { x: 0, y: eyeDy }, hatScale: 1, parts })
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
  return placeHardHat({ hatAt, hatScale, parts })
}

/** Favicon, header bounds, and the open-graph card all wear the hard hat's cock. */
function placeHardHat(model) {
  const shape = hatShape('hard')
  return { ...model, hatTilt: shape.tilt, hatOffset: { x: shape.offset.x, y: shape.offset.y } }
}

/** @param {string} d */
export function flattenPath(d) {
  const tokens = d.match(/[MCLQZ]|-?\d*\.?\d+(?:e[+-]?\d+)?/gi)
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
    } else if (op === 'L') {
      if (!cursor) throw new Error(`path ${d} has a line with no start`)
      const point = { x: num(), y: num() }
      points.push(point)
      cursor = point
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
  return model.parts.map(part => compilePart(part, model))
}

/**
 * Rotate about the head point, then shift. Degrees, y down.
 * @param {number} x
 * @param {number} y
 * @param {{ hatAt: { x: number, y: number }, hatScale: number, hatTilt: number, hatOffset: { x: number, y: number } }} model
 */
function placeHat(x, y, model) {
  const tilt = model.hatTilt * Math.PI / 180
  const c = Math.cos(tilt)
  const s = Math.sin(tilt)
  const rx = x * c - y * s
  const ry = x * s + y * c
  return {
    x: (rx + model.hatOffset.x) * model.hatScale + model.hatAt.x,
    y: (ry + model.hatOffset.y) * model.hatScale + model.hatAt.y,
  }
}

/** @param {number} cx @param {number} cy @param {number} rx @param {number} ry */
function ellipsePoints(cx, cy, rx, ry) {
  const steps = 40
  /** @type {Pt[]} */
  const points = []
  for (let i = 0; i < steps; i += 1) {
    const angle = (i / steps) * Math.PI * 2
    points.push({ x: cx + Math.cos(angle) * rx, y: cy + Math.sin(angle) * ry })
  }
  return points
}

/** @param {number} x @param {number} y @param {number} w @param {number} h @param {number} rx */
function roundRectPoints(x, y, w, h, rx) {
  const r = Math.min(Math.max(rx, 0), w / 2, h / 2)
  if (r < 1e-6) {
    return [
      { x, y },
      { x: x + w, y },
      { x: x + w, y: y + h },
      { x, y: y + h },
    ]
  }
  /** @type {Pt[]} */
  const points = []
  const arc = (/** @type {number} */ cx, /** @type {number} */ cy, /** @type {number} */ a0, /** @type {number} */ a1) => {
    const steps = 4
    for (let i = 0; i <= steps; i += 1) {
      const angle = a0 + (a1 - a0) * (i / steps)
      points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r })
    }
  }
  arc(x + w - r, y + r, -Math.PI / 2, 0)
  arc(x + w - r, y + h - r, 0, Math.PI / 2)
  arc(x + r, y + h - r, Math.PI / 2, Math.PI)
  arc(x + r, y + r, Math.PI, Math.PI * 1.5)
  return points
}

/**
 * @param {MarkPart} part
 * @param {{ hatAt: { x: number, y: number }, hatScale: number, hatTilt: number, hatOffset: { x: number, y: number } }} model
 * @returns {Compiled}
 */
function compilePart(part, model) {
  const hatSpace = part.space === 'hat'
  const shift = (/** @type {number} */ x, /** @type {number} */ y) => (
    hatSpace ? placeHat(x, y, model) : { x, y }
  )
  if (part.kind === 'path') {
    const points = flattenPath(part.d).map(point => shift(point.x, point.y))
    if (part.role === 'shine' || part.role === 'stroke') {
      const width = part.role === 'shine' ? hat.shineWidth : hat.strokeWidth
      return { role: part.role, kind: 'stroke', points, radius: (width / 2) * (hatSpace ? model.hatScale : 1) }
    }
    return { role: part.role, kind: 'poly', points }
  }
  if (part.kind === 'ellipse' && hatSpace) {
    return { role: part.role, kind: 'poly', points: ellipsePoints(part.cx, part.cy, part.rx, part.ry).map(point => shift(point.x, point.y)) }
  }
  if (part.kind === 'ellipse') {
    return { role: part.role, kind: 'ellipse', cx: part.cx, cy: part.cy, rx: part.rx, ry: part.ry }
  }
  if (part.kind === 'rect' && hatSpace) {
    return { role: part.role, kind: 'poly', points: roundRectPoints(part.x, part.y, part.w, part.h, part.rx).map(point => shift(point.x, point.y)) }
  }
  if (part.kind === 'rect') {
    return { role: part.role, kind: 'roundrect', x: part.x, y: part.y, w: part.w, h: part.h, rx: part.rx }
  }
  if (part.kind === 'circle') {
    const center = shift(part.cx, part.cy)
    const scale = hatSpace ? model.hatScale : 1
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

/** SVG transform shared by the favicon and the open-graph card. */
export function hatGroupTransform(model) {
  return `translate(${num(model.hatAt.x)} ${num(model.hatAt.y)}) scale(${num(model.hatScale)}) translate(${num(model.hatOffset.x)} ${num(model.hatOffset.y)}) rotate(${num(model.hatTilt)})`
}

/** SVG favicon. Ink follows the browser scheme. The hard hat keeps its cock. */
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
  <g class="hat" transform="${hatGroupTransform(model)}">
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
