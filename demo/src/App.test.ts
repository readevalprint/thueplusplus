import { describe, expect, it, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { runWithWorker } from './wasm'

vi.mock('./RulesMonacoEditor.vue', async () => {
  const { defineComponent, h } = await import('vue')
  return {
    default: defineComponent({
      props: { modelValue: { type: String, default: '' }, highlightLine: { type: Number, default: undefined } },
      emits: ['update:modelValue', 'paste'],
      setup(props, { emit, attrs }) {
        return () => h('textarea', {
          ...attrs,
          'data-current-match-line': props.highlightLine || undefined,
          value: props.modelValue,
          spellcheck: 'false',
          wrap: 'off',
          onInput: (event: Event) => emit('update:modelValue', (event.target as HTMLTextAreaElement).value),
          onPaste: (event: Event) => emit('paste', (event.target as HTMLTextAreaElement).value),
        })
      },
    }),
  }
})

import App from './App.vue'
import { createAppRouter } from './router'

vi.mock('./wasm', async () => {
  return {
    runWithWorker: vi.fn(),
  }
})

const mockedRunWithWorker = vi.mocked(runWithWorker)

async function flush(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

async function openMenu(wrapper: ReturnType<typeof mount>, title: string): Promise<void> {
  const button = wrapper.get('[data-test="site-nav"]').findAll('button').find(item => item.text().startsWith(title))
  if (!button) throw new Error(`no ${title} menu`)
  await button.trigger('click')
  await flush()
}

let active: ReturnType<typeof mount> | undefined

async function mountApp(options?: Parameters<typeof mount>[1]): Promise<ReturnType<typeof mount>> {
  active?.unmount()
  const router = createAppRouter()
  const wrapper = mount(App, {
    ...options,
    global: {
      ...options?.global,
      plugins: [router, ...(options?.global?.plugins ?? [])],
    },
  })
  await router.isReady()
  active = wrapper
  await flush()
  await flush()
  return wrapper
}

describe('Go-WASM demo UI', () => {
  beforeEach(() => {
    active?.unmount()
    active = undefined
    window.history.pushState({}, '', '/')
    document.body.innerHTML = ''
    document.documentElement.classList.remove('dark')
    mockedRunWithWorker.mockReset()
    if (!HTMLElement.prototype.scrollIntoView) HTMLElement.prototype.scrollIntoView = vi.fn()
    window.scrollTo = vi.fn()
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    })
  })

  it('renders the landing page inside the shell', async () => {
    const wrapper = await mountApp()

    expect(wrapper.find('[data-test="app-shell"]').exists()).toBe(true)
    expect(wrapper.get('h1').text()).toBe('Thue++')
    expect(wrapper.text()).toContain('The safest, smallest, sandbox.')
    const languages = wrapper.get('[data-test="landing-languages"]')
    expect(languages.text()).toBe('Available in go, python, js, rust, cpp, and soon erlang, ocaml, perl, ruby, haskell')
    expect(languages.get('a[href="/install/go"]').text()).toBe('go')
    expect(languages.get('a[href="/install/python"]').text()).toBe('python')
    expect(languages.get('a[href="/install/js"]').text()).toBe('js')
    expect(languages.get('a[href="/install/rust"]').text()).toBe('rust')
    expect(languages.get('a[href="/install/cpp"]').text()).toBe('cpp')
    expect(languages.findAll('a')).toHaveLength(5)
    expect(wrapper.get('[data-test="landing-rewrite"]').text()).toContain('hello Ada')
    expect(wrapper.get('[data-test="landing-rewrite"]').text()).toContain('::=')
    expect(wrapper.get('[data-test="landing-rewrite"]').text()).toContain('hi Ada')
    expect(wrapper.text()).not.toContain('RE2')
    const nav = wrapper.get('[data-test="site-nav"]')
    expect(nav.text()).toContain('Docs')
    expect(nav.text()).toContain('Install')
    expect(nav.text()).toContain('Projects')
    expect(nav.text()).toContain('Metrics')
    expect(nav.text()).toContain('Playground')
    expect(nav.text()).toContain('Contribute')
    expect(nav.text()).toContain('Autoresearch prompt')
    await openMenu(wrapper, 'Docs')
    expect(wrapper.text()).toContain('Language reference')
    expect(wrapper.text()).toContain('Problems')
    expect(wrapper.text()).toContain('Guides')
    await openMenu(wrapper, 'Install')
    expect(wrapper.text()).toContain('Quick start')
    expect(wrapper.text()).toContain('JavaScript')
    await openMenu(wrapper, 'Projects')
    expect(wrapper.text()).toContain('Sandboxed projects')
    expect(wrapper.text()).toContain('Forth')
    const menu = wrapper.text()
    expect(menu).not.toMatch(/\bGuests?\b/)
    expect(menu).not.toMatch(/\bHosts?\b/)
    expect(menu).not.toMatch(/\bLearn\b/)
    expect(wrapper.findAll('a[href="/"]').some(link => link.attributes('aria-current') === 'page')).toBe(true)
    expect(nav.get('a[href="/playground"]').attributes('aria-current')).toBeUndefined()
    expect(wrapper.find('[data-test="page-sidebar"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="aside-trigger"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="rewrite-motif"]').exists()).toBe(true)
    expect(wrapper.find('a[href="https://github.com/thuelang/thueplusplus"]').exists()).toBe(true)
    expect(wrapper.find('a[href="https://gitlab.com/thuelang/thueplusplus"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="theme-toggle"]').exists()).toBe(true)
  })

  it('renders each section as its own page and leaves embed without chrome', async () => {
    window.history.pushState({}, '', '/docs/guides')
    let wrapper = await mountApp()
    expect(wrapper.get('h1').text()).toBe('Rewrite a string until it stops.')
    expect(wrapper.text()).toContain('A program')
    expect(wrapper.text()).not.toContain('RE2')
    expect(wrapper.text()).not.toMatch(/\bguest\b/i)
    expect(wrapper.get('[data-test="page-sidebar"]').text()).toContain('A program')
    await openMenu(wrapper, 'Docs')
    expect(wrapper.get('a[href="/docs/guides"]').attributes('aria-current')).toBe('page')

    window.history.pushState({}, '', '/docs/language')
    wrapper = await mountApp()
    expect(wrapper.get('h1').text()).toBe('Operators, resources, and limits.')
    expect(wrapper.text()).toContain('::=')
    expect(wrapper.text()).toContain('Patterns are regular expressions.')
    expect(wrapper.text()).not.toContain('RE2')
    expect(wrapper.text()).not.toMatch(/\bguest\b/i)
    expect(wrapper.get('[data-test="page-sidebar"]').text()).toContain('Operators')

    window.history.pushState({}, '', '/install')
    wrapper = await mountApp()
    expect(wrapper.get('h1').text()).toBe('Install a host.')
    expect(wrapper.text()).toContain('Quick start')
    expect(wrapper.text()).toContain('Coming soon')
    expect(wrapper.text()).not.toContain('the regex engine')
    expect(wrapper.text()).not.toMatch(/\bguest\b/i)
    expect(wrapper.text()).not.toContain('RE2')

    window.history.pushState({}, '', '/install/go')
    wrapper = await mountApp()
    expect(wrapper.get('h1').text()).toBe('Go.')
    expect(wrapper.text()).toContain('Library')
    expect(wrapper.text()).toContain('docs/host-api.md')
    expect(wrapper.text()).not.toContain('RE2')

    window.history.pushState({}, '', '/projects')
    wrapper = await mountApp()
    expect(wrapper.get('h1').text()).toBe('Sandboxed projects.')
    expect(wrapper.get('[data-test="project-card"][data-project="lisp"]').text()).toContain('Lisp')
    expect(wrapper.get('[data-test="project-card"][data-project="forth"]').text()).toContain('Forth')
    expect(wrapper.findAll('[data-test="project-card"]').length).toBeGreaterThan(4)
    expect(wrapper.get('[data-test="project-card"][data-project="forth"]').get('[data-test="improve-link"]').attributes('href')).toBe('https://github.com/thuelang/thueplusplus/tree/main/langs/forth')
    expect(wrapper.get('[data-test="project-card"][data-project="lisp"]').get('[data-test="improve-link"]').attributes('href')).toBe('https://github.com/thuelang/thueplusplus/tree/main/langs/lisp')
    expect(wrapper.text()).not.toContain('Placeholder')
    expect(wrapper.text()).not.toMatch(/\bguest\b/i)
    expect(wrapper.text()).not.toContain('RE2')

    window.history.pushState({}, '', '/metrics')
    wrapper = await mountApp()
    expect(wrapper.get('h1').text()).toBe('What each commit measured.')
    expect(wrapper.get('[data-test="page-sidebar"]').text()).toContain('Host time')
    expect(wrapper.get('[data-test="page-sidebar"]').text()).toContain('Host memory')
    expect(wrapper.get('[data-test="benchmark-readout"]').text()).toContain('go native')
    expect(wrapper.text()).not.toMatch(/\bguest\b/i)
    expect(wrapper.text()).not.toContain('RE2')

    window.history.pushState({}, '', '/problems')
    wrapper = await mountApp()
    expect(wrapper.get('h1').text()).toBe('Programs with a finish line.')
    expect(wrapper.text()).toContain('Suite')
    expect(wrapper.text()).toContain('Solved problems')
    expect(wrapper.text()).not.toContain('Missing.')
    expect(wrapper.text()).not.toContain('Placeholder')
    expect(wrapper.text()).not.toContain('unmeasured')

    window.history.pushState({}, '', '/problems/factorial')
    wrapper = await mountApp()
    expect(wrapper.get('h1').text()).toBe('Factorial')
    expect(document.title).toContain('Factorial')
    expect(wrapper.text()).toContain('cost')
    expect(wrapper.text()).not.toContain('Missing.')
    expect(wrapper.text()).toContain('0!')
    expect(wrapper.text()).not.toContain('unmeasured')
    expect(wrapper.get('[data-test="page-sidebar"]').text()).toContain('Description')
    expect(wrapper.get('[data-test="page-sidebar"]').text()).toContain('Cost')
    expect(wrapper.get('[data-test="improve-link"]').attributes('href')).toBe('https://github.com/thuelang/thueplusplus/tree/main/problems/factorial')

    window.history.pushState({}, '', '/contribute')
    wrapper = await mountApp()
    expect(wrapper.get('h1').text()).toBe('Clone, measure, open a pull request.')
    expect(wrapper.text()).toContain('make metrics')
    expect(wrapper.text()).not.toContain('RE2')

    window.history.pushState({}, '', '/autoresearch')
    wrapper = await mountApp()
    expect(wrapper.get('h1').text()).toBe('A prompt for an agent.')
    expect(wrapper.get('[data-test="autoresearch-prompt"]').text()).toContain('https://github.com/thuelang/thueplusplus')
    expect(wrapper.text()).not.toContain('RE2')

    window.history.pushState({}, '', '/embed?file=./examples/hello/hello.thue')
    wrapper = await mountApp()
    expect(wrapper.find('[data-test="app-shell"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="playground-workbench"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="playground-examples"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="playground-settings"]').exists()).toBe(true)
  })

  it('serves a resizable playground route with pinned stdio resources and no reset action', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp()

    expect(wrapper.find('[data-test="site-header"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="playground-toolbar"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="app-shell"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="site-nav"]').get('a[href="/playground"]').attributes('aria-current')).toBe('page')
    expect(wrapper.find('[data-test="page-hero-graphic"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="playground-share"]').text()).toBe('share')
    expect(wrapper.get('header a[href="/"]').attributes('aria-current')).toBeUndefined()
    expect(wrapper.get('[data-test="playground-examples"]').text()).toContain('Lisp')
    expect(wrapper.get('[data-test="playground-settings"]').text()).toContain('Probe limit')
    expect(wrapper.get('[data-test="playground-rules"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="playground-rules"]').attributes('wrap')).toBe('off')
    expect(wrapper.get('[data-test="playground-state"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="playground-state"]').attributes('wrap')).toBe('soft')
    expect(wrapper.get('[data-test="playground-step"]').attributes('aria-label')).toBe('Step forward')
    expect(wrapper.get('[data-test="resource-sections"]').attributes('data-slot')).toBeUndefined()
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('idle')
    expect(wrapper.get('[data-test="playground-applied-limits"]').text()).toContain('steps ')
    expect(wrapper.get('[data-test="playground-applied-limits"]').text()).toContain('/1000000')
    expect(wrapper.get('[data-test="playground-applied-limits"]').text()).toContain('probes ')
    expect(wrapper.get('[data-test="playground-applied-limits"]').text()).toContain('state ')
    expect(wrapper.get('[data-test="playground-applied-limits"]').text()).toContain('/8388608')
    expect(wrapper.get('[data-test="playground-reset"]').attributes('aria-label')).toBe('Reset to first state')
    expect((wrapper.get('[data-test="playground-reset"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-test="playground-run"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="playground-auto"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="playground-undo"]').attributes('aria-label')).toBe('Step back')
    expect(wrapper.get('[data-test="playground-step"]').text()).toBe('step')
    expect(wrapper.get('[data-test="playground-continue"]').attributes('aria-label')).toBe('Play')
    expect(wrapper.get('[data-test="playground-continue"]').text()).toBe('play')
    expect(wrapper.get('[data-test="playground-end"]').text()).toBe('end')
    expect(wrapper.get('[data-test="playground-pause"]').attributes('aria-label')).toBe('Pause')
    expect((wrapper.get('[data-test="playground-pause"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-test="playground-continue-speed"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="playground-speed-1"]').text()).toBe('1/s')
    expect(wrapper.get('[data-test="playground-speed-10"]').text()).toBe('10/s')
    expect(wrapper.get('[data-test="playground-speed-100"]').text()).toBe('100/s')
    expect(wrapper.get('[data-test="playground-speed-10"]').attributes('data-selected')).toBe('true')
    expect(wrapper.get('[data-test="playground-max-steps"]').text()).toContain('Step limit')
    expect(wrapper.get('[data-test="playground-max-steps-1000"]').text()).toBe('1000')
    expect(wrapper.get('[data-test="playground-max-steps-10000"]').text()).toBe('10000')
    expect(wrapper.get('[data-test="playground-max-steps-100000"]').text()).toBe('100000')
    expect(wrapper.get('[data-test="playground-max-steps-1000000"]').attributes('data-selected')).toBe('true')
    expect(wrapper.get('[data-test="playground-max-probes-1000000"]').attributes('data-selected')).toBe('true')
    expect(wrapper.get('[data-test="playground-max-state-8388608"]').attributes('data-selected')).toBe('true')
    expect(wrapper.find('[data-test="stdio-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-slot="resizable-panel"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="playground-split"]').attributes('data-direction')).toBe('horizontal')
    expect(wrapper.find('[data-test="resource-section-stdin"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="resource-section-stderr"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="resource-section-stdout"]').text()).toContain('stdout')
    expect(wrapper.find('[data-test="resource-input-stdin"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="resource-output-stdout"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.find('[data-test="resource-output-stderr"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="playground-column"]').attributes('data-orientation')).toBe('vertical')
    expect(wrapper.get('[data-test="playground-panel-resources"]').text()).toContain('resources')
    expect(wrapper.get('[data-test="playground-panel-state"]').text()).toContain('state')
    expect(wrapper.get('[data-test="playground-panel-trace"]').text()).toContain('trace')
    expect(wrapper.get('[data-test="playground-resize-resources"]').attributes('aria-label')).toBe('Resize resources and state')
    expect(wrapper.get('[data-test="playground-resize-trace"]').attributes('aria-label')).toBe('Resize state and trace')
    const loadedSource = (wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value
    expect(loadedSource).toContain('Hello, World')
    expect(loadedSource).not.toContain('\n::=\nSTART\n')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Hello, World!\n',
      stderr: '',
      state: '',
      resourceLogs: [
        { name: 'stdin', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: ['Hello, World!\n'], errors: [], remainingInputText: '', outputText: 'Hello, World!\n' },
        { name: 'stderr', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
      ],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()
    expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
    expect(mockedRunWithWorker.mock.calls[0][0].sourceText).not.toContain('\n::=\nSTART\n')
    expect(mockedRunWithWorker.mock.calls[0][0].input).toBe('START')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Hello, World!\n')
  })

  it('uses the visible empty state instead of falling back to embedded source state', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-state"]').setValue('')

    mockedRunWithWorker.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', state: '', resourceLogs: [] })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
    expect(mockedRunWithWorker.mock.calls[0][0].sourceText).not.toContain('\n::=\nSTART\n')
    expect(mockedRunWithWorker.mock.calls[0][0].input).toBe('')
  })

  it('seeds Program State from pasted full source while keeping Program Rules runnable', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-state"]').setValue('stale override')
    const pastedSource = '^aaab$ ::= done\n::=\naaab\n'

    await wrapper.get('[data-test="playground-rules"]').setValue(pastedSource)
    await wrapper.get('[data-test="playground-rules"]').trigger('paste')

    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toBe('^aaab$ ::= done\n')
    expect((wrapper.get('[data-test="playground-state"]').element as HTMLTextAreaElement).value).toBe('aaab')
  })

  it('does not rewrite Program Rules when Program State is edited after source seeding', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp()
    const originalSource = (wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value

    await wrapper.get('[data-test="playground-state"]').setValue('custom state')

    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toBe(originalSource)
  })

  it('loads hash-prefixed source rows exactly and keeps state empty without a separator heuristic', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hash-data/source-hash-rule.thue')
    const wrapper = await mountApp()

    const loadedSource = (wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value
    expect(loadedSource).toContain('#x ::= y')
    expect(loadedSource).toContain('^y$ ::> stdout source-row-rule\\n')
    expect((wrapper.get('[data-test="playground-state"]').element as HTMLTextAreaElement).value).toBe('')
  })

  it('discovers resources from hash-prefixed rule rows', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('#read ::< @VALUE custom\n#done ::> custom done\n')

    expect(wrapper.get('[data-test="resource-section-custom"]').text()).toContain('custom')
    expect(wrapper.get('[data-test="playground-rule-error"]').text()).toContain("Line 1: invalid read timeout '@VALUE'")
    expect(wrapper.find('[data-test="resource-input-custom"]').exists()).toBe(false)
  })

  it('sizes the resources, state, and trace panels equally, then restores a saved layout', async () => {
    localStorage.removeItem('reka:thue-playground-column')
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const fresh = await mountApp()
    const grow = (wrapper: Awaited<ReturnType<typeof mountApp>>, name: string) => {
      const panel = wrapper.get(`[data-test="playground-panel-${name}"]`).element.parentElement as HTMLElement
      return panel.style.flexGrow
    }
    const initial = ['resources', 'state', 'trace'].map(name => grow(fresh, name))
    expect(initial.every(size => size === initial[0] && Number(size) > 0)).toBe(true)

    localStorage.setItem('reka:thue-playground-column', JSON.stringify({
      'resources,state,trace': { expandToSizes: {}, layout: [60, 25, 15] },
    }))
    const restored = await mountApp()
    expect(['resources', 'state', 'trace'].map(name => Number(grow(restored, name)))).toEqual([60, 25, 15])
    localStorage.removeItem('reka:thue-playground-column')
  })

  it('shows only bar and the Go error for a read rule without a timeout', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('foo ::> bar\nbaz ::< qux\n')

    expect(wrapper.get('[data-test="playground-panel-resources"]').text()).toContain('resources')
    expect(wrapper.get('[data-test="resource-section-bar"]').text()).toContain('bar')
    expect(wrapper.get('[data-test="resource-output-bar"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.find('[data-test="resource-input-bar"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="resource-section-qux"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="resource-section-stdin"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="resource-section-stdout"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="resource-section-stderr"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="playground-rule-error"]').text()).toBe('Line 2: ::< requires read_spec and literal resource')
  })

  it('labels the read input with the resource name from ::< timeout name', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('foo ::> bar\nbaz ::< 30 qux\n')

    expect(wrapper.find('[data-test="playground-rule-error"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="resource-section-bar"]').text()).toContain('bar')
    expect(wrapper.find('[data-test="resource-input-bar"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="resource-output-bar"]').element.tagName).toBe('TEXTAREA')
    const qux = wrapper.get('[data-test="resource-section-qux"]')
    expect(qux.text()).toContain('qux')
    expect(qux.text()).not.toContain('hello')
    expect(wrapper.get('[data-test="resource-input-qux"]').attributes('aria-labelledby')).toBe('resource-title-qux')
    expect(wrapper.get('#resource-title-qux').text()).toBe('qux')
    expect(wrapper.get('[data-test="resource-submit-qux"]').text()).toBe('Submit')
    expect(wrapper.find('[data-test="resource-output-qux"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="resource-section-stdin"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="resource-section-stdout"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="resource-section-stderr"]').exists()).toBe(false)

    mockedRunWithWorker.mockResolvedValueOnce({ exitCode: 0, stdout: '', stderr: '', state: 'baz', resourceLogs: [] })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[0][0].resources).toEqual([
      { name: 'bar', inputText: '', readError: undefined },
      { name: 'qux', inputText: '', readError: undefined },
    ])
  })

  it('steps one rule and updates State as the current state', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle\n^middle$ ::= done')
    await wrapper.get('[data-test="playground-state"]').setValue('start')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'middle',
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.thue', lineNumber: 1, operator: '::=', lhs: '^start$', matchStart: 0, matchEnd: 5, groups: {}, stateBefore: 'start', replacement: 'middle', stateAfter: 'middle' }],
      resourceLogs: [],
    })

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[0][0].maxSteps).toBe(1)
    expect(mockedRunWithWorker.mock.calls[0][0].maxEvals).toBe(1_000_000)
    expect(mockedRunWithWorker.mock.calls[0][0].maxStateBytes).toBe(8_388_608)
    expect(mockedRunWithWorker.mock.calls[0][0].trace).toBe(true)
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'middle')
    expect(wrapper.get('[data-test="playground-rules"]').attributes('data-current-match-line')).toBe('1')
    expect(wrapper.get('[data-test="playground-diffs"]').text()).toContain('^start$ ::= middle')
    expect(wrapper.get('[data-test="playground-diffs"]').text()).toContain('-start')
    expect(wrapper.get('[data-test="playground-diffs"]').text()).toContain('+middle')
    expect(wrapper.get('[data-test="playground-diffs"]').text()).not.toContain('examples/hello/hello.thue')
    expect(wrapper.find('.state-diff-line.removed').exists()).toBe(true)
    expect(wrapper.find('.state-diff-line.added').exists()).toBe(true)
    const removed = wrapper.get('.state-diff-char-removed')
    const added = wrapper.get('.state-diff-char-added')
    expect(removed.classes()).not.toContain('bg-destructive/30')
    expect(added.classes()).not.toContain('bg-foreground/15')
    expect(added.classes()).toContain('state-diff-char-added')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('stepped')
  })

  it('shows failed step exit status and stderr instead of reporting a successful step', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/builtin/builtin.thue')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-state"]').setValue('div:1,0')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: "Builtin 'div' division by zero",
      errors: "Builtin 'div' division by zero",
      state: 'div:1,0',
      trace: [{ step: 1, ruleIndex: 3, sourcePath: 'examples/builtin/builtin.thue', lineNumber: 6, operator: '::!', lhs: '^div:(?<a>$N),(?<b>$N)$', matchStart: 0, matchEnd: 7, groups: { a: '1', b: '0' }, stateBefore: 'div:1,0', replacement: '', stateAfter: 'div:1,0', error: "Builtin 'div' division by zero" }],
      resourceLogs: [],
    })

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    const diffs = wrapper.get('[data-test="playground-diffs"]')
    const entries = wrapper.findAll('.state-diff-row')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('exited 1')
    expect(wrapper.find('[data-test="resource-section-stderr"]').exists()).toBe(false)
    expect(diffs.text()).toContain('Builtin \'div\' division by zero')
    expect(entries[1].find('.state-diff-error').exists()).toBe(true)
    expect(entries[1].find('.state-diff-line.removed').exists()).toBe(false)
    expect(entries[1].find('.state-diff-line.added').exists()).toBe(false)
    expect((wrapper.get('[data-test="playground-step"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-continue"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-end"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-reset"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-undo"]').element as HTMLButtonElement).disabled).toBe(false)
    expect(wrapper.get('[data-test="playground-step"]').attributes('title')).toBe('Step forward')
    expect(wrapper.get('[data-test="playground-continue"]').attributes('title')).toBe('Play')
    expect(wrapper.get('[data-test="playground-end"]').attributes('title')).toBe('End without rendering intermediate states (max 1000000 steps)')

    await wrapper.get('[data-test="playground-state"]').setValue('div:2,1')
    expect((wrapper.get('[data-test="playground-step"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-continue"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-end"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="playground-reset"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-test="playground-undo"]').element as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows parse-time step errors in state history when no trace is available', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^(?<a>\\d+),(?<b>\\d+)$ ::! nope a b')
    await wrapper.get('[data-test="playground-state"]').setValue('1,2')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: "Line 1: Unknown builtin 'nope'",
      errors: "Line 1: Unknown builtin 'nope'",
      resourceLogs: [],
    })

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    const diffs = wrapper.get('[data-test="playground-diffs"]')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('exited 1')
    expect(wrapper.find('[data-test="resource-section-stderr"]').exists()).toBe(false)
    expect(diffs.text()).toContain('^(?<a>\\d+),(?<b>\\d+)$ ::! nope a b')
    expect(diffs.text()).toContain("Line 1: Unknown builtin 'nope'")
    expect(diffs.find('.state-diff-error').exists()).toBe(true)
  })

  it('shows matched rules in state history even when state does not change', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^done$ ::> stdout ok\\n')
    await wrapper.get('[data-test="playground-state"]').setValue('done')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'ok\n',
      stderr: '',
      state: 'done',
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.thue', lineNumber: 1, operator: '::>', lhs: '^done$', matchStart: 0, matchEnd: 4, groups: {}, stateBefore: 'done', replacement: '', stateAfter: 'done' }],
      resourceLogs: [],
    })

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    const diffs = wrapper.get('[data-test="playground-diffs"]')
    expect(diffs.text()).toContain('^done$ ::> stdout ok\\n')
    expect(diffs.text()).toContain('matched without state change')
  })

  it('shows compact changed context for long state diffs below State', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle')
    const before = `${'a'.repeat(80)}LOOK<add|mul=VPRIM<mul>;add=VPRIM<add>;|K>${'z'.repeat(80)}`
    const after = `${'a'.repeat(80)}FOUND<VPRIM<add>|K>${'z'.repeat(80)}`

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: after,
      trace: [{ step: 4, ruleIndex: 7, sourcePath: 'examples/hello/hello.thue', lineNumber: 1, operator: '::=', lhs: '^start$', matchStart: 80, matchEnd: 130, groups: {}, stateBefore: before, replacement: 'FOUND<VPRIM<add>|K>', stateAfter: after }],
      resourceLogs: [],
    })

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    const diffs = wrapper.get('[data-test="playground-diffs"]')
    expect(diffs.text()).toContain('^start$ ::= middle')
    expect(diffs.text()).toContain('…')
    expect(diffs.text()).toContain('LOOK<add')
    expect(diffs.text()).toContain('FOUND<VPRIM<add>|K>')
    expect(diffs.text()).not.toContain('examples/hello/hello.thue')
    expect(diffs.text()).not.toContain('a'.repeat(80))
    expect(diffs.text()).not.toContain('z'.repeat(80))
  })

  it('places newer step diffs below older diffs', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle\n^middle$ ::= done')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'middle',
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.thue', lineNumber: 1, operator: '::=', lhs: '^start$', matchStart: 0, matchEnd: 5, groups: {}, stateBefore: 'start', replacement: 'middle', stateAfter: 'middle' }],
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'done',
      trace: [{ step: 2, ruleIndex: 1, sourcePath: 'examples/hello/hello.thue', lineNumber: 2, operator: '::=', lhs: '^middle$', matchStart: 0, matchEnd: 6, groups: {}, stateBefore: 'middle', replacement: 'done', stateAfter: 'done' }],
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    const entries = wrapper.findAll('.state-diff-row')
    expect(entries).toHaveLength(3)
    expect(entries[0].text()).toContain('initial state')
    expect(entries[1].text()).toContain('^start$ ::= middle')
    expect(entries[2].text()).toContain('^middle$ ::= done')
    expect(mockedRunWithWorker.mock.calls[0][0].maxSteps).toBe(1)
  })

  it('ends a run in one worker call and appends only a collapsed final history row', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle\n^middle$ ::= done')
    await wrapper.get('[data-test="playground-state"]').setValue('start')

    await wrapper.get('[data-test="playground-max-steps-100000"]').trigger('click')
    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'done',
      evalCount: 3,
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-end"]').trigger('click')
    await flush()

    const request = mockedRunWithWorker.mock.calls[0][0]
    expect(request.maxSteps).toBe(100000)
    expect(request.maxEvals).toBe(1_000_000)
    expect(request.maxStateBytes).toBe(8_388_608)
    expect(request.trace).toBe(false)
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'done')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('exited 0')
    const entries = wrapper.findAll('.state-diff-row')
    expect(entries).toHaveLength(2)
    expect(entries[1].text()).toContain('end: skipped intermediate states')
    expect(entries[1].text()).toContain('-start')
    expect(entries[1].text()).toContain('+done')
    expect(wrapper.get('[data-test="playground-diffs"]').text()).not.toContain('^start$ ::= middle')
    expect(wrapper.get('[data-test="playground-rules"]').attributes('data-current-match-line')).toBeUndefined()
  })

  it('uses media controls for play and stop', async () => {
    vi.useFakeTimers()
    try {
      window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
      const wrapper = await mountApp()
      await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle\n^middle$ ::= done')
      await wrapper.get('[data-test="playground-state"]').setValue('start')

      mockedRunWithWorker.mockResolvedValueOnce({
        exitCode: 0,
        stdout: '',
        stderr: '',
        state: 'middle',
        trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.thue', lineNumber: 1, operator: '::=', lhs: '^start$', matchStart: 0, matchEnd: 5, groups: {}, stateBefore: 'start', replacement: 'middle', stateAfter: 'middle' }],
        resourceLogs: [],
      })

      await wrapper.get('[data-test="playground-continue"]').trigger('click')
      await flush()

      expect(wrapper.get('[data-test="playground-continue"]').text()).toBe('play')
      expect(wrapper.get('[data-test="playground-continue"]').attributes('aria-label')).toBe('Play')
      expect((wrapper.get('[data-test="playground-continue"]').element as HTMLButtonElement).disabled).toBe(true)
      expect((wrapper.get('[data-test="playground-pause"]').element as HTMLButtonElement).disabled).toBe(false)

      await wrapper.get('[data-test="playground-pause"]').trigger('click')
      expect(wrapper.get('[data-test="playground-status"]').text()).toContain('pausing')
      await vi.advanceTimersByTimeAsync(25)
      await flush()

      expect(wrapper.get('[data-test="playground-status"]').text()).toContain('paused')
      expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
      expect((wrapper.get('[data-test="playground-continue"]').element as HTMLButtonElement).disabled).toBe(false)
      expect((wrapper.get('[data-test="playground-pause"]').element as HTMLButtonElement).disabled).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })

  it('clicks timeline rows to restore state, undo, and prune future rows before stepping', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^start$ ::= middle\n^middle$ ::= done\n^middle$ ::= branch')
    await wrapper.get('[data-test="playground-state"]').setValue('start')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'middle',
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.thue', lineNumber: 1, operator: '::=', lhs: '^start$', matchStart: 0, matchEnd: 5, groups: {}, stateBefore: 'start', replacement: 'middle', stateAfter: 'middle' }],
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'done',
      trace: [{ step: 2, ruleIndex: 1, sourcePath: 'examples/hello/hello.thue', lineNumber: 2, operator: '::=', lhs: '^middle$', matchStart: 0, matchEnd: 6, groups: {}, stateBefore: 'middle', replacement: 'done', stateAfter: 'done' }],
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    const entries = () => wrapper.findAll('.state-diff-row')
    expect(entries()).toHaveLength(3)
    expect(entries()[0].text()).toContain('initial state')
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'done')

    await entries()[0].trigger('click')
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'start')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('checkpoint initial')
    expect(entries()[0].attributes('data-selected')).toBe('true')
    expect(entries()[1].attributes('data-future')).toBe('true')

    expect((wrapper.get('[data-test="playground-undo"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-test="playground-reset"]').element as HTMLButtonElement).disabled).toBe(true)

    await entries()[1].trigger('click')
    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'branch',
      trace: [{ step: 3, ruleIndex: 2, sourcePath: 'examples/hello/hello.thue', lineNumber: 3, operator: '::=', lhs: '^middle$', matchStart: 0, matchEnd: 6, groups: {}, stateBefore: 'middle', replacement: 'branch', stateAfter: 'branch' }],
      resourceLogs: [],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[2][0].input).toBe('middle')
    expect(entries()).toHaveLength(3)
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'branch')

    await wrapper.get('[data-test="playground-reset"]').trigger('click')
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'start')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('checkpoint initial')
    expect(entries()[0].attributes('data-selected')).toBe('true')
  })

  it('keeps resource output as an append-only transcript across steps', async () => {
    vi.useFakeTimers()
    try {
      window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
      const wrapper = await mountApp()
      await wrapper.get('[data-test="playground-rules"]').setValue('^a$ ::> stdout A\\\\n\n^$ ::= b\n^b$ ::> stdout B\\\\n')
      await wrapper.get('[data-test="playground-state"]').setValue('a')

      mockedRunWithWorker.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'A\n',
        stderr: '',
        state: '',
        trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.thue', lineNumber: 1, operator: '::>', lhs: '^a$', matchStart: 0, matchEnd: 1, groups: {}, stateBefore: 'a', replacement: '', stateAfter: '' }],
        resourceLogs: [{ name: 'stdout', reads: [], writes: ['A\n'], errors: [], remainingInputText: '', outputText: 'A\n' }],
      })
      await wrapper.get('[data-test="playground-step"]').trigger('click')
      await flush()
      expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'A\n')
      expect(wrapper.get('[data-test="resource-output-stdout"]').attributes('data-attention')).toBe('output')

      await vi.advanceTimersByTimeAsync(1000)
      await flush()
      expect(wrapper.get('[data-test="resource-output-stdout"]').attributes('data-attention')).toBeUndefined()

      mockedRunWithWorker.mockResolvedValueOnce({
        exitCode: 0,
        stdout: 'B\n',
        stderr: '',
        state: '',
        resourceLogs: [{ name: 'stdout', reads: [], writes: ['B\n'], errors: [], remainingInputText: '', outputText: 'B\n' }],
      })
      await wrapper.get('[data-test="playground-step"]').trigger('click')
      await flush()

      expect(mockedRunWithWorker.mock.calls[1][0].input).toBe('')
      expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'A\nB\n')
      expect(wrapper.get('[data-test="resource-output-stdout"]').attributes('data-attention')).toBe('output')
    } finally {
      vi.useRealTimers()
    }
  })

  it('reset clears every resource transcript and the engine counters', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp()
    await wrapper.get('[data-test="playground-rules"]').setValue('^a$ ::> stdout A\\n\n^b$ ::> bar hi\\n')
    await wrapper.get('[data-test="playground-state"]').setValue('a')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'A\n',
      stderr: '',
      state: 'b',
      evalCount: 3,
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.thue', lineNumber: 1, operator: '::>', lhs: '^a$', matchStart: 0, matchEnd: 1, groups: {}, stateBefore: 'a', replacement: '', stateAfter: 'b' }],
      resourceLogs: [
        { name: 'stdout', reads: [], writes: ['A\n'], errors: [], remainingInputText: '', outputText: 'A\n' },
        { name: 'bar', reads: [], writes: ['hi\n'], errors: [], remainingInputText: 'kept', outputText: 'hi\n' },
      ],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'A\n')
    expect(wrapper.get('[data-test="resource-output-bar"]').element).toHaveProperty('value', 'hi\n')
    expect(wrapper.get('[data-test="playground-applied-limits"]').text()).toContain('steps 1/1000000')
    expect(wrapper.get('[data-test="playground-applied-limits"]').text()).toContain('probes 3/1000000')

    await wrapper.get('[data-test="playground-reset"]').trigger('click')

    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'a')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-test="resource-output-bar"]').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-test="playground-applied-limits"]').text()).toContain('steps 0/1000000')
    expect(wrapper.get('[data-test="playground-applied-limits"]').text()).toContain('probes 0/1000000')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('checkpoint initial')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'A\n',
      stderr: '',
      state: 'b',
      evalCount: 1,
      trace: [{ step: 1, ruleIndex: 0, sourcePath: 'examples/hello/hello.thue', lineNumber: 1, operator: '::>', lhs: '^a$', matchStart: 0, matchEnd: 1, groups: {}, stateBefore: 'a', replacement: '', stateAfter: 'b' }],
      resourceLogs: [{ name: 'stdout', reads: [], writes: ['A\n'], errors: [], remainingInputText: '', outputText: 'A\n' }],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[1][0].input).toBe('a')
    expect(mockedRunWithWorker.mock.calls[1][0].resources.find((resource: { name: string }) => resource.name === 'bar')).toEqual({ name: 'bar', inputText: '', readError: undefined })
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'A\n')
    expect(wrapper.get('[data-test="resource-output-bar"]').element).toHaveProperty('value', '')
  })

  it('step pauses at resource reads and submit resumes automatically', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/guess-number/guess-number.thue')
    const wrapper = await mountApp({ attachTo: document.body })

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: 'ERR:resource:random:pending_input:random',
      errors: 'ERR:resource:random:pending_input:random',
      state: 'SECRET<@RANDOM_NUMBER@>',
      resourceLogs: [
        { name: 'random', reads: [], writes: [], errors: ['pending_input:random'], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
      ],
    })

    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('waiting for random')
    expect((wrapper.get('[data-test="resource-submit-random"]').element as HTMLButtonElement).disabled).toBe(false)
    expect((wrapper.get('[data-test="resource-submit-stdin"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.get('[data-test="resource-input-random"]').attributes('data-attention')).toBeUndefined()
    expect(document.activeElement).toBe(wrapper.get('[data-test="resource-input-random"]').element)
    expect(mockedRunWithWorker.mock.calls[0][0].resources.find(resource => resource.name === 'random')).toEqual({ name: 'random', inputText: '', readError: undefined })

    await wrapper.get('[data-test="resource-input-random"]').setValue('7')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: 'Guess:\n',
      stderr: '',
      error: 'ERR:resource:stdin:pending_input:stdin',
      errors: 'ERR:resource:stdin:pending_input:stdin',
      state: 'GUESS<7|@USER_GUESS@>',
      resourceLogs: [
        { name: 'random', reads: ['7'], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: ['Guess:\n'], errors: [], remainingInputText: '', outputText: 'Guess:\n' },
        { name: 'stdin', reads: [], writes: [], errors: ['pending_input:stdin'], remainingInputText: '', outputText: '' },
      ],
    })

    await wrapper.get('[data-test="resource-submit-random"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[1][0].resources.find(resource => resource.name === 'random')).toEqual({ name: 'random', inputText: '7', readError: undefined })
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'GUESS<7|@USER_GUESS@>')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Guess:\n')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('waiting for stdin')
    expect((wrapper.get('[data-test="resource-submit-random"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-test="resource-submit-stdin"]').element as HTMLButtonElement).disabled).toBe(false)
    expect(wrapper.get('[data-test="resource-output-stdout"]').attributes('data-attention')).toBe('output')
    expect(wrapper.get('[data-test="resource-input-random"]').attributes('data-attention')).toBe('input')
    expect(wrapper.get('[data-test="resource-input-stdin"]').attributes('data-attention')).toBeUndefined()

    await wrapper.get('[data-test="resource-input-stdin"]').setValue('x')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: 'Please enter digits only.\nGuess:\n',
      stderr: '',
      error: 'ERR:resource:stdin:pending_input:stdin',
      errors: 'ERR:resource:stdin:pending_input:stdin',
      state: 'GUESS<7|@USER_GUESS@>',
      resourceLogs: [
        { name: 'stdin', reads: ['x'], writes: [], errors: ['pending_input:stdin'], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: ['Please enter digits only.\nGuess:\n'], errors: [], remainingInputText: '', outputText: 'Please enter digits only.\nGuess:\n' },
      ],
    })

    await wrapper.get('[data-test="resource-submit-stdin"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[2][0].resources.find(resource => resource.name === 'stdin')).toEqual({ name: 'stdin', inputText: 'x', readError: undefined })
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Guess:\nPlease enter digits only.\nGuess:\n')
    expect(wrapper.get('[data-test="resource-input-stdin"]').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('waiting for stdin')
  })

  it('renders curated example groups as navigation menu cards without command search', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp({ attachTo: document.body })

    expect(wrapper.find('[data-test="test-case-command"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="test-case-command-input"]').exists()).toBe(false)
    const triggerLabels = wrapper.findAll('[data-test="test-case-menu-trigger"]').map(trigger => trigger.text())
    expect(triggerLabels).toEqual(['Basic rules', 'I/O', 'Resources', 'Calcs', 'Forth', 'Lisp'])

    const lispTrigger = wrapper.findAll('[data-test="test-case-menu-trigger"]').find(trigger => trigger.text() === 'Lisp')
    expect(lispTrigger).toBeTruthy()
    await lispTrigger!.trigger('pointerdown')
    await lispTrigger!.trigger('click')
    await flush()

    const menuItems = Array.from(document.querySelectorAll('[data-test="test-case-menu-case"]')).map(element => element.textContent ?? '')
    expect(menuItems.some(text => text.includes('Closure call'))).toBe(true)
    expect(menuItems.some(text => text.includes('zero arg closure call still evaluates body'))).toBe(false)
    expect(menuItems.some(text => text.includes('Calls a zero-argument closure and returns the body value.'))).toBe(true)
    expect(menuItems.some(text => text.includes('((fn () 7))'))).toBe(false)
    expect(menuItems.some(text => text.includes('parse_unparse_canonical_acceptance.toml'))).toBe(false)
  })

  it('selecting a curated manifest test case loads rules, state, and resources without running', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp({ attachTo: document.body })

    const lispTrigger = wrapper.findAll('[data-test="test-case-menu-trigger"]').find(trigger => trigger.text() === 'Lisp')
    expect(lispTrigger).toBeTruthy()
    await lispTrigger!.trigger('pointerdown')
    await lispTrigger!.trigger('click')
    await flush()

    const zeroArgCase = Array.from(document.querySelectorAll('[data-test="test-case-menu-case"]')).map(element => ({ text: () => element.textContent ?? '', trigger: (event: string) => (element as HTMLElement).dispatchEvent(new MouseEvent(event, { bubbles: true })) })).find(item => item.text().includes('Closure call'))
    expect(zeroArgCase).toBeTruthy()
    await zeroArgCase!.trigger('click')
    await flush()

    expect((wrapper.get('[data-test="playground-rules"]').element as HTMLTextAreaElement).value).toContain('VPRIM')
    expect((wrapper.get('[data-test="playground-state"]').element as HTMLTextAreaElement).value).toBe('((fn () 7))')
    expect(mockedRunWithWorker).not.toHaveBeenCalled()
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('idle')
    expect(wrapper.find('[data-test="fixture-panel"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="terminal"]').exists()).toBe(false)
  })

  it('derives resource sections from playground rules and keeps resource inputs gated by requests', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/guess-number/guess-number.thue')
    const wrapper = await mountApp()

    expect(wrapper.get('[data-test="resource-section-random"]').text()).toContain('random')
    expect(wrapper.get('[data-test="resource-section-random"]').text()).not.toContain('read')
    expect(wrapper.get('[data-test="resource-section-stdout"]').text()).not.toContain('write')
    expect(wrapper.get('[data-test="resource-input-random"]').element.tagName).toBe('TEXTAREA')
    expect(wrapper.get('[data-test="resource-input-stdin"]').element.tagName).toBe('TEXTAREA')
    expect((wrapper.get('[data-test="resource-submit-random"]').element as HTMLButtonElement).disabled).toBe(true)
    expect((wrapper.get('[data-test="resource-submit-stdin"]').element as HTMLButtonElement).disabled).toBe(true)
    expect(wrapper.find('[data-test="playground-js-procs"]').exists()).toBe(false)

    await wrapper.get('[data-test="resource-input-random"]').setValue('7')
    await wrapper.get('[data-test="resource-input-stdin"]').setValue('x\n3\n8\n7')
    await wrapper.get('[data-test="resource-submit-random"]').trigger('click')
    await wrapper.get('[data-test="resource-submit-stdin"]').trigger('click')

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Guess:\nPlease enter digits only.\nGuess:\nToo low.\nGuess:\nToo high.\nGuess:\nCorrect!\n',
      stderr: '',
      resourceLogs: [
        { name: 'stdin', reads: ['x', '3', '8', '7'], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: ['Guess:\nPlease enter digits only.\nGuess:\nToo low.\nGuess:\nToo high.\nGuess:\nCorrect!\n'], errors: [], remainingInputText: '', outputText: 'Guess:\nPlease enter digits only.\nGuess:\nToo low.\nGuess:\nToo high.\nGuess:\nCorrect!\n' },
        { name: 'random', reads: ['7'], writes: [], errors: [], remainingInputText: '', outputText: '' },
      ],
    })
    await wrapper.get('[data-test="playground-continue"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[0][0].resources).toEqual([
      { name: 'random', inputText: '', readError: undefined },
      { name: 'stdout', inputText: '', readError: undefined },
      { name: 'stdin', inputText: '', readError: undefined },
    ])
    expect(wrapper.find('[data-test="resource-section-stderr"]').exists()).toBe(false)
    expect(mockedRunWithWorker.mock.calls[0][0].procs).toBeUndefined()
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Guess:\nPlease enter digits only.\nGuess:\nToo low.\nGuess:\nToo high.\nGuess:\nCorrect!\n')
    expect(wrapper.get('[data-test="resource-input-stdin"]').element).toHaveProperty('value', 'x\n3\n8\n7')
    expect(wrapper.get('[data-test="resource-input-random"]').element).toHaveProperty('value', '7')
  })

  it('submit resumes with the last step or continue command', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/echo/echo.thue')
    const wrapper = await mountApp({ attachTo: document.body })

    expect(wrapper.get('#resource-title-input').text()).toBe('input')
    await wrapper.get('[data-test="resource-input-input"]').setValue('Ada')
    expect(wrapper.find('[data-test="stdin-send"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="stdin-queue"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="resource-ready-input"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="resource-section-stdin"]').exists()).toBe(false)

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: 'ERR:resource:input:pending_input:input',
      errors: 'ERR:resource:input:pending_input:input',
      state: 'read',
      resourceLogs: [
        { name: 'input', reads: [], writes: [], errors: ['pending_input:input'], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
      ],
    })
    await wrapper.get('[data-test="playground-step"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[0][0].input).toBe('read')
    expect(mockedRunWithWorker.mock.calls[0][0].resources.find(resource => resource.name === 'input')).toEqual({ name: 'input', inputText: '', readError: undefined })
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'read')
    expect(wrapper.get('[data-test="playground-status"]').text()).toContain('waiting for input')
    expect(document.activeElement).toBe(wrapper.get('[data-test="resource-input-input"]').element)

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: '',
      stderr: '',
      state: 'got:Ada',
      trace: [{ step: 1, ruleIndex: 1, sourcePath: 'examples/echo/echo.thue', lineNumber: 8, operator: '::<', lhs: '@IN@', matchStart: 4, matchEnd: 8, groups: {}, stateBefore: 'got:@IN@', replacement: 'Ada', stateAfter: 'got:Ada' }],
      resourceLogs: [
        { name: 'input', reads: ['Ada'], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: [], errors: [], remainingInputText: '', outputText: '' },
      ],
    })
    await wrapper.get('[data-test="resource-submit-input"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[1][0].maxSteps).toBe(1)
    expect(mockedRunWithWorker.mock.calls[1][0].resources.find(resource => resource.name === 'input')).toEqual({ name: 'input', inputText: 'Ada', readError: undefined })
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'got:Ada')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', '')

    await wrapper.get('[data-test="resource-input-input"]').setValue('Grace')
    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 1,
      stdout: '',
      stderr: '',
      error: 'ERR:resource:input:pending_input:input',
      errors: 'ERR:resource:input:pending_input:input',
      state: 'got:@IN@',
      resourceLogs: [{ name: 'input', reads: [], writes: [], errors: ['pending_input:input'], remainingInputText: '', outputText: '' }],
    })
    await wrapper.get('[data-test="playground-continue"]').trigger('click')
    await flush()

    mockedRunWithWorker.mockResolvedValueOnce({
      exitCode: 0,
      stdout: 'Grace\n',
      stderr: '',
      state: '',
      resourceLogs: [
        { name: 'input', reads: ['Grace'], writes: [], errors: [], remainingInputText: '', outputText: '' },
        { name: 'stdout', reads: [], writes: ['Grace\n'], errors: [], remainingInputText: '', outputText: 'Grace\n' },
      ],
    })
    await wrapper.get('[data-test="resource-submit-input"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker.mock.calls[3][0].maxSteps).toBe(1)
    expect(wrapper.get('[data-test="resource-input-input"]').element).toHaveProperty('value', '')
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Grace\n')
    expect(wrapper.find('[data-test="terminal"]').exists()).toBe(false)
  })

  it('renders the standalone playground outside the docs shell', async () => {
    window.history.pushState({}, '', '/playground?file=./examples/hello/hello.thue')
    const wrapper = await mountApp({ attachTo: document.body })

    expect(wrapper.find('[data-test="site-header"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="playground-toolbar"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="app-shell"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="page-hero"]').exists()).toBe(false)
    expect(wrapper.get('[data-test="playground-toolbar"]').text()).toContain('step')
    expect(wrapper.find('[data-test="playground-diffs"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="playground-examples-trigger"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="playground-settings-trigger"]').exists()).toBe(true)
    expect(wrapper.find('[data-slot="resizable-handle"]').exists()).toBe(true)
    expect(wrapper.findAll('[data-test="playground-share"]')).toHaveLength(1)
  })

  it('renders /embed as the same workbench without site chrome', async () => {
    window.history.pushState({}, '', '/embed?file=./examples/hello/hello.thue&editable=0')
    const wrapper = await mountApp({ attachTo: document.body })

    expect(wrapper.find('[data-test="app-shell"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="site-header"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="page-hero"]').exists()).toBe(false)
    expect(wrapper.find('[data-test="playground-workbench"]').exists()).toBe(true)
    expect(wrapper.get('[data-test="playground-state"]').element).toHaveProperty('value', 'START')
    expect((wrapper.get('[data-test="playground-state"]').element as HTMLTextAreaElement).readOnly).toBe(true)
    expect(wrapper.get('[data-test="embed-open-full"]').attributes('href')).toContain('/playground?file=.%2Fexamples%2Fhello%2Fhello.thue')
  })

  it('runs an embed through the shared Go-WASM path with explicit limits', async () => {
    window.history.pushState({}, '', '/embed?file=./examples/hello/hello.thue')
    const wrapper = await mountApp({ attachTo: document.body })

    mockedRunWithWorker.mockResolvedValueOnce({ exitCode: 0, stdout: 'Hello from embed!\n', stderr: '', state: '', resourceLogs: [] })
    await wrapper.get('[data-test="playground-end"]').trigger('click')
    await flush()

    expect(mockedRunWithWorker).toHaveBeenCalledTimes(1)
    expect(mockedRunWithWorker.mock.calls[0][0].sourcePath).toBe('examples/hello/hello.thue')
    expect(mockedRunWithWorker.mock.calls[0][0].maxSteps).toBe(1_000_000)
    expect(mockedRunWithWorker.mock.calls[0][0].maxEvals).toBe(1_000_000)
    expect(mockedRunWithWorker.mock.calls[0][0].maxStateBytes).toBe(8_388_608)
    expect(wrapper.get('[data-test="resource-output-stdout"]').element).toHaveProperty('value', 'Hello from embed!\n')
  })

})
