import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import MetricsPage from './pages/MetricsPage.vue'
import ProblemPage from './pages/ProblemPage.vue'
import ProblemsPage from './pages/ProblemsPage.vue'
import ProjectsPage from './pages/ProjectsPage.vue'
import { catalog, problemRouteMeta, rulesetColor, runningBest, type CatalogPoint } from './catalog'
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
      { commit: 'a', solution: 'direct.thue', cost: 10, steps: 1, regexEvals: 1, regexMatches: 1, stateBytes: 1, statePeak: 1, ruleCount: 1, ruleChars: 1 },
      { commit: 'a', solution: 'slow.thue', cost: 4, steps: 1, regexEvals: 1, regexMatches: 1, stateBytes: 1, statePeak: 1, ruleCount: 1, ruleChars: 1 },
      { commit: 'c', solution: 'direct.thue', cost: 3, steps: 1, regexEvals: 1, regexMatches: 1, stateBytes: 1, statePeak: 1, ruleCount: 1, ruleChars: 1 },
    ]
    expect(runningBest(['a', 'b', 'c'], points)).toEqual([4, 4, 3])
    expect(runningBest(['a', 'b'], [])).toEqual([undefined, undefined])
  })
})

describe('catalog pages', () => {
  it('checks the generated suite against its own rows', () => {
    expect(catalog.schemaVersion).toBe(3)
    expect(catalog.commit).toMatch(/^[0-9a-f]{40}$/)
    expect(catalog.problems.length).toBeGreaterThan(0)
    expect(catalog.commits.length).toBeGreaterThan(0)
    expect(catalog.rulesets.length).toBeGreaterThan(0)
    for (const problem of catalog.problems) {
      expect(problem.path).toBe(`/problems/${problem.id}`)
      expect(problem.canonical).toBe(`https://thuelang.org/problems/${problem.id}`)
      const direct = problem.versions.find(version => version.id === 'direct')
      expect(direct?.missing).toBe(false)
      expect(direct?.solutions.every(solution => solution.status === 'pass' || solution.status === 'fail')).toBe(true)
      expect(direct?.series.length).toBeGreaterThan(0)
    }
    expect(catalog.rulesets.every(ruleset => ruleset.color.startsWith('var(--chart-'))).toBe(true)
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
    expect(wrapper.get('[data-test="benchmark-readout"]').text()).toContain('go native')
    expect(wrapper.get('[data-test="benchmark-readout"]').text()).toContain('× go')
    expect(wrapper.get('[data-test="benchmark-readout"]').text()).not.toContain(' ms')
    expect(wrapper.get('[data-test="time-chart"]').find('svg').exists()).toBe(true)
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
    expect(index.get('[data-test="program-leaderboard"]').text()).toContain('Solved problems')
    expect(index.get('[data-test="ruleset-aggregate"]').text()).toContain('sum')
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
    expect(links).toEqual(['Description', 'Cost', 'direct', 'Forth', 'Lisp', 'BASIC'])
    expect(page.get('[data-test="problem-legend"]').text()).toContain('direct')
    const swatch = page.get('[data-test="problem-legend"]').find('[style]')
    expect(swatch.attributes('style')).toContain(rulesetColor('direct'))
    const chart = page.get('[data-test="problem-chart-cost"]')
    expect(chart.find('svg').exists()).toBe(true)
    expect(chart.text()).toContain('var(--chart-')
    const direct = page.get('[data-test="problem-version"][data-version="direct"]')
    expect(direct.text()).toContain('pass')
    expect(direct.text()).toContain('cost')
    expect(page.get('[data-test="problem-version"][data-version="lisp"]').text()).toContain('cost')
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
