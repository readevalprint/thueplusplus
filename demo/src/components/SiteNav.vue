<script setup lang="ts">
import type { Component } from 'vue'
import { Boxes, Package, Regex, Replace } from '@lucide/vue'
import FinishLine from '@/components/marks/FinishLine.vue'
import RewriteArrow from '@/components/marks/RewriteArrow.vue'
import { RouterLink, useRoute } from 'vue-router'
import { watch } from 'vue'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'

const route = useRoute()
const { setOpenMobile } = useSidebar()

watch(() => route.path, () => setOpenMobile(false))

const groups: { label: string, items: { title: string, path: string, icon: Component }[] }[] = [
  {
    label: 'Read',
    items: [
      { title: 'Learn', path: '/learn', icon: RewriteArrow },
      { title: 'Reference', path: '/reference', icon: Regex },
    ],
  },
  {
    label: 'Run',
    items: [
      { title: 'Playground', path: '/playground', icon: Replace },
    ],
  },
  {
    label: 'Catalog',
    items: [
      { title: 'Hosts', path: '/hosts', icon: Package },
      { title: 'Guests', path: '/guests', icon: Boxes },
      { title: 'Tasks', path: '/tasks', icon: FinishLine },
    ],
  },
]

function active(path: string): boolean {
  if (path === '/tasks') return route.path === '/tasks' || route.path.startsWith('/tasks/')
  return route.path === path
}
</script>

<template>
  <Sidebar collapsible="icon">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child tooltip="Thue++" :is-active="route.path === '/'">
            <RouterLink to="/">
              <span class="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 items-center justify-center rounded-md text-xs font-semibold">++</span>
              <span class="font-semibold">Thue++</span>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
    <SidebarContent data-test="site-nav">
      <SidebarGroup v-for="group in groups" :key="group.label">
        <SidebarGroupLabel>{{ group.label }}</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="item in group.items" :key="item.path">
              <SidebarMenuButton as-child :tooltip="item.title" :is-active="active(item.path)">
                <RouterLink :to="item.path">
                  <component :is="item.icon" />
                  <span>{{ item.title }}</span>
                </RouterLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarRail />
  </Sidebar>
</template>
