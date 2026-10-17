import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import MetricsPage from './pages/MetricsPage.vue'
import ProjectsPage from './pages/ProjectsPage.vue'
import TaskPage from './pages/TaskPage.vue'
import TasksPage from './pages/TasksPage.vue'
import { catalog, rankGuests, taskRouteMeta } from './catalog'
import { history } from './metrics'
import { projects } from './projects'
import { pageLinks } from './site'

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects', component: ProjectsPage },
      { path: '/metrics', component: MetricsPage },
      { path: '/tasks', component: TasksPage },
      { path: '/tasks/:taskId', component: TaskPage },
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

describe('catalog pages', () => {
  it('ranks guests by passes, then steps, then rules', () => {
    const ranked = rankGuests([
      { id: 'lisp', name: 'Lisp', program: 'lisp.thue', ruleCount: 394, passCount: 4, taskCount: 10, stepCount: 13000 },
      { id: 'forth', name: 'Forth', program: 'forth.thue', ruleCount: 45, passCount: 2, taskCount: 10, stepCount: 128 },
      { id: 'basic', name: 'Basic', program: 'basic.thue', ruleCount: 10, passCount: 4, taskCount: 10, stepCount: 13000 },
    ])
    expect(ranked.map(guest => guest.id)).toEqual(['basic', 'lisp', 'forth'])
  })

  it('checks the generated suite against its own rows', () => {
    expect(catalog.schemaVersion).toBe(1)
    expect(catalog.tasks.length).toBeGreaterThan(0)
    expect(catalog.guests.length).toBeGreaterThan(0)
    for (const guest of catalog.guests) {
      const cells = catalog.tasks.map(task => {
        const cell = task.guests.find(item => item.id === guest.id)
        expect(cell).toBeTruthy()
        return cell!
      })
      expect(guest.passCount).toBe(cells.filter(cell => cell.status === 'pass').length)
      expect(guest.taskCount).toBe(catalog.tasks.length)
      expect(guest.stepCount).toBe(cells.reduce((sum, cell) => sum + (cell.stepCount ?? 0), 0))
      expect(guest.ruleCount).toBeGreaterThanOrEqual(0)
      expect(cells.every(cell => cell.status === 'unmeasured')).toBe(true)
    }
    for (const task of catalog.tasks) {
      expect(task.path).toBe(`/tasks/${task.id}`)
      expect(task.cases.every(item => Number.isInteger(item.exitCode))).toBe(true)
      expect(task.guests).toHaveLength(catalog.guests.length)
    }
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
    const problemCards = wrapper.findAll('[data-test="problem-card"]')
    expect(problemCards.map(card => card.attributes('data-problem'))).toEqual(catalog.tasks.map(task => task.id))
    expect(problemCards[0]?.attributes('href')).toBe('/tasks/hello-world')
    expect(wrapper.get('[data-test="language-card"][data-lang="forth"]').text()).toContain('86 rules · 14,478 chars')
    expect(wrapper.get('[data-test="language-card"][data-lang="lisp"]').text()).toContain('No shared set.')
    expect(wrapper.get('[data-test="language-card"][data-lang="basic"]').text()).toContain('0 of 16 problems')
    const factorial = wrapper.get('[data-test="problem-card"][data-problem="factorial"]')
    expect(factorial.text()).toContain('290')
    expect(factorial.get('[data-test="coverage-mark"][data-version="direct"]').attributes('data-filled')).toBe('true')
    expect(factorial.get('[data-test="coverage-mark"][data-version="lisp"]').attributes('data-filled')).toBe('false')
    expect(factorial.get('[data-test="coverage-mark"][data-version="forth"]').attributes('data-filled')).toBe('false')
    expect(factorial.get('[data-test="coverage-mark"][data-version="basic"]').attributes('data-filled')).toBe('false')
  })

  it('renders a rosetta index and one page per task', async () => {
    const index = await mountAt('/tasks')
    expect(index.get('h1').text()).toBe('Programs with a finish line.')
    expect(index.get('[data-test="page-hero-graphic"]').text()).toContain('stdin')
    const statuses = index.findAll('[data-test="task-status"]')
    expect(statuses).toHaveLength(catalog.tasks.length * catalog.guests.length)
    expect(index.find('[data-test="page-sidebar"]').exists()).toBe(false)
    expect(index.text()).not.toContain('Placeholder')
    expect(index.get('[data-test="program-leaderboard"]').text()).toContain('Passed')
    expect(index.get('[data-test="program-leaderboard"]').text()).toContain('Rule lines')
    expect(index.get('[data-test="program-leaderboard"]').text()).toContain('Steps')
    const names = index.findAll('[data-test="program-row"]').map(row => row.attributes('data-program'))
    expect(names).toEqual(rankGuests(catalog.guests).map(program => program.id))
    expect(index.get('[data-test="program-improve"]').text().toLowerCase()).toContain('autoresearch')
    expect(index.get('[data-test="program-leaderboard"]').text()).not.toMatch(/\bguest\b/i)

    const task = catalog.tasks[0]
    const page = await mountAt(task.path)
    expect(page.get('h1').text()).toBe(task.title)
    expect(page.get('[data-test="task-description"]').text()).toContain(task.summary)
    expect(page.get('[data-test="task-io"]').text()).toContain('Input and output')
    for (const item of task.cases) {
      expect(page.get('[data-test="task-io"]').text()).toContain('stdin')
      expect(page.get('[data-test="task-io"]').text()).toContain('stdout')
      expect(page.get('[data-test="task-io"]').text()).toContain(String(item.exitCode))
    }
    const links = pageLinks(task.path).map(link => link.title)
    expect(links).toContain('Description')
    expect(links).toContain('Input and output')
    expect(page.get('[data-test="problem-history"]').text()).toContain('regex evals')
    expect(page.get('[data-test="pareto-version"][data-version="direct"]').text()).toContain('direct')
    expect(page.get('[data-test="pareto-version"][data-version="lisp"]').text()).toContain('Missing.')
    expect(page.get('[data-test="pareto-version"][data-version="forth"]').text()).toContain('Missing.')
    expect(page.get('[data-test="pareto-version"][data-version="basic"]').text()).toContain('Missing.')
    expect(page.get('[data-test="pareto-chart"]').attributes('data-scale')).toBe('log')
    expect(page.text()).not.toContain('RE2')
    expect(page.findAll('[data-test="task-guest"]')).toHaveLength(catalog.guests.length)
    for (const guest of task.guests) {
      const section = page.get(`[data-test="task-guest"][data-guest="${guest.id}"]`)
      expect(section.text()).toContain(guest.status)
      if (guest.solution !== null) expect(section.text()).toContain(guest.solution.trim())
      if (guest.reason !== null) expect(section.text()).toContain(guest.reason)
    }
  })

  it('says when a task id is not in the suite', async () => {
    const wrapper = await mountAt('/tasks/not-a-task')
    expect(wrapper.get('h1').text()).toBe('This task is not in the suite.')
    expect(wrapper.get('[data-test="task-missing"]').text()).toContain('not-a-task')
    expect(taskRouteMeta('not-a-task').robots).toBe('noindex,follow')
    const known = catalog.tasks[0]
    expect(taskRouteMeta(known.id)).toEqual({
      documentTitle: known.documentTitle,
      description: known.summary,
      canonical: known.canonical,
      robots: 'index,follow',
    })
  })
})
