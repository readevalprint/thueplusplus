import { describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import { runWithWorker } from './wasm'
import SolutionPage from './pages/SolutionPage.vue'
import { routes } from './router'
import { catalog, solutionRouteMeta } from './catalog'

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

vi.mock('./wasm', () => ({ runWithWorker: vi.fn() }))

const mockedRun = vi.mocked(runWithWorker)

async function mountSolution(path: string) {
  const router = createRouter({ history: createMemoryHistory(), routes })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(SolutionPage, { global: { plugins: [router] } })
  await flushPromises()
  return wrapper
}

describe('solution pages', () => {
  it('shows the chart, the source, the notes, and both calls to action', async () => {
    const problem = catalog.problems.find(item => item.id === 'rot-13')
    const version = problem?.versions.find(item => item.id === 'direct')
    if (!problem || !version) throw new Error('rot-13 direct missing')
    const wrapper = await mountSolution('/problems/rot-13/direct')
    expect(wrapper.get('h1').text()).toContain(problem.title)
    expect(wrapper.get('h1').text()).toContain(version.name)
    expect(wrapper.get('[data-test="page-summary"]').text()).toContain(String(version.solutions[0]?.cost))
    expect(wrapper.get('[data-test="rex-scene"]').attributes('data-scene')).toBe('problem')
    expect(wrapper.get('[data-test="solution-chart"]').find('svg').exists()).toBe(true)
    expect(wrapper.get('[data-test="cost-caption"]').text().split('.').filter(sentence => sentence.trim().length > 0)).toHaveLength(2)
    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toContain('::=')
    expect((wrapper.get('[data-test="resource-input-stdin"]').element as HTMLTextAreaElement).value).toContain('Hello, World!')
    expect(wrapper.get('[data-test="solution-readme"]').text()).toContain('Direct Thue++')
    expect(wrapper.get('[data-test="solution-readme"]').text()).not.toContain('ruleset:')
    expect(wrapper.get('[data-test="contribute-better"]').attributes('href')).toBe('https://github.com/thuelang/thueplusplus/tree/main/problems/rot-13/solutions/direct')
    expect(wrapper.get('[data-test="autoresearch-link"]').attributes('href')).toBe('/autoresearch?problem=rot-13&solution=direct')
    expect(wrapper.find('[data-test="solution-run"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="playground-run"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('The Go test')
    expect(solutionRouteMeta('rot-13', 'direct').canonical).toBe('https://thuelang.org/problems/rot-13/direct')

    mockedRun.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Uryyb, Jbeyq!\n',
      stderr: '',
      state: '',
      metrics: { cost: 42 },
      resourceLogs: [
        { name: 'stdin', reads: ['Hello, World!'], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: ['Uryyb, Jbeyq!\n'], errors: [], remainingInputText: '', outputText: 'Uryyb, Jbeyq!\n' },
      ],
    })
    await wrapper.get('[data-test="solution-run"]').trigger('click')
    await flushPromises()
    expect(wrapper.get('[data-test="playground-cost"]').text()).toContain('42')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('exited 0')
    expect((wrapper.get('[data-test="resource-output-stdout"]').element as HTMLTextAreaElement).value).toContain('Uryyb')
  })

  it('says when the solution is missing', async () => {
    const wrapper = await mountSolution('/problems/rot-13/nope')
    expect(wrapper.get('[data-test="solution-missing"]').text()).toContain('rot-13/nope')
    expect(solutionRouteMeta('rot-13', 'nope').robots).toBe('noindex,follow')
  })
})
