<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()

const groups = [
  {
    label: 'Read',
    items: [
      { title: 'Learn', path: '/learn' },
      { title: 'Reference', path: '/reference' },
    ],
  },
  {
    label: 'Run',
    items: [
      { title: 'Playground', path: '/playground' },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { title: 'Hosts', path: '/hosts' },
      { title: 'Guests', path: '/guests' },
      { title: 'Tasks', path: '/tasks' },
    ],
  },
]

function active(path: string): boolean {
  return route.path === path
}
</script>

<template>
  <nav class="flex flex-col gap-6 px-4 py-4 font-mono text-[13px]" aria-label="Contents">
    <section v-for="group in groups" :key="group.label">
      <h2 class="text-dim mb-2 text-[11px] tracking-[0.08em] uppercase">{{ group.label }}</h2>
      <ul>
        <li v-for="item in group.items" :key="item.path">
          <RouterLink
            :to="item.path"
            class="block border-l-2 px-3 py-1.5 lowercase transition-colors duration-150"
            :class="active(item.path) ? 'border-signal bg-raised text-bone' : 'text-ash hover:text-bone border-transparent'"
            :aria-current="active(item.path) ? 'page' : undefined"
          >
            {{ item.title }}
          </RouterLink>
        </li>
      </ul>
    </section>
  </nav>
</template>
