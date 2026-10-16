import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { createMemoryHistory, createRouter } from 'vue-router'
import GuestsPage from './pages/GuestsPage.vue'
import TaskPage from './pages/TaskPage.vue'
import TasksPage from './pages/TasksPage.vue'
import { catalog, rankGuests, taskRouteMeta } from './catalog'
import { pageLinks } from './site'

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/guests', component: GuestsPage },
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
      { id: 'lisp', name: 'Lisp', program: 'lisp.tpp', ruleCount: 394, passCount: 4, taskCount: 10, stepCount: 13000 },
      { id: 'forth', name: 'Forth', program: 'forth.tpp', ruleCount: 45, passCount: 2, taskCount: 10, stepCount: 128 },
      { id: 'basic', name: 'Basic', program: 'basic.tpp', ruleCount: 10, passCount: 4, taskCount: 10, stepCount: 13000 },
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
      expect(guest.ruleCount).toBeGreaterThan(0)
    }
    for (const task of catalog.tasks) {
      expect(task.path).toBe(`/tasks/${task.id}`)
      expect(task.cases.length).toBeGreaterThan(0)
      expect(task.cases.every(item => Number.isInteger(item.exitCode))).toBe(true)
      expect(task.guests).toHaveLength(catalog.guests.length)
    }
  })

  it('renders the guests leaderboard and the autoresearch call', async () => {
    const wrapper = await mountAt('/guests')
    expect(wrapper.get('h1').text()).toBe('Languages written in Thue++.')
    expect(wrapper.get('[data-test="page-hero-graphic"]').text()).toContain('::=')
    expect(wrapper.get('[data-test="guest-leaderboard"]').text()).toContain('Passed')
    expect(wrapper.get('[data-test="guest-leaderboard"]').text()).toContain('Rule lines')
    expect(wrapper.get('[data-test="guest-leaderboard"]').text()).toContain('Steps')
    const names = wrapper.findAll('[data-test="guest-row"]').map(row => row.attributes('data-guest'))
    expect(names).toEqual(rankGuests(catalog.guests).map(guest => guest.id))
    expect(wrapper.get('[data-test="guest-improve"]').text().toLowerCase()).toContain('autoresearch')
    expect(wrapper.get('[data-test="rule-readout"]').text()).toContain('886882cdd2cf')
    expect(wrapper.get('[data-test="rule-readout"]').text()).toContain('Forth · 86')
    expect(wrapper.get('[data-test="task-readout"]').text()).toContain('Lisp · 10 pass · 0 fail · 0 unsupported · 50254 steps')
    expect(wrapper.get('[data-test="benchmark-readout"]').text()).toContain('steps 10000 · probes 10002')
    expect(wrapper.get('[data-test="benchmark-readout"]').text()).toContain('wasm · 2111 ms')
    expect(wrapper.get('[data-test="rule-chart"]').find('path').exists()).toBe(true)
    expect(wrapper.find('[data-test="page-sidebar"]').exists()).toBe(false)
    expect(wrapper.text()).not.toContain('Placeholder')
    expect(wrapper.text()).not.toContain('RE2')
  })

  it('renders a rosetta index and one page per task', async () => {
    const index = await mountAt('/tasks')
    expect(index.get('h1').text()).toBe('Programs with a finish line.')
    expect(index.get('[data-test="page-hero-graphic"]').text()).toContain('stdin')
    const statuses = index.findAll('[data-test="task-status"]')
    expect(statuses).toHaveLength(catalog.tasks.length * catalog.guests.length)
    expect(index.find('[data-test="page-sidebar"]').exists()).toBe(false)
    expect(index.text()).not.toContain('Placeholder')

    const task = catalog.tasks[0]
    const page = await mountAt(task.path)
    expect(page.get('h1').text()).toBe(task.title)
    expect(page.get('[data-test="task-description"]').text()).toContain(task.summary)
    expect(page.get('[data-test="task-io"]').text()).toContain('stdin')
    expect(page.get('[data-test="task-io"]').text()).toContain('stdout')
    expect(page.get('[data-test="task-io"]').text()).toContain(String(task.cases[0].exitCode))
    const links = pageLinks(task.path).map(link => link.title)
    expect(links).toContain('Description')
    expect(links).toContain('Input and output')
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
