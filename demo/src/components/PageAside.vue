<script setup lang="ts">
import { defineComponent, watch } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar'
import type { PageLink } from '@/site'

withDefaults(defineProps<{
  links?: PageLink[]
  label?: string
}>(), {
  links: () => [],
  label: 'On this page',
})

const AsideChrome = defineComponent({
  name: 'AsideChrome',
  setup() {
    const route = useRoute()
    const { setOpenMobile } = useSidebar()
    watch(() => route.fullPath, () => setOpenMobile(false))
    return () => null
  },
})
</script>

<template>
  <SidebarProvider cookie-name="sidebar_aside" :shortcut="false" class="min-h-0 w-full">
    <AsideChrome />
    <div class="relative min-w-0 flex-1">
      <SidebarTrigger data-test="aside-trigger" aria-label="Open page sidebar" class="absolute top-3 right-3 z-10 xl:hidden" />
      <slot />
    </div>
    <Sidebar side="right" collapsible="icon" class="top-(--header-height)! h-[calc(100svh-var(--header-height))]!">
      <SidebarContent data-test="page-sidebar">
        <SidebarGroup>
          <SidebarGroupLabel>{{ label }}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu v-if="links.length">
              <SidebarMenuItem v-for="link in links" :key="link.href">
                <SidebarMenuButton as-child>
                  <RouterLink v-if="link.href.startsWith('/')" :to="link.href">
                    <span>{{ link.title }}</span>
                  </RouterLink>
                  <a v-else :href="link.href">
                    <span>{{ link.title }}</span>
                  </a>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
            <slot name="aside" />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  </SidebarProvider>
</template>
