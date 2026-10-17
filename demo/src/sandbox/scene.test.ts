import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import SandboxScene from '@/components/SandboxScene.vue'
import { BREAK_BEAT, ITEM_GAP, PULL } from './layout'
import { WALK_DURATION, blinkCurve, framePose, settledSpring, stepSpring } from './motion'
import { createScene, pressItem, pressRex, rebuild, step, type Scene } from './scene'

function until(scene: Scene, pred: (current: Scene) => boolean, limit = 40): Scene {
  let current = scene
  let elapsed = 0
  while (!pred(current)) {
    current = step(current, 1 / 30)
    elapsed += 1 / 30
    if (elapsed > limit) throw new Error('timed out waiting for the sandbox')
  }
  return current
}

function startBelt(scene = createScene()): Scene {
  let current = pressRex(scene)
  current = step(current, WALK_DURATION + PULL + 0.02)
  if (!current.beltOn) throw new Error('belt did not start')
  return current
}

describe('rex sandbox', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('gate hero parts', () => {
    const wrapper = mount(SandboxScene)
    expect(wrapper.findAll('[data-test="rex-eye"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-test="rex-dot"]')).toHaveLength(4)
    expect(wrapper.find('[data-test="hard-hat"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="lever"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="belt"]').attributes('data-running')).toBe('no')
    expect(wrapper.find('[data-test="machine"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="grille"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="porthole"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="jail"]').exists()).toBe(true)
    const speech = wrapper.get('[data-test="speech-text"]').text().replace(/\s+/g, ' ').trim()
    expect(speech).toBe("i guess we sandboxin' now")
    expect(wrapper.find('video').exists()).toBe(false)
    const rex = wrapper.get('[data-test="rex"]')
    expect(rex.element.tagName).toBe('BUTTON')
    expect(rex.attributes('type')).toBe('button')
    expect(rex.attributes('aria-label')).toMatch(/Rex/)
    expect(wrapper.get('[data-test="sandbox-scene"]').attributes('data-belt')).toBe('off')
  })

  it('gate belt toggle', async () => {
    const wrapper = mount(SandboxScene)
    const rex = wrapper.get('[data-test="rex"]')
    expect(rex.attributes('aria-pressed')).toBe('false')
    await rex.trigger('click')
    expect(wrapper.get('[data-test="sandbox-scene"]').attributes('data-belt')).toBe('on')
    expect(wrapper.get('[data-test="lever"]').attributes('data-on')).toBe('yes')
    expect(rex.attributes('aria-pressed')).toBe('true')
    await rex.trigger('keydown', { key: 'Enter' })
    expect(wrapper.get('[data-test="sandbox-scene"]').attributes('data-belt')).toBe('off')
    await rex.trigger('keydown', { key: ' ' })
    expect(wrapper.get('[data-test="sandbox-scene"]').attributes('data-belt')).toBe('on')
    await wrapper.get('[data-test="lever-hit"]').trigger('click')
    expect(wrapper.get('[data-test="sandbox-scene"]').attributes('data-belt')).toBe('off')

    let scene = createScene()
    expect(scene.beltOn).toBe(false)
    expect(scene.lever).toBe(0)
    scene = pressRex(scene)
    scene = step(scene, WALK_DURATION)
    expect(scene.rex).toBe('pull')
    expect(scene.beltOn).toBe(false)
    const mid = step(scene, PULL / 2)
    expect(mid.beltOn).toBe(false)
    expect(mid.lever).toBeGreaterThan(0.4)
    expect(mid.lever).toBeLessThan(0.6)
    scene = step(scene, PULL)
    expect(scene.beltOn).toBe(true)
    expect(scene.lever).toBe(1)
    scene = step(scene, WALK_DURATION)
    expect(scene.rex).toBe('idle')
    const ignored = pressRex(pressRex(scene))
    const once = step(ignored, WALK_DURATION + PULL + WALK_DURATION)
    expect(once.beltOn).toBe(false)
    expect(once.lever).toBe(0)
    expect(once.rex).toBe('idle')
  })

  it('gate good and evil', () => {
    let scene = startBelt()
    scene = until(scene, current => current.exits.some(exit => exit.glyph === 'assign'))
    expect(scene.cages).toHaveLength(0)
    expect(scene.exits[0].glyph).toBe('assign')
    expect(scene.exits[0].glow).toBeGreaterThan(0)
    const before = scene
    scene = until(scene, current => current.cages.some(cage => cage.glyph === 'spike'))
    expect(scene.cages.map(cage => cage.glyph)).toEqual(['spike'])
    expect(scene.jolt).toBeGreaterThan(0.5)
    expect(scene.flash).toBeGreaterThan(0.5)
    expect(before.cages).toHaveLength(0)
    scene = until(scene, current => current.exits.some(exit => exit.glyph === 'dot') || current.cages.length > 1)
    scene = until(scene, current => current.cages.some(cage => cage.glyph === 'fuse'))
    expect(scene.cages.map(cage => cage.glyph)).toEqual(['spike', 'fuse'])
  })

  it('gate break and rebuild', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    let scene = startBelt()
    scene = until(scene, current => current.items.some(item => item.kind === 'evil' && item.progress > 0.2 && item.progress < 0.85))
    const evil = scene.items.find(item => item.kind === 'evil')
    if (!evil) throw new Error('missing evil glyph')
    const cages = scene.cages.length
    scene = pressItem(scene, evil.id)
    expect(scene.broken).toBe(true)
    expect(scene.beltOn).toBe(false)
    expect(scene.items.some(item => item.id === evil.id)).toBe(false)
    expect(scene.cages).toHaveLength(cages)
    expect(scene.showRebuild).toBe(false)
    scene = step(scene, BREAK_BEAT - 0.05)
    expect(scene.showRebuild).toBe(false)
    scene = step(scene, 0.06)
    expect(scene.showRebuild).toBe(true)
    expect(scene.rex).toBe('wander')
    const kept = scene.cages.length
    scene = rebuild(scene)
    expect(scene.broken).toBe(false)
    expect(scene.showRebuild).toBe(false)
    expect(scene.beltOn).toBe(false)
    expect(scene.lever).toBe(0)
    expect(scene.rex).toBe('idle')
    expect(scene.cages).toHaveLength(kept)
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
  })

  it('gate reduced scene', () => {
    let scene = createScene({ reduced: true })
    scene = pressRex(scene)
    expect(scene.beltOn).toBe(true)
    expect(scene.lever).toBe(1)
    expect(scene.rex).toBe('idle')
    scene = pressRex(scene)
    expect(scene.beltOn).toBe(false)
    expect(scene.lever).toBe(0)
    scene = pressRex(scene)
    scene = until(scene, current => current.items.some(item => item.kind === 'evil' && item.progress < 1))
    const evil = scene.items.find(item => item.kind === 'evil')
    if (!evil) throw new Error('missing evil glyph')
    scene = pressItem(scene, evil.id)
    expect(scene.broken).toBe(true)
    scene = step(scene, BREAK_BEAT)
    expect(scene.showRebuild).toBe(true)
    expect(scene.rex).toBe('idle')
    scene = rebuild(scene)
    expect(scene.broken).toBe(false)
    expect(scene.showRebuild).toBe(false)
  })

  it('gate motion', () => {
    expect(blinkCurve(0)).toBe(0)
    expect(blinkCurve(0.07)).toBe(1)
    expect(blinkCurve(0.1)).toBe(1)
    expect(blinkCurve(0.23)).toBe(0)
    expect(blinkCurve(0.04)).toBeGreaterThan(0)
    expect(blinkCurve(0.04)).toBeLessThan(1)
    expect(blinkCurve(0.16)).toBeGreaterThan(0)
    expect(blinkCurve(0.16)).toBeLessThan(1)

    const rest = framePose({ mode: 'idle', t: 0, clock: 0, lever: 0, reduced: true, spring: settledSpring(), dt: 0 })
    expect(rest.eyeH).toBe(22)
    expect(rest.eyeLX).toBeCloseTo(-10.5)
    expect(rest.eyeRX).toBeCloseTo(10.5)
    expect(rest.handLX).toBeCloseTo(-18)
    expect(rest.footLY).toBeCloseTo(-7)

    let lifted = false
    for (let i = 1; i < 12; i += 1) {
      const pose = framePose({
        mode: 'to-lever',
        t: WALK_DURATION * (i / 12),
        clock: 0,
        lever: 0,
        reduced: false,
        spring: settledSpring(),
        dt: 0,
      })
      if (pose.footLY < rest.footLY - 2 || pose.footRY < rest.footRY - 2) lifted = true
    }
    expect(lifted).toBe(true)
    expect(WALK_DURATION).toBeGreaterThan(0.7)
    expect(WALK_DURATION).toBeLessThan(2.6)

    const arrived = framePose({
      mode: 'to-lever',
      t: WALK_DURATION,
      clock: 0,
      lever: 0,
      reduced: false,
      spring: settledSpring(),
      dt: 0,
    })
    expect(arrived.travel).toBeGreaterThan(0.95)

    const sprung = stepSpring(settledSpring(), { x: 10, y: 0 }, 0.016)
    expect(sprung.x).toBeGreaterThan(0)
    expect(sprung.x).toBeLessThan(4)
  })

  it('stopped belt does not spawn', () => {
    const scene = step(createScene(), 5)
    expect(scene.items).toHaveLength(0)
    expect(scene.exits).toHaveLength(0)
    expect(scene.cages).toHaveLength(0)
  })

  it('items keep their gap', () => {
    const scene = step(startBelt(), 6)
    const progress = scene.items.map(item => item.progress).sort((a, b) => b - a)
    expect(progress.length).toBeGreaterThan(1)
    for (let i = 1; i < progress.length; i += 1) {
      expect(progress[i - 1] - progress[i]).toBeGreaterThanOrEqual(ITEM_GAP - 0.02)
    }
  })

  it('a good click glows', () => {
    let scene = startBelt()
    scene = until(scene, current => current.items.some(item => item.kind === 'good'))
    const good = scene.items.find(item => item.kind === 'good')
    if (!good) throw new Error('missing good glyph')
    scene = pressItem(scene, good.id)
    expect(scene.broken).toBe(false)
    expect(scene.items.find(item => item.id === good.id)?.glow).toBeGreaterThan(0)
    scene = pressItem(scene, 999)
    expect(scene.broken).toBe(false)
  })

  it('rebuild does nothing when the page is whole', () => {
    const scene = createScene()
    expect(rebuild(scene)).toBe(scene)
  })

  it('negative dt throws', () => {
    expect(() => step(createScene(), -0.1)).toThrow(/dt/)
    expect(() => step(createScene(), Number.NaN)).toThrow(/dt/)
  })

  it('an object inside the machine is not on the belt', () => {
    const scene = until(startBelt(), current => current.processing !== null)
    expect(scene.processing).not.toBeNull()
    expect(scene.items.some(item => item.id === scene.processing?.id)).toBe(false)
    const missed = pressItem(scene, scene.processing?.id ?? -1)
    expect(missed.broken).toBe(false)
  })
})
