<script setup lang="ts">
import { Menu } from '@lucide/vue'
import { ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import Mark from './Mark.vue'
import ThemeToggle from './ThemeToggle.vue'

const route = useRoute()
const menuOpen = ref(false)

const links = [
  { title: 'Learn', path: '/learn' },
  { title: 'Reference', path: '/reference' },
  { title: 'Playground', path: '/playground' },
  { title: 'Hosts', path: '/hosts' },
  { title: 'Guests', path: '/guests' },
  { title: 'Tasks', path: '/tasks' },
]

watch(() => route.path, () => {
  menuOpen.value = false
})

function current(path: string): 'page' | undefined {
  return route.path === path ? 'page' : undefined
}
</script>

<template>
  <header class="bg-void border-line sticky top-0 z-30 flex h-[52px] items-center gap-3 border-b px-4 font-mono text-[13px] sm:px-6">
    <RouterLink to="/" class="flex items-center gap-2 text-bone" :aria-current="route.path === '/' ? 'page' : undefined">
      <Mark />
      <span class="font-display font-semibold tracking-[-0.03em] max-[640px]:sr-only">Thue++</span>
    </RouterLink>
    <nav class="ml-3 hidden items-center gap-4 lg:flex" data-test="site-nav" aria-label="Site">
      <RouterLink
        v-for="link in links"
        :key="link.path"
        :to="link.path"
        class="text-ash hover:text-bone lowercase transition-colors duration-150"
        :class="current(link.path) ? 'text-bone' : undefined"
        :aria-current="current(link.path)"
      >
        {{ link.title }}
      </RouterLink>
    </nav>
    <div class="flex-1" />
    <ThemeToggle />
    <a class="text-ash hover:text-bone lowercase transition-colors duration-150" data-test="github-link" href="https://github.com/readevalprint/thueplusplus" rel="noreferrer">github</a>
    <Sheet v-model:open="menuOpen">
      <SheetTrigger as-child>
        <Button variant="ghost" size="icon" class="lg:hidden" data-test="menu-toggle" aria-label="Open menu" :aria-expanded="menuOpen">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" class="bg-void border-line w-72">
        <SheetHeader>
          <SheetTitle class="font-mono text-[13px] lowercase">Menu</SheetTitle>
          <SheetDescription class="sr-only">Learn, Reference, Playground, Hosts, Guests, and Tasks.</SheetDescription>
        </SheetHeader>
        <nav class="flex flex-col px-2 font-mono text-[13px]" data-test="site-menu" aria-label="Site">
          <RouterLink
            v-for="link in links"
            :key="link.path"
            :to="link.path"
            class="text-ash hover:text-bone px-3 py-3 lowercase transition-colors duration-150"
            :class="current(link.path) ? 'text-bone' : undefined"
            :aria-current="current(link.path)"
            @click="menuOpen = false"
          >
            {{ link.title }}
          </RouterLink>
        </nav>
      </SheetContent>
    </Sheet>
  </header>
</template>
