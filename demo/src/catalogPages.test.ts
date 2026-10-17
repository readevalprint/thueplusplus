import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import MetricsPage from './pages/MetricsPage.vue'
import ProblemPage from './pages/ProblemPage.vue'
import ProblemsPage from './pages/ProblemsPage.vue'
import ProjectsPage from './pages/ProjectsPage.vue'
import { catalog, problemRouteMeta, runningBest, VERSION_COLORS, type CatalogPoint } from './catalog'
import { history } from './metrics'
import { projects } from './projects'
import { pageLinks } from './site'

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects', component: ProjectsPage },
      { path: '/metrics', component: MetricsPage },
      { path: '/problems', component: ProblemsPage },
      { path: '/problems/:problemId', component: ProblemPage },
    ],
  })
  await router.push(path)
  await router.isReady()
  const component = router.currentRoute.value.matched[0]?.components?.default
  if (!component) throw new Error(`no component for ${path}`)
  return mount(component, {
    global: { plugins: [router] },
  })
}

describe('running best', () => {
  it('holds the minimum cost after a version appears', () => {
    const points: CatalogPoint[] = [
      { commit: 'a', solution: 'direct.tpp', cost: 10, steps: 1, regexEvals: 1, regexMatches: 1, stateBytes: 1, statePeak: 1, ruleCount: 1, ruleChars: 1 },
      { commit: 'a', solution: 'slow.tpp', cost: 4, steps: 1, regexEvals: 1, regexMatches: 1, stateBytes: 1, statePeak: 1, ruleCount: 1, ruleChars: 1 },
      { commit: 'c', solution: 'direct.tpp', cost: 3, steps: 1, regexEvals: 1, regexMatches: 1, stateBytes: 1, statePeak: 1, ruleCount: 1, ruleChars: 1 },
    ]
    expect(runningBest(['a', 'b', 'c'], points)).toEqual([4, 4, 3])
    expect(runningBest(['a', 'b'], [])).toEqual([undefined, undefined])
  })
})

