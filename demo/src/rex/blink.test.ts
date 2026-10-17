import { readFileSync } from 'node:fs'
import { compileStyle, parse } from '@vue/compiler-sfc'
import { describe, expect, it } from 'vitest'
import { MARK, easeToward, reachPose } from '@/rex/geometry.mjs'

describe('header blink', () => {
  it('blinks the eyes instead of scaling the button', () => {
    const source = readFileSync('src/components/Mark.vue', 'utf8')
    const parsed = parse(source)
    expect(parsed.errors, parsed.errors.map(error => error.message).join('\n')).toEqual([])
    const css = parsed.descriptor.styles.map(style => compileStyle({
      source: style.content,
      filename: 'Mark.vue',
      id: 'data-v-test',
      scoped: Boolean(style.scoped),
    }).code).join('\n')
    expect(css).toMatch(/button:hover[^{]*\.rex-eye[^{]*\{[^}]*rex-blink/)
    expect(css).toMatch(/button:focus-visible[^{]*\.rex-eye[^{]*\{[^}]*rex-blink/)
    expect(css).not.toMatch(/button:hover\s*,\s*button:focus-visible\s*\{/)
    expect(css).toContain('scaleY(0.14)')
    expect(css).toContain('animation: none')
  })

  it('keeps the reach continuous as the pointer crosses Rex', () => {
    const dt = 1 / 60
    let handLX = -MARK.handDx
    let handLY = MARK.handDy
    let handRX = MARK.handDx
    let handRY = MARK.handDy
    let eyeX = 0
    let eyeY = 0
    for (let x = -80; x <= 80; x += 4) {
      const target = reachPose({ pointer: { x, y: -33 }, distancePx: 36, reduced: false, touch: false })
      const next = {
        handLX: easeToward(handLX, target.handLX, dt),
        handLY: easeToward(handLY, target.handLY, dt),
        handRX: easeToward(handRX, target.handRX, dt),
        handRY: easeToward(handRY, target.handRY, dt),
        eyeX: easeToward(eyeX, target.eyeX, dt),
        eyeY: easeToward(eyeY, target.eyeY, dt),
      }
      for (const value of Object.values(next)) {
        expect(Number.isFinite(value)).toBe(true)
      }
      expect(Math.abs(next.handLX - handLX)).toBeLessThan(8)
      expect(Math.abs(next.handRX - handRX)).toBeLessThan(8)
      expect(Math.abs(next.handLY - handLY)).toBeLessThan(8)
      expect(Math.abs(next.handRY - handRY)).toBeLessThan(8)
      expect(Math.hypot(next.eyeX - eyeX, next.eyeY - eyeY)).toBeLessThan(8)
      handLX = next.handLX
      handLY = next.handLY
      handRX = next.handRX
      handRY = next.handRY
      eyeX = next.eyeX
      eyeY = next.eyeY
    }
    expect(handLX).toBeLessThan(0)
    expect(handRX).toBeGreaterThan(0)
  })
})
