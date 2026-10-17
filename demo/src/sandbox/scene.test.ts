import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SandboxScene from '@/components/SandboxScene.vue'
import { BELT_TOP, VIEW_W, beltPoint, scannerAperture, walkDistance } from './layout'
import { difficulty } from './game'
import { WALK_DURATION, blinkCurve, framePose, settledSpring, stepSpring } from './motion'
import { inZone, type Game } from './game'

interface Exposed {
  game: Game
  advance: (dt: number) => void
}

function exposed(wrapper: VueWrapper): Exposed {
  return wrapper.vm as unknown as Exposed
}

function mountScene(): VueWrapper {
  return mount(SandboxScene, { attachTo: document.body })
}

function canAct(game: Game): boolean {
  return game.cooldown === 0 && game.rex !== 'yank' && game.rex !== 'cheer' && game.rex !== 'to-lever'
}

async function scoreZoned(wrapper: VueWrapper, api: Exposed): Promise<void> {
  await missUntilZone(wrapper, api)
  let guard = 0
  while (!canAct(api.game) && guard < 90) {
    api.advance(1 / 30)
    guard += 1
  }
  if (!canAct(api.game) || !api.game.boxes.some(box => inZone(box.progress, api.game.score, true))) {
    throw new Error('scanner window closed before the pull')
  }
  await wrapper.get('[data-test="lever-hit"]').trigger('click')
}

async function missUntilZone(wrapper: VueWrapper, api: Exposed): Promise<void> {
  let guard = 0
  while (!api.game.boxes.some(box => inZone(box.progress, api.game.score, true)) && guard < 4000) {
    if (api.game.phase !== 'playing' || api.game.control !== 'player') {
      throw new Error(`left the player's run at ${api.game.phase} ${api.game.control}`)
    }
    if (canAct(api.game)) await wrapper.get('[data-test="lever-hit"]').trigger('click')
    api.advance(1 / 30)
    guard += 1
  }
  if (!api.game.boxes.some(box => inZone(box.progress, api.game.score, true))) {
    throw new Error('box never reached the scanner')
  }
}

async function fumbleUntilBroken(wrapper: VueWrapper, api: Exposed): Promise<void> {
  let guard = 0
  while (api.game.phase !== 'broken' && guard < 4000) {
    const zoned = api.game.boxes.some(box => inZone(box.progress, api.game.score, true))
    if (!zoned && canAct(api.game)) await wrapper.get('[data-test="lever-hit"]').trigger('click')
    api.advance(1 / 30)
    guard += 1
  }
}

