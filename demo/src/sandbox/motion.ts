/**
 * Poses for the home sandbox scene: idle, the walk to the lever, the pull, and the startle.
 * The belt and these poses are this scene. Replacing the home game replaces this module.
 */

import {
  GROUND,
  PULL,
  REX_HOME,
  REX_LEVER,
  SCALE,
  leverKnob,
  walkDistance,
} from './layout'
import {
  DOT_R,
  FOOT_DX,
  HAND_DX,
  HAND_DY,
  blinkAmount,
  blinkCurve,
  bodyFromWalk,
  buildWalk,
  clamp,
  ease,
  finishPose,
  glanceAt,
  mirrorWalk,
  restLimbs,
  settledSpring,
  stepSpring,
  type Body,
  type Pose,
  type Spring,
} from '@/rex/motion'

export { blinkCurve, settledSpring, stepSpring }
export type { Pose, Spring }

const distance = walkDistance()
const WALK = buildWalk(distance)
export const WALK_DURATION = WALK.duration

export type PoseMode = 'idle' | 'to-lever' | 'pull' | 'from-lever' | 'startled' | 'wander'

export interface PoseInput {
  mode: PoseMode
  t: number
  clock: number
  lever: number
  reduced: boolean
  spring: Spring
  dt: number
}

function rest(rootX: number, rootY: number, squash: number): Body {
  return { rootX, rootY, travel: 0, squash, ...restLimbs() }
}

function sampleWalk(u: number, dir: 1 | -1) {
  const frame = WALK.at(clamp(u, 0, 1) * WALK.duration)
  return dir === 1 ? frame : mirrorWalk(frame)
}

function knobLocal(lever: number): { x: number, y: number } {
  const knob = leverKnob(lever)
  return { x: (knob.x - REX_LEVER) / SCALE, y: (knob.y - GROUND) / SCALE }
}

export function framePose(input: PoseInput): Pose {
  if (input.reduced) {
    return finishPose(rest(REX_HOME, GROUND, 1), { x: 0, y: 0 }, { x: 0, y: 0 }, 0, 0, settledSpring(), 0, true)
  }

  let body = rest(REX_HOME, GROUND, 1)
  let target = { x: 0, y: 0 }
  let glance = { x: 0, y: 0 }
  let blink = 0
  let hat = 0

  if (input.mode === 'idle') {
    const breathe = Math.sin(input.clock * 1.7) * 0.45
    body = rest(REX_HOME, GROUND + breathe * SCALE, 1 - Math.max(0, breathe) * 0.02)
    target = { x: 0, y: breathe }
    glance = glanceAt(input.clock)
    blink = blinkAmount(input.clock)
  } else if (input.mode === 'to-lever' || input.mode === 'wander') {
    const u = clamp(input.t / WALK_DURATION, 0, 1)
    const frame = sampleWalk(u, 1)
    const travel = clamp(frame.x / distance, 0, 1)
    const rootX = input.mode === 'wander' ? REX_HOME : REX_HOME + frame.x * SCALE
    body = bodyFromWalk(frame, rootX, GROUND + frame.y * SCALE, travel)
    target = { x: frame.x, y: frame.y }
    glance = { x: 2.2, y: -0.4 }
  } else if (input.mode === 'from-lever') {
    const u = clamp(input.t / WALK_DURATION, 0, 1)
    const frame = sampleWalk(u, -1)
    const travel = clamp(frame.x / distance, 0, 1)
    body = bodyFromWalk(frame, REX_LEVER - frame.x * SCALE, GROUND + frame.y * SCALE, 1 - travel)
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
  } else {
    const unknown: never = input.mode
    throw new Error(`unknown pose mode ${String(unknown)}`)
  }

  return finishPose(body, target, glance, blink, hat, input.spring, input.dt, false)
}
