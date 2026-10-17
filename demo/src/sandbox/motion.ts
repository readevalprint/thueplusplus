/**
 * Rex's gait, blink, and eye spring.
 *
 * The six marks match the mascot viewBox: eye bars 7×22, dots radius 7.
 * Positions are source units, y down, root at the ground between the feet.
 * The walk is the flat gait from the mascot choreography: anticipation,
 * stepped feet with a lift, a late hand swing, a bob, then a settle.
 * Eyes follow the root on a damped spring. A blink closes in 70ms, holds
 * 30ms, and opens in 130ms. Eye height is `22 * (1 - 0.86 * blink)`.
 */

import {
  GROUND,
  PULL,
  REX_HOME,
  REX_LEVER,
  SCALE,
  clamp,
  leverKnob,
  walkDistance,
  type Pt,
} from './layout'

export const DOT_R = 7
export const EYE_W = 7
export const EYE_H = 22
export const EYE_DX = 10.5
export const EYE_DY = -64
export const HAND_DX = 18
export const HAND_DY = -33
export const FOOT_DX = 14

const STANCE = FOOT_DX * 2
const STRIDE = 12
const STEP = 0.16
const STEP_LIFT = 6.54

type EaseName = 'linear' | 'inOut' | 'out' | 'in' | 'outBack' | 'inOutSine' | 'outSine' | 'inSine' | 'step'

export function ease(name: EaseName, s: number, back = 1.7): number {
  const t = clamp(s, 0, 1)
  switch (name) {
    case 'linear':
      return t
    case 'inOut':
      return t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2
    case 'out':
      return 1 - (1 - t) ** 3
    case 'in':
      return t * t * t
    case 'outBack': {
      const c3 = back + 1
      return 1 + c3 * (t - 1) ** 3 + back * (t - 1) ** 2
    }
    case 'inOutSine':
      return -(Math.cos(Math.PI * t) - 1) / 2
    case 'outSine':
      return Math.sin((t * Math.PI) / 2)
    case 'inSine':
      return 1 - Math.cos((t * Math.PI) / 2)
    case 'step':
      return ease('inOutSine', (t - 0.15) / 0.7)
    default: {
      const unknown: never = name
      throw new Error(`unknown ease ${String(unknown)}`)
    }
  }
}

/** Close 70ms, hold 30ms, open 130ms. `d` is seconds since the blink started. */
export function blinkCurve(d: number): number {
  if (d < 0 || d > 0.23) return 0
  if (d < 0.07) return ease('in', d / 0.07)
  if (d < 0.1) return 1
  return 1 - ease('out', (d - 0.1) / 0.13)
}

/** Idle blinks. A double blink lands on every third cycle. */
export function blinkAmount(t: number): number {
  if (t < 0) return 0
  const period = 3.7
  const shifted = t + 1.5
  const phase = shifted % period
  const n = Math.floor(shifted / period)
  let amount = blinkCurve(phase)
  if (n % 3 === 2) amount = Math.max(amount, blinkCurve(phase - 0.28))
  return amount
}

export function glanceAt(t: number): Pt {
  const cycle = ((t % 6.5) + 6.5) % 6.5
  const toward = ease('inOut', (cycle - 0.35) / 0.7) * (1 - ease('inOut', (cycle - 3.5) / 0.7))
  return { x: 4.2 * toward, y: -0.6 * toward }
}

export interface Spring {
  x: number
  y: number
  vx: number
  vy: number
}

export function settledSpring(): Spring {
  return { x: 0, y: 0, vx: 0, vy: 0 }
}

/** Damped spring. Horizontal ~5Hz, vertical ~4Hz, matching the walk's eye follow. */
export function stepSpring(spring: Spring, target: Pt, dt: number): Spring {
  if (!Number.isFinite(dt) || dt < 0) throw new Error(`spring dt must be >= 0, got ${dt}`)
  if (dt === 0) return spring
  const wx = 2 * Math.PI * 5
  const zx = 0.75
  const wy = 2 * Math.PI * 4
  const zy = 0.45
  const sub = 8
  const h = dt / sub
  let { x, y, vx, vy } = spring
  for (let i = 0; i < sub; i += 1) {
    const ax = wx * wx * (target.x - x) - 2 * zx * wx * vx
    const ay = wy * wy * (target.y - y) - 2 * zy * wy * vy
    vx += ax * h
    vy += ay * h
    x += vx * h
    y += vy * h
  }
  return { x, y, vx, vy }
}

interface Key {
  t: number
  v: Pt
  ex: EaseName
  ey: EaseName
  arc: number
  back: number
}

class Track {
  keys: Key[]

