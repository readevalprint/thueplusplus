import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DOT_R, HAND_DY } from '@/rex/motion'
import { difficulty, scoreJump } from './game'
import {
  BELT_TOP,
  GROUND,
  SCALE,
  scoreFlashRadius,
  scoreLabelBottom,
  scoreNumberCenterY,
  scoreNumberTop,
} from './layout'

const beltSurface = BELT_TOP - 14

describe('hero polish', () => {
  it('grounds rex behind the belt', () => {
    const handBottom = GROUND + (HAND_DY + DOT_R) * SCALE
    const footTop = GROUND + (-DOT_R - DOT_R) * SCALE
    expect(footTop).toBeGreaterThan(beltSurface + 12)
    expect(handBottom).toBeGreaterThan(beltSurface)
    expect(handBottom).toBeLessThan(beltSurface + 20)
    const scene = readFileSync('src/components/SandboxScene.vue', 'utf8')
    expect(scene.indexOf('data-test="rex-mark"')).toBeLessThan(scene.indexOf('data-test="belt"'))
  })

  it('keeps the score label clear of the flash', () => {
    const peak = scoreJump(0.84, 12, difficulty(40, false).beltRate, false)
    expect(peak.scale).toBeGreaterThan(2)
    expect(scoreNumberTop(peak.scale)).toBeGreaterThan(scoreLabelBottom() + 6)
    const top = scoreNumberCenterY() - scoreFlashRadius(peak.scale, peak.flash)
    expect(top).toBeGreaterThan(scoreLabelBottom() + 4)
    const scene = readFileSync('src/components/SandboxScene.vue', 'utf8')
    const jump = scene.indexOf('data-test="score-jump"')
    const label = scene.indexOf('data-test="score-label"')
    expect(jump).toBeGreaterThan(0)
    expect(label).toBeGreaterThan(jump)
    expect(scene.slice(jump, label)).not.toContain('score-label')
  })

  it('pauses animation frames while hidden', () => {
    const scene = readFileSync('src/components/SandboxScene.vue', 'utf8')
    const rex = readFileSync('src/rex/useRex.ts', 'utf8')
    for (const source of [scene, rex]) {
      expect(source).toContain('document.hidden')
      expect(source).toContain("addEventListener('visibilitychange'")
      const hidden = source.slice(source.indexOf('document.hidden'))
      expect(hidden).toContain('return')
    }
  })
})
