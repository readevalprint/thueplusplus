import { describe, expect, it } from 'vitest'
import { EYE_H, actPose, settledSpring, type PoseMode } from './motion'
import { REX_HOME } from '@/sandbox/layout'
import { framePose } from '@/sandbox/motion'

const modes: PoseMode[] = ['cheer', 'facepalm', 'duck', 'offer', 'search', 'read']

describe('page acts', () => {
  it('holds a distinct still pose when motion is reduced', () => {
    const hands = new Set<string>()
    for (const mode of modes) {
      const pose = actPose({ mode, clock: 1.2, reduced: true, spring: settledSpring(), dt: 0.016 })
      expect(pose.eyeH).toBe(EYE_H)
      expect(pose.hatRot).toBe(0)
      hands.add([pose.handLX, pose.handLY, pose.handRX, pose.handRY, pose.rootY, pose.squash].join(','))
    }
    expect(hands.size).toBe(modes.length)
  })

  it('closes the eyes on a blink and keeps them open when reduced', () => {
    const moving = actPose({ mode: 'read', clock: 2.24, reduced: false, spring: settledSpring(), dt: 0.016 })
    const still = actPose({ mode: 'read', clock: 2.24, reduced: true, spring: settledSpring(), dt: 0.016 })
    expect(moving.eyeH).toBeLessThan(EYE_H)
    expect(still.eyeH).toBe(EYE_H)
  })

  it('rejects an unknown act', () => {
    expect(() => actPose({ mode: 'leap' as PoseMode, clock: 0, reduced: true, spring: settledSpring(), dt: 0 })).toThrow(/unknown pose mode/)
  })

  it('keeps the home poster still for every sandbox mode', () => {
    for (const mode of ['idle', 'to-lever', 'pull', 'from-lever', 'startled', 'wander'] as const) {
      const pose = framePose({ mode, t: 0.4, clock: 2, lever: 0.8, reduced: true, spring: settledSpring(), dt: 0.016 })
      expect(pose.rootX).toBe(REX_HOME)
      expect(pose.eyeH).toBe(EYE_H)
      expect(pose.hatRot).toBe(0)
    }
  })
})
