import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { catalog } from './catalog'
import { routes } from './router'
import { pages } from './site'

vi.mock('./RulesMonacoEditor.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { modelValue: { type: String, default: '' }, highlightLine: { type: Number, default: undefined } },
      emits: ['update:modelValue', 'paste'],
      setup(props, { emit, attrs }) {
        return () => h('textarea', {
          ...attrs,
          value: props.modelValue,
          onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
        })
      },
    }),
  }
})

async function mountPath(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()
  const component = router.currentRoute.value.matched[0]?.components?.default
  if (!component) throw new Error(`no component for ${path}`)
  const wrapper = mount(component, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

const paths = [
  ...Object.values(pages).map(page => page.path),
  ...catalog.problems.map(problem => problem.path),
  '/problems/rot-13/direct',
  ...catalog.rulesets.map(ruleset => `/rulesets/${ruleset.id}`),
  '/not-a-page',
]

describe('heroes', () => {
  it('puts the details in the bottom third of the first screen', () => {
    const css = readFileSync('src/style.css', 'utf8')
    expect(css).toContain('grid-template-rows: minmax(0, 2fr) minmax(0, 1fr)')
    expect(css).toContain('margin-top: calc((100svh - 52px) / -3)')
  })

  it('opens every user page with a title, a summary, and a Rex scene', async () => {
    for (const path of paths) {
      const wrapper = await mountPath(path)
      expect(wrapper.get('h1').text().length, path).toBeGreaterThan(0)
      expect(wrapper.get('[data-test="page-summary"]').text().length, path).toBeGreaterThan(0)
      wrapper.get('[data-test="page-hero"]')
      wrapper.get('[data-test="page-details"]')
      const scene = wrapper.find('[data-test="rex-scene"]')
      const sandbox = wrapper.find('[data-test="sandbox-scene"]')
      expect(scene.exists() || sandbox.exists(), path).toBe(true)
      if (path === '/') {
        expect(sandbox.attributes('data-test')).toBe('sandbox-scene')
        expect(wrapper.get('[data-test="landing-languages"]').text()).toContain('Available in')
      } else {
        expect(scene.attributes('data-scene')?.length, path).toBeGreaterThan(0)
      }
      wrapper.unmount()
    }
  }, 15_000)

  it('keeps the embed free of a hero', async () => {
    window.history.pushState({}, '', '/embed?file=./examples/hello/hello.thue')
    const wrapper = await mountPath('/embed')
    expect(wrapper.find('[data-test="page-hero"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="playground-workbench"]').exists()).toBe(true)
  })
})
