/**
 * Poses for the home lever game: idle, the walk to the lever, the ready stance,
 * the yank, the cheer, the nervous glance, and the startle.
 * The belt and these poses are this scene. The shared Rex drawing is not.
 */

import {
  CHEER,
  GROUND,
  REX_HOME,
  REX_LEVER,
  SCALE,
  YANK,
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

export const POSE_MODES = ['idle', 'to-lever', 'ready', 'yank', 'cheer', 'nervous', 'startled'] as const
export type PoseMode = (typeof POSE_MODES)[number]

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

function sampleWalk(u: number) {
  return WALK.at(clamp(u, 0, 1) * WALK.duration)
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
  } else if (input.mode === 'to-lever') {
    const u = clamp(input.t / WALK_DURATION, 0, 1)
    const frame = sampleWalk(u)
    const travel = clamp(frame.x / distance, 0, 1)
    body = bodyFromWalk(frame, REX_HOME + frame.x * SCALE, GROUND + frame.y * SCALE, travel)
    target = { x: frame.x, y: frame.y }
    glance = { x: 2.2, y: -0.4 }
  } else if (input.mode === 'ready') {
    const breathe = Math.sin(input.clock * 1.7) * 0.35
    const knob = knobLocal(0)
    const reach = 0.42
    body = {
      rootX: REX_LEVER,
      rootY: GROUND + breathe * SCALE,
      travel: 1,
      handLX: -HAND_DX,
      handLY: HAND_DY + breathe,
      handRX: HAND_DX + (knob.x - HAND_DX) * reach,
      handRY: HAND_DY + (knob.y - HAND_DY) * reach,
      footLX: -FOOT_DX,
      footLY: -DOT_R,
      footRX: FOOT_DX,
      footRY: -DOT_R,
      squash: 1 - Math.max(0, breathe) * 0.02,
    }
    target = { x: distance, y: breathe }
    glance = { x: 3.2, y: -0.4 }
    blink = blinkAmount(input.clock)
  } else if (input.mode === 'yank') {
    const u = clamp(input.t / YANK, 0, 1)
    const reach = ease('out', Math.min(1, u / 0.34))
    const knob = knobLocal(input.lever)
    const crouch = Math.sin(Math.min(1, u) * Math.PI) * 1.6
    body = {
      rootX: REX_LEVER + reach * 4,
      rootY: GROUND + crouch * SCALE,
      travel: 1,
      handLX: -HAND_DX - reach * 4,
      handLY: HAND_DY + reach * 4,
      handRX: HAND_DX + (knob.x - HAND_DX) * reach,
      handRY: HAND_DY + (knob.y - HAND_DY) * reach,
      footLX: -FOOT_DX,
      footLY: -DOT_R,
      footRX: FOOT_DX,
      footRY: -DOT_R,
      squash: 1 - Math.sin(Math.min(1, u) * Math.PI) * 0.06,
    }
    target = { x: distance + reach, y: crouch }
    glance = { x: 3.6 * reach, y: -1.1 * reach }
    hat = reach * 7
  } else if (input.mode === 'cheer') {
    const u = clamp(input.t / CHEER, 0, 1)
    const hop = Math.sin(Math.min(1, u / 0.42) * Math.PI)
    body = {
      rootX: REX_LEVER,
      rootY: GROUND - hop * 14,
      travel: 1,
      handLX: -HAND_DX - 8,
      handLY: HAND_DY - 28 * ease('out', Math.min(1, u / 0.25)),
      handRX: HAND_DX + 8,
      handRY: HAND_DY - 28 * ease('out', Math.min(1, u / 0.25)),
      footLX: -FOOT_DX,
      footLY: -DOT_R,
      footRX: FOOT_DX,
      footRY: -DOT_R,
      squash: 1 - hop * 0.08,
    }
    target = { x: distance, y: -hop * 4 }
    glance = { x: 1.2, y: -3.4 * hop }
    hat = -8 * hop
  } else if (input.mode === 'nervous') {
    const wobble = Math.sin(input.clock * 14) * 1.4
    body = {
      rootX: REX_LEVER + wobble,
      rootY: GROUND + 2,
      travel: 1,
      handLX: -HAND_DX - 3,
      handLY: HAND_DY - 6,
      handRX: HAND_DX + 2,
      handRY: HAND_DY - 4,
      footLX: -FOOT_DX - 1,
      footLY: -DOT_R,
      footRX: FOOT_DX + 1,
      footRY: -DOT_R,
      squash: 1.04,
    }
    target = { x: distance + wobble / SCALE, y: 1 }
    glance = { x: 6.4, y: 1.2 }
    hat = -4
  } else if (input.mode === 'startled') {
    const pop = ease('out', clamp(input.t / 0.18, 0, 1))
    body = {
      rootX: REX_LEVER - pop * 10,
      rootY: GROUND + pop * 3,
      travel: 1,
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
    target = { x: distance - pop * 2, y: pop }
    glance = { x: 6 * pop, y: 1.5 * pop }
    hat = -8 * pop
  } else {
    const unknown: never = input.mode
    throw new Error(`unknown pose mode ${String(unknown)}`)
  }

  return finishPose(body, target, glance, blink, hat, input.spring, input.dt, false)
}