  constructor(t: number, v: Pt) {
    this.keys = [{ t, v, ex: 'linear', ey: 'linear', arc: 0, back: 1.7 }]
  }

  last(): Pt {
    return this.keys[this.keys.length - 1].v
  }

  lastT(): number {
    return this.keys[this.keys.length - 1].t
  }

  mv(t0: number, t1: number, v: Pt, e: EaseName, arc = 0, back = 1.7): void {
    this.mv2(t0, t1, v, e, e, arc, back)
  }

  mv2(t0: number, t1: number, v: Pt, ex: EaseName, ey: EaseName, arc = 0, back = 1.7): void {
    const lt = this.lastT()
    if (t0 < lt - 1e-3) throw new Error(`track keys out of order: ${t0} < ${lt}`)
    if (t0 > lt + 1e-4) {
      this.keys.push({ t: t0, v: this.last(), ex: 'linear', ey: 'linear', arc: 0, back })
    }
    if (!(t1 > t0)) throw new Error(`track segment must advance: ${t0} -> ${t1}`)
    this.keys.push({ t: t1, v, ex, ey, arc, back })
  }

  at(t: number): Pt {
    const keys = this.keys
    if (t <= keys[0].t) return keys[0].v
    for (let i = 1; i < keys.length; i += 1) {
      const a = keys[i - 1]
      const b = keys[i]
      if (t <= b.t) {
        const s = (t - a.t) / (b.t - a.t)
        const bulge = Math.sin(Math.PI * s)
        return {
          x: a.v.x + (b.v.x - a.v.x) * ease(b.ex, s, b.back),
          y: a.v.y + (b.v.y - a.v.y) * ease(b.ey, s, b.back) - b.arc * bulge,
        }
      }
    }
    return keys[keys.length - 1].v
  }
}

interface WalkFrame {
  /** Body x in walk space, 0 at the start and `distance` at the settle. */
  x: number
  y: number
  footL: Pt
  footR: Pt
  handL: Pt
  handR: Pt
}

function footOn(x: number): Pt {
  return { x, y: -DOT_R }
}

function handRest(body: Pt): [Pt, Pt] {
  return [
    { x: body.x - HAND_DX, y: body.y + HAND_DY },
    { x: body.x + HAND_DX, y: body.y + HAND_DY },
  ]
}

function buildWalk(distance: number): { duration: number, at: (t: number) => WalkFrame } {
  if (!(distance > 1)) throw new Error(`walk distance must be > 1, got ${distance}`)
  const body = new Track(0, { x: 0, y: 0 })
  const footL = new Track(0, footOn(-FOOT_DX))
  const footR = new Track(0, footOn(FOOT_DX))
  const [hl0, hr0] = handRest({ x: 0, y: 0 })
  const handL = new Track(0, hl0)
  const handR = new Track(0, hr0)

  let fl = -FOOT_DX
  let fr = FOOT_DX
  const finalFl = distance - FOOT_DX
  const finalFr = distance + FOOT_DX
  let t = 0
  body.mv(t, t + 0.1, { x: -0.77, y: 1.54 }, 'inOut')
  t += 0.1
  let right = true
  let first = true
  let n = 0
  while (Math.abs(fl - finalFl) > 0.5 || Math.abs(fr - finalFr) > 0.5) {
    const remaining = Math.max(0, Math.max(finalFr - fr, finalFl - fl))
    const dur = first ? STEP * 1.3 : remaining < 2 * STRIDE + 1 ? STEP * 1.25 : STEP
    let swing = 1
    if (right) {
      const max = fl + STANCE + STRIDE
      const target = Math.min(fr + (first ? STRIDE : 2 * STRIDE), max, finalFr)
      if (target > fr + 0.5) {
        footR.mv2(t, t + dur, footOn(target), 'step', 'linear', STEP_LIFT)
        fr = target
      }
      swing = 1
    } else {
      const max = fr - STANCE + STRIDE
      const target = Math.min(fl + 2 * STRIDE, max, finalFl)
      if (target > fl + 0.5) {
        footL.mv2(t, t + dur, footOn(target), 'step', 'linear', STEP_LIFT)
        fl = target
      }
      swing = -1
    }
    const done = Math.abs(fl - finalFl) <= 0.5 && Math.abs(fr - finalFr) <= 0.5
    const bx = (fl + fr) / 2
    const lead = done ? 0 : 1.15
    body.mv(t, t + dur, { x: bx + lead, y: 0 }, 'inOutSine', 1.92)
    const spread = (fr - fl - STANCE) / STRIDE
    const sw = done ? 0 : 4.23 * swing * Math.max(0.6, Math.abs(spread))
    const [hl, hr] = handRest({ x: bx, y: 0 })
    const lag = 0.04
    handL.mv(t + lag, t + dur + lag, { x: hl.x + sw, y: hl.y - Math.max(0, sw) * 0.35 }, 'inOutSine')
    handR.mv(t + lag, t + dur + lag, { x: hr.x - sw, y: hr.y - Math.max(0, -sw) * 0.35 }, 'inOutSine')
    t += dur
    right = !right
    first = false
    n += 1
    if (n >= 80) throw new Error('walk never converged')
  }
  const end = { x: distance, y: 0 }
  body.mv(t, t + 0.12, { x: end.x, y: 1.54 }, 'out')
  body.mv(t + 0.12, t + 0.36, end, 'inOut')
  const [hl, hr] = handRest(end)
  handL.mv(t + 0.04, t + 0.4, hl, 'outBack', 0, 2.2)
  handR.mv(t + 0.04, t + 0.4, hr, 'outBack', 0, 2.2)
  const duration = Math.max(body.lastT(), footL.lastT(), footR.lastT(), handL.lastT(), handR.lastT())

  return {
    duration,
    at(time: number): WalkFrame {
      const b = body.at(time)
      const left = footL.at(time)
      const rightFoot = footR.at(time)
      const leftHand = handL.at(time)
      const rightHand = handR.at(time)
      return {
        x: b.x,
        y: b.y,
        footL: { x: left.x - b.x, y: left.y - b.y },
        footR: { x: rightFoot.x - b.x, y: rightFoot.y - b.y },
        handL: { x: leftHand.x - b.x, y: leftHand.y - b.y },
        handR: { x: rightHand.x - b.x, y: rightHand.y - b.y },
      }
    },
  }
}

