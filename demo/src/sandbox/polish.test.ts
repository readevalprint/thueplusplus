import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DOT_R } from '@/rex/motion'
import { difficulty, scoreJump } from './game'
import {
  BELT_BOTTOM,
  GROUND,
  SCALE,
  VIEW_H,
  beltPoint,
  scoreFlashRadius,
  scoreLabelBottom,
  scoreNumberCenterY,
  scoreNumberTop,
} from './layout'

describe('hero polish', () => {
  it('grounds rex behind the belt with his feet showing', () => {
    const footTop = GROUND + (-DOT_R - DOT_R) * SCALE
    const footBottom = GROUND
    expect(footTop).toBeGreaterThan(BELT_BOTTOM)
    expect(footBottom).toBeLessThan(VIEW_H)
    expect(beltPoint(0).x).toBeGreaterThan(beltPoint(1).x)
    const scene = readFileSync('src/components/SandboxScene.vue', 'utf8')
    expect(scene.indexOf('data-test="floor"')).toBeLessThan(scene.indexOf('<Rex'))
    expect(scene.indexOf('<Rex')).toBeLessThan(scene.indexOf('data-test="belt"'))
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
