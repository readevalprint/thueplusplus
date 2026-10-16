<script setup lang="ts">
import { PanelRight } from '@lucide/vue'
import { computed } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { tocToggle } from '@/tocToggle'
import PageSidebar from './PageSidebar.vue'
import SiteNav from './SiteNav.vue'
import ThemeToggle from './ThemeToggle.vue'

const route = useRoute()
const showPageSidebar = computed(() => route.path !== '/playground')
</script>

<template>
  <SidebarProvider cookie-name="sidebar_nav" class="h-svh overflow-hidden" data-test="app-shell">
    <SiteNav />
    <SidebarInset class="h-full min-h-0 overflow-hidden">
      <header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger data-test="nav-trigger" aria-label="Open navigation" />
        <RouterLink to="/" class="font-semibold tracking-tight">Thue++</RouterLink>
        <div class="ml-auto flex items-center gap-1">
          <Button v-if="showPageSidebar" variant="ghost" size="icon" data-test="toc-trigger" aria-label="Open page sidebar" @click="tocToggle?.()">
            <PanelRight />
          </Button>
          <ThemeToggle />
          <Button as="a" variant="ghost" href="https://gitlab.com/thuelang/thueplusplus" rel="noreferrer">GitLab</Button>
        </div>
      </header>
      <SidebarProvider cookie-name="sidebar_toc" :shortcut="false" class="min-h-0 w-auto flex-1 overflow-hidden">
        <div class="@container/page min-h-0 min-w-0 flex-1 overflow-y-auto">
          <RouterView />
        </div>
        <PageSidebar v-if="showPageSidebar" />
      </SidebarProvider>
    </SidebarInset>
  </SidebarProvider>
</template>