describe('rex sandbox scene', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
    localStorage.removeItem('rex-sandbox-best')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('gate hero', () => {
    const wrapper = mountScene()
    expect(wrapper.findAll('[data-test="rex-eye"]')).toHaveLength(2)
    expect(wrapper.findAll('[data-test="rex-dot"]')).toHaveLength(4)
    expect(wrapper.find('[data-test="hard-hat"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="rex-mark"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="lever"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="belt"]').attributes('data-running')).toBe('yes')
    expect(wrapper.find('[data-test="scanner"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="capture-zone"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="scanner-flap"]')).toHaveLength(10)
    expect(wrapper.find('[data-test="jail"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="speech-text"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="start-hint"]').text()).toBe('your turn')
    expect(wrapper.get('[data-test="your-turn"]').text()).toBe('your turn')
    expect(wrapper.get('[data-test="your-turn"]').attributes('aria-label')).toBe('Your turn. Take over the lever.')
    expect(wrapper.get('[data-test="score"]').text()).toBe('0')
    expect(wrapper.find('video').exists()).toBe(false)
    expect(wrapper.find('[data-kind]').exists()).toBe(false)
    expect(wrapper.find('[data-test="belt-item"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="box"]').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/good|evil|RE2/)
    const rex = wrapper.get('[data-test="rex"]')
    expect(rex.element.tagName).toBe('BUTTON')
    expect(rex.attributes('type')).toBe('button')
    expect(rex.attributes('aria-label')).toBe('Your turn. Take over the lever.')
    expect(wrapper.get('[data-test="lever-hit"]').attributes('aria-label')).toBe('Your turn. Take over the lever.')
    const scene = wrapper.get('[data-test="sandbox-scene"]')
    expect(scene.attributes('data-belt')).toBe('on')
    expect(scene.attributes('data-phase')).toBe('playing')
    expect(scene.attributes('data-control')).toBe('auto')
    expect(scene.attributes('data-paused')).toBe('no')
    expect(scene.attributes('data-score')).toBe('0')
    wrapper.unmount()
  })

  it('gate input', async () => {
    const click = mountScene()
    await click.get('[data-test="rex"]').trigger('click')
    expect(click.get('[data-test="sandbox-scene"]').attributes('data-belt')).toBe('on')
    expect(click.get('[data-test="sandbox-scene"]').attributes('data-phase')).toBe('playing')
    expect(click.get('[data-test="sandbox-scene"]').attributes('data-control')).toBe('player')
    expect(click.get('[data-test="lever"]').attributes('data-on')).toBe('yes')
    expect(click.find('[data-test="your-turn"]').exists()).toBe(false)
    expect(click.get('[data-test="start-hint"]').text()).toBe('pull the lever')
    expect(click.get('[data-test="scanner"]').attributes('transform')).toBe('translate(0 0)')
    click.unmount()

    const keyed = mountScene()
    await keyed.get('[data-test="lever-hit"]').trigger('keydown', { key: 'Enter' })
    expect(keyed.get('[data-test="sandbox-scene"]').attributes('data-control')).toBe('player')
    expect(keyed.get('[data-test="sandbox-scene"]').attributes('data-miss')).toBe('no')
    keyed.unmount()

    const spaced = mountScene()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    await nextTick()
    expect(spaced.get('[data-test="sandbox-scene"]').attributes('data-control')).toBe('player')
    expect(exposed(spaced).game.score).toBe(0)
    spaced.unmount()

    const button = mountScene()
    await button.get('[data-test="your-turn"]').trigger('click')
    expect(button.get('[data-test="sandbox-scene"]').attributes('data-control')).toBe('player')
    expect(exposed(button).game.score).toBe(0)
    button.unmount()

    const touched = mountScene()
    await touched.get('[data-test="lever-hit"]').trigger('click')
    expect(touched.get('[data-test="sandbox-scene"]').attributes('data-control')).toBe('player')
    touched.unmount()

    const ignored = mountScene()
    const link = document.createElement('a')
    link.href = '/playground'
    link.textContent = 'playground'
    document.body.appendChild(link)
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()
    expect(ignored.get('[data-test="sandbox-scene"]').attributes('data-control')).toBe('auto')
    ignored.unmount()

    const scene = mountScene()
    const api = exposed(scene)
    let elapsed = 0
    while (elapsed < 8) {
      api.advance(1 / 30)
      elapsed += 1 / 30
    }
    expect(api.game.control).toBe('auto')
    expect(api.game.phase).toBe('playing')
    expect(api.game.score).toBe(0)
    await scene.get('[data-test="rex"]').trigger('click')
    expect(api.game.control).toBe('player')
    expect(api.game.score).toBe(0)
    await missUntilZone(scene, api)
    await nextTick()
    expect(scene.get('[data-test="scanner"]').attributes('transform')).toBe('translate(0 0)')
    expect(scene.find('[data-test="x-ray"]').exists()).toBe(true)
    expect(scene.find('[data-test="scan-line"]').exists()).toBe(true)
    const tunnel = scannerAperture(difficulty(api.game.score, true).span)
    const progress = Number(scene.get('[data-test="box"][data-zone="yes"]').attributes('data-progress'))
    const x = beltPoint(progress).x
    expect(x).toBeGreaterThanOrEqual(tunnel.entrance)
    expect(x).toBeLessThan(tunnel.exit)
    await scoreZoned(scene, api)
    expect(api.game.score).toBe(1)
    expect(api.game.control).toBe('player')
    expect(api.game.jolt).toBeGreaterThan(0)
    await nextTick()
    expect(scene.find('[data-test="cage"]').exists()).toBe(true)
    expect(scene.get('[data-test="score"]').text()).toBe('1')
    scene.unmount()
  })

  it('gate break', async () => {
    const quiet = mountScene()
    const demo = exposed(quiet)
    let elapsed = 0
    while (elapsed < 30) {
      demo.advance(1 / 30)
      elapsed += 1 / 30
      expect(demo.game.phase).not.toBe('broken')
      expect(demo.game.control).toBe('auto')
      expect(demo.game.miss).toBe(0)
    }
    expect(demo.game.score).toBeGreaterThan(0)
    const climbed = demo.game.score
    quiet.unmount()

    const wrapper = mountScene()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await wrapper.get('[data-test="your-turn"]').trigger('click')
    const api = exposed(wrapper)
    expect(api.game.control).toBe('player')
    expect(api.game.score).toBe(0)
    await fumbleUntilBroken(wrapper, api)
    expect(api.game.phase).toBe('broken')
    expect(api.game.control).toBe('player')
    expect(api.game.score).toBe(0)
    expect(wrapper.emitted('break')).toEqual([[true]])
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
    expect(wrapper.get('[data-test="score"]').text()).toBe('0')
    expect(wrapper.get('[data-test="your-turn"]').text()).toBe('your turn')
    api.advance(3)
    await nextTick()
    expect(api.game.control).toBe('auto')
    expect(api.game.phase).toBe('playing')
    expect(api.game.score).toBe(0)
    expect(api.game.beltOn).toBe(true)
    expect(wrapper.emitted('rebuilt')).toHaveLength(1)
    wrapper.unmount()

    const scored = mountScene()
    await scored.get('[data-test="lever-hit"]').trigger('click')
    const play = exposed(scored)
    await scoreZoned(scored, play)
    expect(play.game.score).toBe(1)
    expect(play.game.control).toBe('player')
    await fumbleUntilBroken(scored, play)
    expect(play.game.phase).toBe('broken')
    expect(play.game.control).toBe('player')
    expect(play.game.score).toBe(1)
    expect(localStorage.getItem('rex-sandbox-best')).toBe('1')
    expect(scored.get('[data-test="score"]').text()).toBe('1')
    play.advance(3)
    await nextTick()
    expect(play.game.control).toBe('auto')
    expect(play.game.phase).toBe('playing')
    expect(play.game.best).toBe(1)
    expect(play.game.score).toBe(0)
    expect(scored.get('[data-test="best"]').text()).toBe('best 1')
    expect(climbed).toBeGreaterThan(0)
    scored.unmount()
  })

  it('gate pause', async () => {
    const callbacks: IntersectionObserverCallback[] = []
    class MockObserver implements IntersectionObserver {
      readonly root = null
      readonly rootMargin = ''
      readonly scrollMargin = ''
      readonly thresholds = []
      constructor(callback: IntersectionObserverCallback) {
        callbacks.push(callback)
      }
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] { return [] }
    }
    vi.stubGlobal('IntersectionObserver', MockObserver)
    const wrapper = mountScene()
    const scene = () => wrapper.get('[data-test="sandbox-scene"]')
    expect(scene().attributes('data-paused')).toBe('no')
    const callback = callbacks[0]
    if (!callback) throw new Error('hero was not observed')
    callback([{ isIntersecting: false } as IntersectionObserverEntry], {} as IntersectionObserver)
    await nextTick()
    expect(scene().attributes('data-paused')).toBe('yes')
    callback([{ isIntersecting: true } as IntersectionObserverEntry], {} as IntersectionObserver)
    await nextTick()
    expect(scene().attributes('data-paused')).toBe('no')
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(scene().attributes('data-paused')).toBe('yes')
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    expect(scene().attributes('data-paused')).toBe('no')
    wrapper.unmount()
    vi.unstubAllGlobals()
  })

  it('gate side', async () => {
    const wrapper = mountScene()
    const belt = wrapper.get('[data-test="belt"]')
    expect(belt.attributes('data-span')).toBe('full')
    const surface = belt.get('[data-test="belt-surface"]')
    expect(surface.attributes('x')).toBe('0')
    expect(surface.attributes('width')).toBe(String(VIEW_W))
    expect(wrapper.get('[data-test="sandbox-scene"]').attributes('data-side')).toBe('yes')
    const html = wrapper.html()
    expect(html.indexOf('data-test="rex-mark"')).toBeLessThan(html.indexOf('data-test="belt"'))
    expect(html.indexOf('data-test="belt"')).toBeLessThan(html.indexOf('data-test="belt-blur"'))
    await wrapper.get('[data-test="rex"]').trigger('click')
    const api = exposed(wrapper)
    let steps = 0
    while (api.game.boxes.length === 0 && steps < 200) {
      api.advance(1 / 30)
      steps += 1
    }
    await nextTick()
    const box = wrapper.get('[data-test="box"]')
    expect(box.attributes('transform')).toContain(String(BELT_TOP))
    expect(box.get('rect').attributes('y')).toBe('-36')
    wrapper.unmount()
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

    const caught = { x: walkDistance(), y: 0, vx: 0, vy: 0 }
    const ready = framePose({ mode: 'ready', t: 0, clock: 0, lever: 0, reduced: false, spring: caught, dt: 0 })
    expect(ready.rootX).toBeGreaterThan(rest.rootX + 40)
    const cheer = framePose({ mode: 'cheer', t: 0.2, clock: 0, lever: 0, reduced: false, spring: caught, dt: 0 })
    expect(cheer.handRY).toBeLessThan(-50)
    const nervous = framePose({ mode: 'nervous', t: 0, clock: 0.2, lever: 0, reduced: false, spring: caught, dt: 0 })
    expect(nervous.eyeRX).toBeGreaterThan(ready.eyeRX + 2)

    const sprung = stepSpring(settledSpring(), { x: 10, y: 0 }, 0.016)
    expect(sprung.x).toBeGreaterThan(0)
    expect(sprung.x).toBeLessThan(4)
  })
})
