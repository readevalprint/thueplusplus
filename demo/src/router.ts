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
import EmbedPage from './pages/EmbedPage.vue'
import GuestsPage from './pages/GuestsPage.vue'
import HomePage from './pages/HomePage.vue'
import HostsPage from './pages/HostsPage.vue'
import LearnPage from './pages/LearnPage.vue'
import PlaygroundPage from './PlaygroundPage.vue'
import ReferencePage from './pages/ReferencePage.vue'
import TasksPage from './pages/TasksPage.vue'
import { pages } from './site'

const shell = [
  { page: pages.home, component: HomePage },
  { page: pages.learn, component: LearnPage },
  { page: pages.reference, component: ReferencePage },
  { page: pages.playground, component: PlaygroundPage },
  { page: pages.hosts, component: HostsPage },
  { page: pages.guests, component: GuestsPage },
  { page: pages.tasks, component: TasksPage },
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
]

export function createAppRouter() {
  const router = createRouter({
    history: createWebHistory(),
    routes,
  })
  router.beforeEach((to) => {
    if (to.path.length > 1 && to.path.endsWith('/')) {
      return { path: to.path.replace(/\/+$/, ''), query: to.query, hash: to.hash, replace: true }
    }
  })
  return router
}
