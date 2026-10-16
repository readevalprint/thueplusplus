<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import Mark from './Mark.vue'
import ThemeToggle from './ThemeToggle.vue'

const route = useRoute()

const links = [
  { title: 'Learn', path: '/learn' },
  { title: 'Reference', path: '/reference' },
  { title: 'Hosts', path: '/hosts' },
  { title: 'Guests', path: '/guests' },
  { title: 'Tasks', path: '/tasks' },
]

const crumb = computed(() => {
  if (route.path === '/') return 'home'
  return links.find(link => link.path === route.path)?.title.toLowerCase() ?? 'docs'
})
</script>

<template>
  <header class="bg-void border-line sticky top-0 z-30 flex h-[52px] items-center gap-3 border-b px-4 font-mono text-[13px] sm:px-6">
    <RouterLink to="/" class="flex items-center gap-2 text-bone" :aria-current="route.path === '/' ? 'page' : undefined">
      <Mark />
      <span class="font-display font-semibold tracking-[-0.03em] max-[640px]:sr-only">Thue++</span>
    </RouterLink>
    <span class="text-dim" aria-hidden="true">/</span>
    <span class="text-ash lowercase">{{ crumb }}</span>
    <nav class="ml-3 hidden items-center gap-4 md:flex" aria-label="Site">
      <RouterLink
        v-for="link in links"
        :key="link.path"
        :to="link.path"
        class="text-ash hover:text-bone lowercase transition-colors duration-150"
        :class="route.path === link.path ? 'text-bone' : undefined"
        :aria-current="route.path === link.path ? 'page' : undefined"
      >
        {{ link.title }}
      </RouterLink>
    </nav>
    <div class="flex-1" />
    <ThemeToggle />
    <a class="text-ash hover:text-bone lowercase transition-colors duration-150" href="https://gitlab.com/thuelang/thueplusplus" rel="noreferrer">
      <span class="max-[800px]:sr-only">gitlab</span>
      <span class="hidden max-[800px]:inline" aria-hidden="true">gl</span>
    </a>
    <Button v-if="route.path !== '/'" as-child variant="outline" class="border-signal text-signal hover:bg-signal hover:text-[#0a0a0c]">
      <RouterLink to="/playground">playground →</RouterLink>
    </Button>
  </header>
</template>