const WALK = buildWalk(walkDistance())
export const WALK_DURATION = WALK.duration

function sampleWalk(u: number, dir: 1 | -1): WalkFrame {
  const frame = WALK.at(clamp(u, 0, 1) * WALK.duration)
  if (dir === 1) return frame
  return {
    x: frame.x,
    y: frame.y,
    footL: { x: -frame.footR.x, y: frame.footR.y },
    footR: { x: -frame.footL.x, y: frame.footL.y },
    handL: { x: -frame.handR.x, y: frame.handR.y },
    handR: { x: -frame.handL.x, y: frame.handL.y },
  }
}

export type PoseMode = 'idle' | 'to-lever' | 'pull' | 'from-lever' | 'startled' | 'wander'

export interface Pose {
  rootX: number
  rootY: number
  /** 0 at the start of a walk, 1 when the body has arrived. */
  travel: number
  eyeLX: number
  eyeLY: number
  eyeRX: number
  eyeRY: number
  eyeH: number
  handLX: number
  handLY: number
  handRX: number
  handRY: number
  footLX: number
  footLY: number
  footRX: number
  footRY: number
  squash: number
  hatRot: number
  spring: Spring
}

export interface PoseInput {
  mode: PoseMode
  t: number
  clock: number
  lever: number
  reduced: boolean
  spring: Spring
  dt: number
}

function restLimbs(): Pick<Pose, 'handLX' | 'handLY' | 'handRX' | 'handRY' | 'footLX' | 'footLY' | 'footRX' | 'footRY'> {
  return {
    handLX: -HAND_DX,
    handLY: HAND_DY,
    handRX: HAND_DX,
    handRY: HAND_DY,
    footLX: -FOOT_DX,
    footLY: -DOT_R,
    footRX: FOOT_DX,
    footRY: -DOT_R,
  }
}

function restBody(rootX: number, rootY: number, squash: number): Omit<Pose, 'eyeLX' | 'eyeLY' | 'eyeRX' | 'eyeRY' | 'eyeH' | 'hatRot' | 'spring'> {
  return { rootX, rootY, travel: 0, ...restLimbs(), squash }
}

function fromFrame(frame: WalkFrame, rootX: number, travel: number): Omit<Pose, 'eyeLX' | 'eyeLY' | 'eyeRX' | 'eyeRY' | 'eyeH' | 'hatRot' | 'spring'> {
  const squash = 1 - clamp(frame.y, 0, 4) * 0.035
  return {
    rootX,
    rootY: GROUND + frame.y * SCALE,
    travel,
    handLX: frame.handL.x,
    handLY: frame.handL.y,
    handRX: frame.handR.x,
    handRY: frame.handR.y,
    footLX: frame.footL.x,
    footLY: frame.footL.y,
    footRX: frame.footR.x,
    footRY: frame.footR.y,
    squash,
  }
}

function knobLocal(lever: number): Pt {
  const knob = leverKnob(lever)
  return {
    x: (knob.x - REX_LEVER) / SCALE,
    y: (knob.y - GROUND) / SCALE,
  }
}

