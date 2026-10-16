<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'
import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { pageLinks, type PageLink } from '@/site'
import { tocToggle } from '@/tocToggle'

const route = useRoute()
const { toggleSidebar, setOpenMobile } = useSidebar()
const links = computed(() => pageLinks(route.path))

onMounted(() => {
  tocToggle.value = toggleSidebar
})

onBeforeUnmount(() => {
  if (tocToggle.value === toggleSidebar) tocToggle.value = null
})

watch(() => route.path, () => setOpenMobile(false))

function internal(link: PageLink): boolean {
  return link.href.startsWith('/')
}
</script>

<template>
  <Sidebar side="right" collapsible="icon">
    <SidebarContent data-test="page-sidebar">
      <SidebarGroup>
        <SidebarGroupLabel>On this page</SidebarGroupLabel>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem v-for="link in links" :key="link.href">
              <SidebarMenuButton as-child tooltip="On this page">
                <RouterLink v-if="internal(link)" :to="link.href">
                  <span>{{ link.title }}</span>
                </RouterLink>
                <a v-else :href="link.href">
                  <span>{{ link.title }}</span>
                </a>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>
    </SidebarContent>
    <SidebarRail />
  </Sidebar>
</template>
