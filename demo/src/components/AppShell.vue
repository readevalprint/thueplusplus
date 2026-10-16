<script setup lang="ts">
import { RouterLink, RouterView } from 'vue-router'
import { Button } from '@/components/ui/button'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import SiteNav from './SiteNav.vue'
import ThemeToggle from './ThemeToggle.vue'
</script>

<template>
  <SidebarProvider cookie-name="sidebar_nav" class="h-svh overflow-hidden" data-test="app-shell">
    <SiteNav />
    <SidebarInset class="h-full min-h-0 overflow-hidden">
      <header class="flex h-14 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger data-test="nav-trigger" aria-label="Open navigation" />
        <RouterLink to="/" class="font-semibold tracking-tight">Thue++</RouterLink>
        <div class="ml-auto flex items-center gap-1">
          <ThemeToggle />
          <Button as="a" variant="ghost" href="https://gitlab.com/thuelang/thueplusplus" rel="noreferrer">GitLab</Button>
        </div>
      </header>
      <div class="@container/page min-h-0 min-w-0 flex-1 overflow-y-auto">
        <RouterView />
      </div>
    </SidebarInset>
  </SidebarProvider>
</template>
