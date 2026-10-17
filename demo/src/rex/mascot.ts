/**
 * One pointer listener and one animation frame for the header mascot.
 * The worn hat is shared with every Rex figure.
 */

import { ref } from 'vue'
import { settledSpring, type Pose } from '@/rex/motion'
import {
  HAT_IDS,
  MARK,
  SWAP_MS,
  easeToward,
  isHatId,
  loadHat,
  nextHatId,
  pullHand,
  reachPose,
  saveHat,
  viewBoxFor,
} from '@/rex/geometry.mjs'

export type HatId = (typeof HAT_IDS)[number]

export interface ReachState {
  side: 'left' | 'right' | 'none'
  handLX: number
  handLY: number
  handRX: number
  handRY: number
  eyeX: number
  eyeY: number
  radiusL: number
  radiusR: number
}

export interface HatSwap {
  from: HatId
  to: HatId
  side: 'left' | 'right'
  started: number
}

const REACH_RATE = 14

function assertHat(id: string): HatId {
  if (!isHatId(id)) throw new Error(`unknown hat ${id}`)
  return id
}

function initialHat(): HatId {
  if (typeof localStorage === 'undefined') return 'hard'
  return assertHat(loadHat(localStorage))
}

export function restReach(): ReachState {
  return {
    side: 'none',
    handLX: -MARK.handDx,
    handLY: MARK.handDy,
    handRX: MARK.handDx,
    handRY: MARK.handDy,
    eyeX: 0,
    eyeY: 0,
    radiusL: MARK.dotR,
    radiusR: MARK.dotR,
  }
}

export const hat = ref<HatId>(initialHat())
export const swap = ref<HatSwap | null>(null)
export const swapT = ref(0)
export const reach = ref<ReachState>(restReach())

let bound = false
let raf = 0
let running = false
let last = 0
let aim: { clientX: number, clientY: number } | null = null
let touch = false

