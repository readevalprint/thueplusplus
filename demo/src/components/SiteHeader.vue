<script setup lang="ts">
import { Menu } from '@lucide/vue'
import { ref, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from '@/components/ui/navigation-menu'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { mirrorUrl, repositoryUrl } from '@/hosts'
import { navDirect, navGroupCurrent, navGroups, navItemCurrent } from '@/nav'
import { cn } from '@/lib/utils'
import Mark from './Mark.vue'
import ThemeToggle from './ThemeToggle.vue'

const route = useRoute()
const menuOpen = ref(false)

watch(() => route.fullPath, () => {
  menuOpen.value = false
})

const triggerClass = 'h-8 bg-transparent px-2 font-mono text-[13px] lowercase text-ash shadow-none hover:bg-transparent hover:text-bone focus:bg-transparent focus:text-bone data-[state=open]:bg-transparent data-[state=open]:text-bone data-[state=open]:hover:bg-transparent data-[state=open]:focus:bg-transparent'
</script>

<template>
  <header data-test="site-header" class="bg-void border-line sticky top-0 z-30 flex h-[52px] items-center gap-3 border-b px-4 font-mono text-[13px] sm:px-6">
    <RouterLink to="/" class="flex items-center gap-2 text-bone" :aria-current="route.path === '/' ? 'page' : undefined">
      <Mark />
      <span class="font-display font-semibold tracking-[-0.03em] max-[640px]:sr-only">Thue++</span>
    </RouterLink>
    <nav class="ml-1 hidden min-w-0 items-center lg:flex" data-test="site-nav" aria-label="Site">
      <NavigationMenu :viewport="false">
        <NavigationMenuList class="gap-0">
          <NavigationMenuItem v-for="group in navGroups" :key="group.title">
            <NavigationMenuTrigger
              :class="cn(triggerClass, navGroupCurrent(route.path, group) ? 'text-bone' : undefined)"
              :aria-current="navGroupCurrent(route.path, group) ? 'true' : undefined"
            >
              {{ group.title }}
            </NavigationMenuTrigger>
            <NavigationMenuContent class="bg-surface text-bone border-line z-40 border shadow-none">
              <ul class="grid w-[560px] grid-cols-2 gap-1 p-3">
                <li v-for="item in group.items" :key="item.to">
                  <NavigationMenuLink as-child :active="navItemCurrent(route.path, route.hash, item.to)">
                    <RouterLink
                      :to="item.to"
                      class="hover:bg-raised focus:bg-raised block rounded-sm p-3 no-underline outline-none"
                      :aria-current="navItemCurrent(route.path, route.hash, item.to) ? 'page' : undefined"
                    >
                      <div class="text-bone text-[13px] leading-5 font-medium">{{ item.title }}</div>
                      <p class="text-ash mt-1 text-[13px] leading-snug">{{ item.description }}</p>
                    </RouterLink>
                  </NavigationMenuLink>
                </li>
              </ul>
            </NavigationMenuContent>
          </NavigationMenuItem>
          <NavigationMenuItem v-for="link in navDirect" :key="link.to">
            <NavigationMenuLink as-child :active="route.path === link.to">
              <RouterLink
                :to="link.to"
                :class="cn(navigationMenuTriggerStyle(), triggerClass, route.path === link.to ? 'text-bone' : undefined)"
                :aria-current="route.path === link.to ? 'page' : undefined"
              >
                {{ link.title }}
              </RouterLink>
            </NavigationMenuLink>
          </NavigationMenuItem>
        </NavigationMenuList>
      </NavigationMenu>
    </nav>
    <div class="flex-1" />
    <ThemeToggle />
    <a class="text-ash hover:text-bone lowercase transition-colors duration-150" data-test="github-link" :href="repositoryUrl" rel="noreferrer">github</a>
    <a class="text-ash hover:text-bone hidden lowercase transition-colors duration-150 sm:inline" data-test="gitlab-link" :href="mirrorUrl" rel="noreferrer">gitlab</a>
    <Sheet v-model:open="menuOpen">
      <SheetTrigger as-child>
        <Button variant="ghost" size="icon" class="lg:hidden" data-test="menu-toggle" aria-label="Open menu" :aria-expanded="menuOpen">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" class="bg-void border-line w-80 overflow-y-auto">
        <SheetHeader>
          <SheetTitle class="font-mono text-[13px] lowercase">Menu</SheetTitle>
          <SheetDescription class="sr-only">Docs, Install, Projects, Metrics, Playground, Contribute, and the autoresearch prompt.</SheetDescription>
        </SheetHeader>
        <nav class="flex flex-col gap-6 px-4 pb-8 font-mono text-[13px]" data-test="site-menu" aria-label="Site">
          <div v-for="group in navGroups" :key="group.title" class="flex flex-col gap-1">
            <p class="text-dim px-3 py-1 text-[11px] tracking-[0.08em] uppercase">{{ group.title }}</p>
            <RouterLink
              v-for="item in group.items"
              :key="item.to"
              :to="item.to"
              class="hover:bg-raised block px-3 py-2"
              :aria-current="navItemCurrent(route.path, route.hash, item.to) ? 'page' : undefined"
              @click="menuOpen = false"
            >
              <span class="text-bone block">{{ item.title }}</span>
              <span class="text-ash mt-1 block leading-snug">{{ item.description }}</span>
            </RouterLink>
          </div>
          <div class="flex flex-col">
            <RouterLink
              v-for="link in navDirect"
              :key="link.to"
              :to="link.to"
              class="text-ash hover:text-bone px-3 py-3 lowercase"
              :class="route.path === link.to ? 'text-bone' : undefined"
              :aria-current="route.path === link.to ? 'page' : undefined"
              @click="menuOpen = false"
            >
              {{ link.title }}
            </RouterLink>
          </div>
          <div class="flex gap-4 px-3 font-mono text-[13px]">
            <a class="text-ash hover:text-bone lowercase" :href="repositoryUrl" rel="noreferrer">github</a>
            <a class="text-ash hover:text-bone lowercase" :href="mirrorUrl" rel="noreferrer">gitlab</a>
          </div>
        </nav>
      </SheetContent>
    </Sheet>
  </header>
</template>