describe('catalog pages', () => {
  it('checks the generated suite against its own rows', () => {
    expect(catalog.schemaVersion).toBe(2)
    expect(catalog.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(catalog.problems.length).toBeGreaterThan(0)
    expect(catalog.commits.length).toBeGreaterThan(0)
    for (const problem of catalog.problems) {
      expect(problem.path).toBe(`/problems/${problem.id}`)
      expect(problem.canonical).toBe(`https://thuelang.org/problems/${problem.id}`)
      expect(problem.versions.map(version => version.id)).toEqual(['direct', 'lisp', 'forth', 'basic'])
      const direct = problem.versions.find(version => version.id === 'direct')
      expect(direct?.missing).toBe(false)
      expect(direct?.solutions.every(solution => solution.status === 'pass' || solution.status === 'fail')).toBe(true)
      expect(direct?.series.length).toBeGreaterThan(0)
      for (const version of problem.versions) {
        if (version.missing) expect(version.solutions).toEqual([])
      }
    }
    expect(catalog.langs.map(lang => lang.status)).toEqual(['pass', 'pass', 'pass'])
  })

  it('renders sandboxed project cards and the metrics charts', async () => {
    const projectsPage = await mountAt('/projects')
    expect(projectsPage.get('h1').text()).toBe('Sandboxed projects.')
    const cards = projectsPage.findAll('[data-test="project-card"]')
    expect(cards.map(card => card.attributes('data-project'))).toEqual(projects.map(project => project.id))
    for (const card of cards) {
      const project = projects.find(item => item.id === card.attributes('data-project'))
      expect(project).toBeTruthy()
      expect(card.text()).toContain(project!.name)
      expect(card.text()).toContain(project!.description)
      expect(card.find('[data-slot="badge"]').exists()).toBe(false)
    }
    expect(projectsPage.text()).not.toMatch(/\bguest\b/i)
    expect(projectsPage.text()).not.toContain('RE2')

    const wrapper = await mountAt('/metrics')
    await flushPromises()
    expect(wrapper.get('h1').text()).toBe('What each commit measured.')
    expect(wrapper.get('[data-test="page-hero-graphic"]').text()).toContain('::=')
    expect(wrapper.get('[data-test="page-hero-graphic"]').text()).toContain('program')
    expect(wrapper.get('[data-test="rule-readout"]').text()).toContain('09744fa8d495')
    expect(wrapper.get('[data-test="rule-readout"]').text()).toContain('Forth ·')
    expect(wrapper.get('[data-test="rule-readout"]').text()).toContain('86')
    expect(wrapper.get('[data-test="rule-readout"]').text()).toContain(`61ec35406371…${history.entries[history.entries.length - 1].commit.slice(0, 12)} · 86`)
    expect(wrapper.get('[data-test="task-readout"]').text()).toContain('Lisp · 10 pass · 0 fail · 0 unsupported · 76749 steps')
    expect(wrapper.get('[data-test="benchmark-readout"]').text()).toContain('steps 10000 · probes 10002')
    expect(wrapper.get('[data-test="benchmark-readout"]').text()).toContain('wasm (node) · 2.3× go')
    expect(wrapper.get('[data-test="benchmark-readout"]').text()).toContain('go native · 1× go')
    expect(wrapper.get('[data-test="benchmark-readout"]').text()).toContain('rust · 0.8× go')
    expect(wrapper.get('[data-test="benchmark-readout"]').text()).toContain('cpp · 1× go')
    expect(wrapper.get('[data-test="benchmark-readout"]').text()).toContain('python · 1.2× go')
    expect(wrapper.get('[data-test="benchmark-readout"]').text()).not.toContain(' ms')
    expect(wrapper.get('[data-test="rule-chart"]').text()).toContain('Forth')
    expect(wrapper.get('[data-test="rule-chart"]').find('svg').exists()).toBe(true)
    expect(wrapper.find('[data-test="memory-chart"]').exists() || wrapper.text().includes('No memory is recorded')).toBe(true)
    expect(wrapper.find('[data-test="page-sidebar"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Placeholder')
    expect(wrapper.text()).not.toMatch(/\bguest\b/i)
    expect(wrapper.text()).not.toContain('RE2')
  })

  it('renders a problem index and one page per problem', async () => {
    const index = await mountAt('/problems')
    expect(index.get('h1').text()).toBe('Programs with a finish line.')
    expect(index.get('[data-test="page-hero-graphic"]').text()).toContain('stdin')
    const statuses = index.findAll('[data-test="problem-status"]')
    expect(statuses.length).toBeGreaterThan(0)
    expect(statuses.every(cell => cell.attributes('data-status') === 'pass' || cell.attributes('data-status') === 'fail')).toBe(true)
    expect(index.findAll('[data-test="problem-missing"]').length).toBeGreaterThan(0)
    expect(index.find('[data-test="page-sidebar"]').exists()).toBe(false)
    expect(index.text()).not.toContain('Placeholder')
    expect(index.text()).not.toContain('unmeasured')
    expect(index.get('[data-test="program-improve"]').text().toLowerCase()).toContain('autoresearch')
    expect(index.text()).not.toMatch(/\bguest\b/i)
    expect(index.text()).not.toContain('RE2')

    const problem = catalog.problems.find(item => item.id === 'factorial')
    expect(problem).toBeTruthy()
    const page = await mountAt(problem!.path)
    await flushPromises()
    expect(page.get('h1').text()).toBe('Factorial')
    expect(page.get('[data-test="problem-description"]').text()).toContain(problem!.summary)
    const links = pageLinks(problem!.path).map(link => link.title)
    expect(links).toEqual(['Description', 'Cost', 'direct', 'Lisp', 'Forth', 'BASIC'])
    expect(page.get('[data-test="problem-legend"]').text()).toContain('direct')
    expect(page.get('[data-test="problem-legend"]').text()).not.toContain('Lisp')
    const swatch = page.get('[data-test="problem-legend"]').find('div')
    expect(swatch.attributes('style')).toContain(VERSION_COLORS.direct)
    const chart = page.get('[data-test="problem-chart-cost"]')
    expect(chart.find('svg').exists()).toBe(true)
    expect(chart.text()).toContain('var(--chart-')
    const direct = page.get('[data-test="problem-version"][data-version="direct"]')
    expect(direct.text()).toContain('pass')
    expect(direct.text()).toContain('cost')
    expect(page.get('[data-test="problem-version"][data-version="lisp"]').text()).toContain('Missing.')
    expect(page.text()).not.toContain('unmeasured')
    expect(page.text()).not.toMatch(/\bguest\b/i)
    expect(page.text()).not.toContain('RE2')
  })

  it('says when a problem id is not in the suite', async () => {
    const wrapper = await mountAt('/problems/not-a-problem')
    expect(wrapper.get('h1').text()).toBe('This problem is not in the suite.')
    expect(wrapper.get('[data-test="problem-missing"]').text()).toContain('not-a-problem')
    expect(problemRouteMeta('not-a-problem').robots).toBe('noindex,follow')
    const known = catalog.problems[0]
    expect(problemRouteMeta(known.id)).toEqual({
      documentTitle: known.documentTitle,
      description: known.summary,
      canonical: known.canonical,
      robots: 'index,follow',
    })
  })
})