export function prefersReduced(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

function reachSideOf(side: string): ReachState['side'] {
  if (side === 'left' || side === 'right' || side === 'none') return side
  throw new Error(`unknown reach side ${side}`)
}

function poseToReach(pose: ReturnType<typeof reachPose>): ReachState {
  return {
    side: reachSideOf(pose.side),
    handLX: pose.handLX,
    handLY: pose.handLY,
    handRX: pose.handRX,
    handRY: pose.handRY,
    eyeX: pose.eyeX,
    eyeY: pose.eyeY,
    radiusL: pose.radiusL,
    radiusR: pose.radiusR,
  }
}

function mapAim(point: { clientX: number, clientY: number }): { pointer: { x: number, y: number }, distancePx: number } | null {
  const svg = document.querySelector('[data-test="header-mark"]')
  if (!(svg instanceof SVGSVGElement)) return null
  const rect = svg.getBoundingClientRect()
  if (rect.width <= 0 || rect.height <= 0) return null
  const box = viewBoxFor('header')
  return {
    pointer: {
      x: box.x + ((point.clientX - rect.left) / rect.width) * box.w,
      y: box.y + ((point.clientY - rect.top) / rect.height) * box.h,
    },
    distancePx: Math.hypot(point.clientX - (rect.left + rect.width / 2), point.clientY - (rect.top + rect.height / 2)),
  }
}

function reachTarget(reduced: boolean): ReachState {
  if (reduced || touch || !aim) return restReach()
  const mapped = mapAim(aim)
  if (!mapped) return restReach()
  return poseToReach(reachPose({
    pointer: mapped.pointer,
    distancePx: mapped.distancePx,
    reduced: false,
    touch: false,
  }))
}

function easeReach(current: ReachState, target: ReachState, dt: number): ReachState {
  return {
    side: target.side,
    handLX: easeToward(current.handLX, target.handLX, dt, REACH_RATE),
    handLY: easeToward(current.handLY, target.handLY, dt, REACH_RATE),
    handRX: easeToward(current.handRX, target.handRX, dt, REACH_RATE),
    handRY: easeToward(current.handRY, target.handRY, dt, REACH_RATE),
    eyeX: easeToward(current.eyeX, target.eyeX, dt, REACH_RATE),
    eyeY: easeToward(current.eyeY, target.eyeY, dt, REACH_RATE),
    radiusL: easeToward(current.radiusL, target.radiusL, dt, REACH_RATE),
    radiusR: easeToward(current.radiusR, target.radiusR, dt, REACH_RATE),
  }
}

function settled(current: ReachState, target: ReachState): boolean {
  const fields: (keyof ReachState)[] = ['handLX', 'handLY', 'handRX', 'handRY', 'eyeX', 'eyeY', 'radiusL', 'radiusR']
  return fields.every(field => {
    const left = current[field]
    const right = target[field]
    return typeof left === 'number' && typeof right === 'number' && Math.abs(left - right) < 0.05
  })
}

/** Advance the shared hat swap and the header reach. Hidden tabs do not move. */
export function stepMascot(dt: number, now: number, hidden = false): void {
  if (hidden || document.hidden) return
  const reduced = prefersReduced()
  if (swap.value && (reduced || (now - swap.value.started) / SWAP_MS >= 1)) {
    hat.value = swap.value.to
    swap.value = null
    swapT.value = 0
  } else if (swap.value) {
    swapT.value = (now - swap.value.started) / SWAP_MS
  }
  if (reduced || touch) {
    reach.value = restReach()
    return
  }
  const target = reachTarget(reduced)
  if (dt > 0) reach.value = easeReach(reach.value, target, dt)
}

function busy(): boolean {
  if (swap.value) return true
  return !settled(reach.value, reachTarget(prefersReduced()))
}

function tick(now: number): void {
  if (document.hidden) {
    running = false
    return
  }
  const dt = last === 0 ? 0 : Math.min(0.05, (now - last) / 1000)
  last = now
  stepMascot(dt, now, false)
  if (busy()) raf = requestAnimationFrame(tick)
  else running = false
}

function wake(): void {
  if (import.meta.env.MODE === 'test') return
  if (document.hidden) return
  if (running) return
  running = true
  last = 0
  raf = requestAnimationFrame(tick)
}

function onPointer(event: PointerEvent): void {
  if (event.pointerType === 'touch') {
    touch = true
    aim = null
    reach.value = restReach()
    return
  }
  touch = false
  aim = { clientX: event.clientX, clientY: event.clientY }
  wake()
}

function onLeave(): void {
  aim = null
  wake()
}

function onVisibility(): void {
  if (document.hidden) {
    cancelAnimationFrame(raf)
    running = false
    aim = null
    return
  }
  wake()
}

/** One window pointer listener for the life of the page. */
export function bindMascot(): void {
  if (bound || typeof window === 'undefined') return
  bound = true
  window.addEventListener('pointermove', onPointer, { passive: true })
  document.documentElement.addEventListener('pointerleave', onLeave)
  document.addEventListener('visibilitychange', onVisibility)
}

/** Store the next hat and play the tuck, or swap immediately when motion is reduced. */
export function swapHat(side: 'left' | 'right' = 'right'): HatId {
  const from = swap.value ? swap.value.to : hat.value
  const to = assertHat(nextHatId(from))
  saveHat(localStorage, to)
  if (prefersReduced()) {
    hat.value = to
    swap.value = null
    swapT.value = 0
    return to
  }
  swap.value = { from, to, side, started: performance.now() }
  swapT.value = 0
  wake()
  return to
}

export function headerPose(): Pose {
  const live = reach.value
  const motion = swap.value
  const pulling = motion !== null && !prefersReduced()
  const pose: Pose = {
    rootX: 0,
    rootY: 0,
    travel: 0,
    eyeLX: -MARK.eyeDx + (pulling ? 0 : live.eyeX),
    eyeLY: MARK.eyeDy + (pulling ? 0 : live.eyeY),
    eyeRX: MARK.eyeDx + (pulling ? 0 : live.eyeX),
    eyeRY: MARK.eyeDy + (pulling ? 0 : live.eyeY),
    eyeH: MARK.eyeH,
    handLX: pulling ? -MARK.handDx : live.handLX,
    handLY: pulling ? MARK.handDy : live.handLY,
    handRX: pulling ? MARK.handDx : live.handRX,
    handRY: pulling ? MARK.handDy : live.handRY,
    footLX: -MARK.footDx,
    footLY: -MARK.dotR,
    footRX: MARK.footDx,
    footRY: -MARK.dotR,
    squash: 1,
    hatRot: 0,
    spring: settledSpring(),
  }
  if (motion && pulling) {
    const rest = motion.side === 'left'
      ? { x: -MARK.handDx, y: MARK.handDy }
      : { x: MARK.handDx, y: MARK.handDy }
    const hand = pullHand(swapT.value, rest)
    if (motion.side === 'left') {
      pose.handLX = hand.x
      pose.handLY = hand.y
    } else {
      pose.handRX = hand.x
      pose.handRY = hand.y
    }
  }
  return pose
}

export function reachSide(): 'left' | 'right' | 'none' {
  if (swap.value && !prefersReduced()) return swap.value.side
  return reach.value.side
}

/** Each hand eases its own stretch, so the reach can cross Rex without a snap. */
export function reachRadiusFor(side: 'left' | 'right'): number {
  if (swap.value && !prefersReduced()) return swap.value.side === side ? MARK.dotR * 1.12 : MARK.dotR
  return side === 'left' ? reach.value.radiusL : reach.value.radiusR
}

export function resetMascot(): void {
  cancelAnimationFrame(raf)
  running = false
  last = 0
  aim = null
  touch = false
  hat.value = assertHat(loadHat(localStorage))
  swap.value = null
  swapT.value = 0
  reach.value = restReach()
}
