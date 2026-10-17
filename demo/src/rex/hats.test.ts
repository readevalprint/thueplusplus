import { mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryHistory, createRouter } from 'vue-router'
import RexFigure from '@/components/RexFigure.vue'
import SiteHeader from '@/components/SiteHeader.vue'
import { actPose, settledSpring } from '@/rex/motion'
import {
  HAT_IDS,
  HAT_STORAGE_KEY,
  faviconSvg,
  hatShape,
  hatTiltAt,
  loadHat,
  nextHatId,
  saveHat,
  swapArrive,
} from '@/rex/geometry.mjs'
import { hat, resetMascot, swapHat } from '@/rex/mascot'

const pose = () => actPose({ mode: 'read', clock: 0, reduced: true, spring: settledSpring(), dt: 0 })

function memory() {
  const saved = new Map<string, string>()
  return {
    getItem: (key: string) => saved.get(key) ?? null,
    setItem: (key: string, value: string) => {
      saved.set(key, value)
    },
  }
}

async function header() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['/', '/install', '/docs', '/problems', '/contribute'].map(path => ({
      path,
      component: { template: '<div />' },
    })),
  })
  const wrapper = mount(SiteHeader, { global: { plugins: [router] } })
  await router.isReady()
  return wrapper
}

describe('rex hats', () => {
  beforeEach(() => {
    localStorage.removeItem(HAT_STORAGE_KEY)
    resetMascot()
  })

  it('cycles the wardrobe', () => {
    const seen: string[] = []
    let id = 'hard'
    for (let i = 0; i < HAT_IDS.length; i += 1) {
      seen.push(id)
      id = nextHatId(id)
    }
    expect(seen).toEqual(['hard', 'top', 'party', 'beanie', 'wizard', 'crown'])
    expect(id).toBe('hard')
    expect(() => nextHatId('cape')).toThrow(/unknown hat cape/)
  })

  it('remembers the hat', () => {
    const storage = memory()
    expect(loadHat(storage)).toBe('hard')
    saveHat(storage, 'beanie')
    expect(storage.getItem(HAT_STORAGE_KEY)).toBe('beanie')
    expect(loadHat(storage)).toBe('beanie')
    expect(() => loadHat({ getItem: () => 'cape' })).toThrow(/stored rex hat cape/)
    expect(() => saveHat(storage, 'cape')).toThrow(/unknown hat cape/)
  })

  it('gives every hat its own cock and wobbles a fresh one into it', () => {
    const tilts = HAT_IDS.map(id => hatShape(id).tilt)
    const offsets = HAT_IDS.map(id => `${hatShape(id).offset.x},${hatShape(id).offset.y}`)
    expect(new Set(tilts).size).toBe(HAT_IDS.length)
    expect(new Set(offsets).size).toBe(HAT_IDS.length)
    for (const id of HAT_IDS) {
      const shape = hatShape(id)
      expect(Math.abs(shape.tilt)).toBeGreaterThanOrEqual(3)
      expect(Math.abs(shape.tilt)).toBeLessThanOrEqual(12)
      const shift = Math.hypot(shape.offset.x, shape.offset.y)
      expect(shift).toBeGreaterThanOrEqual(1)
      expect(shift).toBeLessThanOrEqual(5)
    }
    const tilt = hatShape('hard').tilt
    const arrive = swapArrive(0.55)
    expect(hatTiltAt(tilt, 0.55, false)).not.toBeCloseTo(tilt * arrive)
    expect(hatTiltAt(tilt, 0.55, true)).toBe(tilt)
    expect(hatTiltAt(tilt, 1, false)).toBe(tilt)
    expect(hatTiltAt(tilt, 0, false)).toBe(0)
  })

  it('keeps the cocked hard hat on the favicon', () => {
    const tilt = hatShape('hard').tilt
    const svg = faviconSvg()
    expect(svg).toContain(`rotate(${tilt})`)
    expect(svg).toContain(`translate(${hatShape('hard').offset.x} ${hatShape('hard').offset.y})`)
    const party = hatShape('party').parts.find(part => part.kind === 'path' && part.role === 'hat')
    if (!party || party.kind !== 'path') throw new Error('party hat has no crown')
    expect(svg).not.toContain(party.d)
  })

  it('every Rex wears the stored hat', () => {
    localStorage.setItem(HAT_STORAGE_KEY, 'wizard')
    resetMascot()
    const hero = mount(RexFigure, { props: { pose: pose() } })
    const game = mount(RexFigure, { props: { pose: pose() } })
    expect(hat.value).toBe('wizard')
    expect(hero.find('[data-hat="wizard"]').exists()).toBe(true)
    expect(game.find('[data-hat="wizard"]').exists()).toBe(true)
    expect(hero.find('[data-test="hard-hat"]').exists()).toBe(false)
    expect(hero.find('[data-hat="wizard"]').attributes('data-tilt')).toBe(String(hatShape('wizard').tilt))
  })

  it('reduced motion swaps instantly', async () => {
    const wrapper = await header()
    expect(wrapper.get('[data-test="swap-hat"]').attributes('aria-label')).toBe("Swap Rex's hat")
    await wrapper.get('[data-test="swap-hat"]').trigger('click')
    expect(localStorage.getItem(HAT_STORAGE_KEY)).toBe('top')
    expect(wrapper.find('[data-hat="top"]').attributes('data-tilt')).toBe(String(hatShape('top').tilt))
    expect(wrapper.find('[data-test="hard-hat"]').exists()).toBe(false)
  })

  it('wordmark links home', async () => {
    const wrapper = await header()
    const home = wrapper.get('a[href="/"]')
    expect(home.text()).toBe('Thue++')
    expect(home.attributes('aria-current')).toBe('page')
    expect(wrapper.get('[data-test="swap-hat"]').find('a').exists()).toBe(false)
    await wrapper.get('[data-test="swap-hat"]').trigger('click')
    expect(swapHat('right')).toBe('party')
    expect(home.attributes('href')).toBe('/')
  })
})
