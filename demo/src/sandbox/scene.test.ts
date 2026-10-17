import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import SandboxScene from '@/components/SandboxScene.vue'
import { MACHINE, walkDistance } from './layout'
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
    expect(wrapper.get('[data-test="belt"]').attributes('data-running')).toBe('no')
    expect(wrapper.find('[data-test="machine"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="grille"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="porthole"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="jail"]').exists()).toBe(true)
    const speech = wrapper.get('[data-test="speech-text"]').text().replace(/\s+/g, ' ').trim()
    expect(speech).toBe("i guess we sandboxin' now")
    expect(wrapper.get('[data-test="start-hint"]').text()).toBe('pull the lever')
    expect(wrapper.get('[data-test="score"]').text()).toBe('0')
    expect(wrapper.find('video').exists()).toBe(false)
    expect(wrapper.find('[data-kind]').exists()).toBe(false)
    expect(wrapper.find('[data-test="belt-item"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="box"]').exists()).toBe(false)
    expect(wrapper.text()).not.toMatch(/good|evil|RE2/)
    const rex = wrapper.get('[data-test="rex"]')
    expect(rex.element.tagName).toBe('BUTTON')
    expect(rex.attributes('type')).toBe('button')
    expect(rex.attributes('aria-label')).toMatch(/Pull the lever/)
    expect(wrapper.get('[data-test="lever-hit"]').attributes('aria-label')).toMatch(/Pull/)
    const scene = wrapper.get('[data-test="sandbox-scene"]')
    expect(scene.attributes('data-belt')).toBe('off')
    expect(scene.attributes('data-phase')).toBe('waiting')
    expect(scene.attributes('data-score')).toBe('0')
    wrapper.unmount()
  })

  it('gate input', async () => {
    const click = mountScene()
    await click.get('[data-test="rex"]').trigger('click')
    expect(click.get('[data-test="sandbox-scene"]').attributes('data-belt')).toBe('on')
    expect(click.get('[data-test="sandbox-scene"]').attributes('data-phase')).toBe('playing')
    expect(click.get('[data-test="lever"]').attributes('data-on')).toBe('yes')
    expect(click.find('[data-test="speech-text"]').exists()).toBe(false)
    expect(click.get('[data-test="machine"]').attributes('transform')).toBe(`translate(${MACHINE.x} ${MACHINE.y})`)
    click.unmount()

    const keyed = mountScene()
    await keyed.get('[data-test="lever-hit"]').trigger('keydown', { key: 'Enter' })
    expect(keyed.get('[data-test="sandbox-scene"]').attributes('data-phase')).toBe('playing')
    expect(keyed.get('[data-test="sandbox-scene"]').attributes('data-miss')).toBe('no')
    keyed.unmount()

    const spaced = mountScene()
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }))
    await nextTick()
    expect(spaced.get('[data-test="sandbox-scene"]').attributes('data-belt')).toBe('on')
    expect(exposed(spaced).game.phase).toBe('playing')
    spaced.unmount()

    const touched = mountScene()
    await touched.get('[data-test="lever-hit"]').trigger('click')
    expect(touched.get('[data-test="sandbox-scene"]').attributes('data-phase')).toBe('playing')
    touched.unmount()

    const ignored = mountScene()
    const link = document.createElement('a')
    link.href = '/playground'
    link.textContent = 'playground'
    document.body.appendChild(link)
    link.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await nextTick()
    expect(ignored.get('[data-test="sandbox-scene"]').attributes('data-phase')).toBe('waiting')
    ignored.unmount()

    const scene = mountScene()
    await scene.get('[data-test="rex"]').trigger('click')
    const api = exposed(scene)
    let guard = 0
    while (api.game.score < 1 && api.game.phase === 'playing' && guard < 4000) {
      const ready = api.game.cooldown === 0
        && api.game.rex !== 'yank'
        && api.game.rex !== 'cheer'
        && api.game.boxes.some(box => inZone(box.progress, api.game.score, true))
      if (ready) await scene.get('[data-test="lever-hit"]').trigger('click')
      api.advance(1 / 30)
      guard += 1
    }
    expect(api.game.score).toBe(1)
    expect(api.game.jolt).toBeGreaterThan(0)
    await nextTick()
    expect(scene.get('[data-test="machine"]').attributes('transform')).toBe(`translate(${MACHINE.x} ${MACHINE.y})`)
    expect(scene.find('[data-test="cage"]').exists()).toBe(true)
    expect(scene.get('[data-test="score"]').text()).toBe('1')
    scene.unmount()
  })

  it('gate break', async () => {
    const wrapper = mountScene()
    const setItem = vi.spyOn(Storage.prototype, 'setItem')
    await wrapper.get('[data-test="rex"]').trigger('click')
    const api = exposed(wrapper)
    let guard = 0
    while (api.game.phase !== 'broken' && guard < 4000) {
      api.advance(1 / 30)
      guard += 1
    }
    expect(api.game.phase).toBe('broken')
    expect(api.game.score).toBe(0)
    expect(wrapper.emitted('break')).toEqual([[true]])
    expect(api.game.showRebuild).toBe(false)
    await nextTick()
    expect(document.body.querySelector('[data-test="rebuild"]')).toBeNull()
    api.advance(0.9)
    expect(api.game.showRebuild).toBe(true)
    await nextTick()
    const finalScore = document.body.querySelector('[data-test="final-score"]')
    expect(finalScore?.textContent).toBe('score 0')
    expect(setItem).not.toHaveBeenCalled()
    setItem.mockRestore()
    const rebuild = document.body.querySelector('[data-test="rebuild"]')
    if (!(rebuild instanceof HTMLButtonElement)) throw new Error('missing rebuild')
    rebuild.click()
    await nextTick()
    expect(wrapper.emitted('rebuilt')).toHaveLength(1)
    expect(api.game.phase).toBe('waiting')
    expect(api.game.beltOn).toBe(false)
    expect(wrapper.get('[data-test="speech-text"]').text().replace(/\s+/g, ' ').trim()).toBe("i guess we sandboxin' now")
    expect(document.body.querySelector('[data-test="rebuild"]')).toBeNull()
    wrapper.unmount()

    const scored = mountScene()
    await scored.get('[data-test="rex"]').trigger('click')
    const play = exposed(scored)
    let steps = 0
    while (play.game.score < 1 && play.game.phase === 'playing' && steps < 4000) {
      const ready = play.game.cooldown === 0
        && play.game.rex !== 'yank'
        && play.game.rex !== 'cheer'
        && play.game.boxes.some(box => inZone(box.progress, play.game.score, true))
      if (ready) await scored.get('[data-test="lever-hit"]').trigger('click')
      play.advance(1 / 30)
      steps += 1
    }
    expect(play.game.score).toBe(1)
    while (play.game.phase !== 'broken' && steps < 8000) {
      play.advance(1 / 30)
      steps += 1
    }
    expect(play.game.phase).toBe('broken')
    expect(play.game.score).toBe(1)
    expect(localStorage.getItem('rex-sandbox-best')).toBe('1')
    play.advance(0.9)
    await nextTick()
    expect(document.body.querySelector('[data-test="final-score"]')?.textContent).toBe('score 1')
    const again = document.body.querySelector('[data-test="rebuild"]')
    if (!(again instanceof HTMLButtonElement)) throw new Error('missing rebuild')
    again.click()
    await nextTick()
    expect(play.game.phase).toBe('waiting')
    expect(play.game.best).toBe(1)
    expect(scored.get('[data-test="best"]').text()).toBe('best 1')
    scored.unmount()
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