/**
 * One pose. `spring` lags the root in source units along the trip
 * (0 at home, `walkDistance()` at the lever). The returned spring is the
 * updated state. Reduced motion is the poster rest pose, eyes open.
 */
export function framePose(input: PoseInput): Pose {
  const distance = walkDistance()
  let body = restBody(REX_HOME, GROUND, 1)
  let target: Pt = { x: 0, y: 0 }
  let glance = { x: 0, y: 0 }
  let blink = 0
  let hat = 0

  if (input.reduced || input.mode === 'idle') {
    if (!input.reduced && input.mode === 'idle') {
      const breathe = Math.sin(input.clock * 1.7) * 0.45
      body = restBody(REX_HOME, GROUND + breathe * SCALE, 1 - Math.max(0, breathe) * 0.02)
      target = { x: 0, y: breathe }
      glance = glanceAt(input.clock)
      blink = blinkAmount(input.clock)
    }
  } else if (input.mode === 'to-lever' || input.mode === 'wander') {
    const u = clamp(input.t / WALK_DURATION, 0, 1)
    const frame = sampleWalk(u, 1)
    const travel = clamp(frame.x / distance, 0, 1)
    const rootX = input.mode === 'wander' ? REX_HOME : REX_HOME + frame.x * SCALE
    body = fromFrame(frame, rootX, travel)
    target = { x: frame.x, y: frame.y }
    glance = { x: 2.2, y: -0.4 }
  } else if (input.mode === 'from-lever') {
    const u = clamp(input.t / WALK_DURATION, 0, 1)
    const frame = sampleWalk(u, -1)
    const travel = clamp(frame.x / distance, 0, 1)
    body = fromFrame(frame, REX_LEVER - frame.x * SCALE, 1 - travel)
    target = { x: distance - frame.x, y: frame.y }
    glance = { x: -1.4, y: 0 }
  } else if (input.mode === 'pull') {
    const u = clamp(input.t / PULL, 0, 1)
    const reach = ease('inOut', Math.min(1, u / 0.62))
    const knob = knobLocal(input.lever)
    const crouch = Math.sin(u * Math.PI) * 2.4
    const lean = reach * 2.2
    body = {
      rootX: REX_LEVER + lean * SCALE,
      rootY: GROUND + crouch * SCALE,
      travel: 1,
      handLX: -HAND_DX - reach * 5,
      handLY: HAND_DY + reach * 6,
      handRX: HAND_DX + (knob.x - HAND_DX) * reach,
      handRY: HAND_DY + (knob.y - HAND_DY) * reach,
      footLX: -FOOT_DX,
      footLY: -DOT_R,
      footRX: FOOT_DX,
      footRY: -DOT_R,
      squash: 1 - Math.sin(u * Math.PI) * 0.07,
    }
    target = { x: distance + lean, y: crouch }
    glance = { x: 3.4 * reach, y: -1.2 * reach }
    hat = reach * 6
  } else if (input.mode === 'startled') {
    const pop = ease('out', clamp(input.t / 0.18, 0, 1))
    body = {
      rootX: REX_HOME - pop * 6,
      rootY: GROUND + pop * 3,
      travel: 0,
      handLX: -HAND_DX - pop * 8,
      handLY: HAND_DY - pop * 16,
      handRX: HAND_DX + pop * 8,
      handRY: HAND_DY - pop * 16,
      footLX: -FOOT_DX - pop * 2,
      footLY: -DOT_R,
      footRX: FOOT_DX + pop * 2,
      footRY: -DOT_R,
      squash: 1 - pop * 0.06,
    }
    target = { x: -pop * 2, y: pop }
    glance = { x: 6 * pop, y: 1.5 * pop }
    hat = -8 * pop
    blink = 0
  } else {
    const unknown: never = input.mode
    throw new Error(`unknown pose mode ${String(unknown)}`)
  }

  const spring = input.reduced ? settledSpring() : stepSpring(input.spring, target, input.dt)
  const dx = input.reduced ? 0 : clamp(spring.x - target.x, -3.8, 3.8)
  const dy = input.reduced ? 0 : clamp(spring.y - target.y, -5.4, 5.4)
  const eyeH = EYE_H * (1 - 0.86 * blink)
  const eyeX = dx + glance.x
  const eyeY = EYE_DY + dy + glance.y
  return {
    ...body,
    eyeLX: -EYE_DX + eyeX,
    eyeLY: eyeY,
    eyeRX: EYE_DX + eyeX,
    eyeRY: eyeY,
    eyeH,
    hatRot: input.reduced ? 0 : clamp(hat + spring.vx * 0.35 + glance.x * 0.4, -12, 12),
    spring: input.reduced ? settledSpring() : spring,
  }
}
