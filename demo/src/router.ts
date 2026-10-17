import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'

declare module 'vue-router' {
  interface RouteMeta {
    layout?: 'bare'
    documentTitle?: string
    description?: string
    canonical?: string
    robots?: string
  }
}
import { problemRouteMeta } from './catalog'
import EmbedPage from './pages/EmbedPage.vue'
import HomePage from './pages/HomePage.vue'
import InstallPage from './pages/InstallPage.vue'
import InstallPlatformPage from './pages/InstallPlatformPage.vue'
import LearnPage from './pages/LearnPage.vue'
import MetricsPage from './pages/MetricsPage.vue'
import PlaygroundPage from './PlaygroundPage.vue'
import ProjectsPage from './pages/ProjectsPage.vue'
import ReferencePage from './pages/ReferencePage.vue'
import ProblemPage from './pages/ProblemPage.vue'
import ProblemsPage from './pages/ProblemsPage.vue'
import { pages } from './site'

const shell = [
  { page: pages.home, component: HomePage },
  { page: pages.guides, component: LearnPage },
  { page: pages.language, component: ReferencePage },
  { page: pages.install, component: InstallPage },
  { page: pages.installGo, component: InstallPlatformPage },
  { page: pages.installPython, component: InstallPlatformPage },
  { page: pages.installJs, component: InstallPlatformPage },
  { page: pages.installRust, component: InstallPlatformPage },
  { page: pages.installCpp, component: InstallPlatformPage },
  { page: pages.projects, component: ProjectsPage },
  { page: pages.metrics, component: MetricsPage },
  { page: pages.problems, component: ProblemsPage },
]

export const routes: RouteRecordRaw[] = [
  ...shell.map(({ page, component }): RouteRecordRaw => ({
    path: page.path,
    component,
    meta: {
      documentTitle: page.documentTitle,
      description: page.description,
      canonical: page.canonical,
      robots: page.robots,
    },
  })),
  {
    path: pages.playground.path,
    component: PlaygroundPage,
    meta: {
      layout: 'bare',
      documentTitle: pages.playground.documentTitle,
      description: pages.playground.description,
      canonical: pages.playground.canonical,
      robots: pages.playground.robots,
    },
  },
  {
    path: '/embed',
    component: EmbedPage,
    meta: {
      layout: 'bare',
      documentTitle: 'Thue++ Embed',
      description: 'Embeddable Thue++ playground surface.',
      canonical: 'https://thuelang.org/embed',
      robots: 'noindex,follow',
    },
  },
  {
    path: '/problems/:problemId',
    component: ProblemPage,
  },
]

export function createAppRouter() {
  const router = createRouter({
    history: createWebHistory(),
    routes,
    scrollBehavior(to, _from, saved) {
      if (saved) return saved
      if (to.hash) return { el: to.hash, top: 72 }
      return { top: 0 }
    },
  })
  router.beforeEach((to) => {
    const problemId = to.params.problemId
    if (typeof problemId === 'string') {
      const meta = problemRouteMeta(problemId)
      to.meta.documentTitle = meta.documentTitle
      to.meta.description = meta.description
      to.meta.canonical = meta.canonical
      to.meta.robots = meta.robots
    }
    if (to.path.length > 1 && to.path.endsWith('/')) {
      return { path: to.path.replace(/\/+$/, ''), query: to.query, hash: to.hash, replace: true }
    }
  })
  return router
}
