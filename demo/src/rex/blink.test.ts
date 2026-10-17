import { readFileSync } from 'node:fs'
import { compileStyle, parse } from '@vue/compiler-sfc'
import { mount } from '@vue/test-utils'
import { nextTick } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'
import { afterEach, describe, expect, it } from 'vitest'
import SiteHeader from '@/components/SiteHeader.vue'
import Mark from '@/components/Mark.vue'
import { MARK, easeToward, hatShape, reachPose } from '@/rex/geometry.mjs'
import { hat, reach, resetMascot, swap, swapT, type HatSwap } from '@/rex/mascot'
import { setTheme } from '@/theme'

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

  it('does not mirror when the pointer crosses Rex', async () => {
    localStorage.removeItem('rex-hat')
    resetMascot()
    const wrapper = mount(Mark)
    const shape = hatShape(hat.value)
    let prevL = 0
    let prevR = 0
    let prevRadiusL = 0
    let prevRadiusR = 0
    let started = false
    let leftWhenPointerIsLeft = 0
    let rightWhenPointerIsLeft = 0
    let leftWhenPointerIsRight = 0
    let rightWhenPointerIsRight = 0
    for (let x = -80; x <= 80; x += 4) {
      const target = reachPose({ pointer: { x, y: -33 }, distancePx: 36, reduced: false, touch: false })
      if (started) {
        // A snapped hand is a jump of about 15. The smooth handoff stays under 6.
        expect(Math.abs(target.handLX - prevL)).toBeLessThan(6)
        expect(Math.abs(target.handRX - prevR)).toBeLessThan(6)
        expect(Math.abs(target.radiusL - prevRadiusL)).toBeLessThan(0.6)
        expect(Math.abs(target.radiusR - prevRadiusR)).toBeLessThan(0.6)
      }
      expect(target.handLX).toBeLessThan(0)
      expect(target.handRX).toBeGreaterThan(0)
      expect(Math.abs(target.eyeX)).toBeLessThan(MARK.eyeDx)
      const side = target.side === 'left' || target.side === 'right' ? target.side : 'none'
      reach.value = {
        side,
        handLX: target.handLX,
        handLY: target.handLY,
        handRX: target.handRX,
        handRY: target.handRY,
        eyeX: target.eyeX,
        eyeY: target.eyeY,
        radiusL: target.radiusL,
        radiusR: target.radiusR,
      }
      await nextTick()
      const transforms = wrapper.findAll('g').map(node => node.attributes('transform') ?? '')
      for (const transform of transforms) {
        const scales = [...transform.matchAll(/scale\(([^)]+)\)/g)]
        for (const match of scales) {
          for (const part of match[1].trim().split(/[\s,]+/)) {
            expect(Number(part)).toBeGreaterThan(0)
          }
        }
        expect(transform).not.toMatch(/scaleX\(\s*-/)
      }
      const eyes = wrapper.findAll('[data-test="rex-eye"]')
      const leftEye = Number(eyes[0].attributes('x')) + MARK.eyeW / 2
      const rightEye = Number(eyes[1].attributes('x')) + MARK.eyeW / 2
      expect(leftEye).toBeLessThan(0)
      expect(rightEye).toBeGreaterThan(0)
      const dots = wrapper.findAll('[data-test="rex-dot"]')
      expect(Number(dots[0].attributes('cx'))).toBeLessThan(0)
      expect(Number(dots[1].attributes('cx'))).toBeGreaterThan(0)
      const worn = wrapper.get('[data-hat]')
      const tilt = Number(worn.attributes('data-tilt'))
      const offsetX = Number(worn.attributes('data-offset-x'))
      expect(Math.sign(tilt)).toBe(Math.sign(shape.tilt))
      expect(tilt).toBeCloseTo(shape.tilt)
      expect(Math.sign(offsetX)).toBe(Math.sign(shape.offset.x))
      expect(offsetX).toBeCloseTo(shape.offset.x)
      if (x === -40) {
        leftWhenPointerIsLeft = target.radiusL
        rightWhenPointerIsLeft = target.radiusR
      }
      if (x === 40) {
        leftWhenPointerIsRight = target.radiusL
        rightWhenPointerIsRight = target.radiusR
      }
      started = true
      prevL = target.handLX
      prevR = target.handRX
      prevRadiusL = target.radiusL
      prevRadiusR = target.radiusR
    }
    expect(leftWhenPointerIsLeft).toBeGreaterThan(rightWhenPointerIsLeft)
    expect(rightWhenPointerIsRight).toBeGreaterThan(leftWhenPointerIsRight)
    expect(leftWhenPointerIsRight).toBeLessThan(leftWhenPointerIsLeft)
    expect(rightWhenPointerIsRight).toBeGreaterThan(rightWhenPointerIsLeft)
    wrapper.unmount()
  })
})

function media(matches: boolean): MediaQueryList {
  return {
    matches,
    media: '',
    onchange: null,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() { return false },
  }
}

describe('header theme swap', () => {
  afterEach(() => {
    resetMascot()
    localStorage.removeItem('theme')
    document.documentElement.classList.add('dark')
    document.documentElement.style.colorScheme = ''
    document.documentElement.style.backgroundColor = ''
    document.documentElement.style.color = ''
    window.matchMedia = (query: string) => media(query.includes('prefers-reduced-motion'))
  })

  it('keeps Rex rendered when the theme changes mid-swap', async () => {
    window.matchMedia = () => media(false)
    resetMascot()
    const motion: HatSwap = { from: 'hard', to: 'top', side: 'right', started: performance.now() }
    swap.value = motion
    swapT.value = 0.4
    const router = createRouter({
      history: createMemoryHistory(),
      routes: ['/', '/install', '/docs', '/problems', '/contribute'].map(path => ({
        path,
        component: { template: '<div />' },
      })),
    })
    const wrapper = mount(SiteHeader, { attachTo: document.body, global: { plugins: [router] } })
    await router.isReady()
    const svg = wrapper.get('[data-test="header-mark"]').element
    expect(wrapper.find('[data-hat="hard"]').exists()).toBe(true)
    expect(wrapper.find('[data-hat="top"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="rex-eye"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-test="rex-dot"]')).toHaveLength(4)
    setTheme('light')
    await nextTick()
    expect(wrapper.get('[data-test="header-mark"]').element).toBe(svg)
    expect(svg.isConnected).toBe(true)
    expect(wrapper.find('[data-hat="hard"]').exists()).toBe(true)
    expect(wrapper.find('[data-hat="top"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="rex-eye"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-test="rex-dot"]')).toHaveLength(4)
    expect(swapT.value).toBe(0.4)
    expect(swap.value?.from).toBe('hard')
    expect(swap.value?.to).toBe('top')
    expect(swap.value?.side).toBe('right')
    setTheme('dark')
    await nextTick()
    expect(wrapper.get('[data-test="header-mark"]').element).toBe(svg)
    expect(svg.isConnected).toBe(true)
    expect(wrapper.find('[data-hat="hard"]').exists()).toBe(true)
    expect(wrapper.find('[data-hat="top"]').exists()).toBe(true)
    wrapper.unmount()
  })
})
