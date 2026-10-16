<script setup lang="ts">
import type { HTMLAttributes } from "vue"
import { defaultDocument, useEventListener, useMediaQuery } from "@vueuse/core"
import { cn } from "@/lib/utils"
import { TooltipProvider } from "reka-ui"
import { computed, getCurrentInstance, ref, watch } from "vue"
import { provideSidebarContext, SIDEBAR_COOKIE_MAX_AGE, SIDEBAR_COOKIE_NAME, SIDEBAR_KEYBOARD_SHORTCUT, SIDEBAR_WIDTH, SIDEBAR_WIDTH_ICON } from "./utils"

const props = withDefaults(defineProps<{
  defaultOpen?: boolean
  open?: boolean
  class?: HTMLAttributes["class"]
  cookieName?: string
  shortcut?: string | false
}>(), {
  open: undefined,
  cookieName: SIDEBAR_COOKIE_NAME,
  shortcut: SIDEBAR_KEYBOARD_SHORTCUT,
})

const emits = defineEmits<{
  "update:open": [open: boolean]
}>()

// Tablet and phone use the sheet. Desktop (1280px and up) is the collapsible sidebar.
const isMobile = useMediaQuery("(max-width: 1279px)")
const openMobile = ref(false)
const cookieOpen = !defaultDocument?.cookie.includes(`${props.cookieName}=false`)
const vnodeProps = getCurrentInstance()?.vnode.props ?? {}
const controlled = vnodeProps.open !== undefined || "onUpdate:open" in vnodeProps
const open = ref(controlled
  ? Boolean(props.open)
  : (typeof vnodeProps.defaultOpen === "boolean" ? vnodeProps.defaultOpen : cookieOpen))

watch(() => props.open, (value) => {
  if (controlled && value !== undefined) open.value = value
})

function setOpen(value: boolean) {
  open.value = value
  emits("update:open", value)
  document.cookie = `${props.cookieName}=${open.value}; path=/; max-age=${SIDEBAR_COOKIE_MAX_AGE}`
}

function setOpenMobile(value: boolean) {
  openMobile.value = value
}

// Helper to toggle the sidebar.
function toggleSidebar() {
  return isMobile.value ? setOpenMobile(!openMobile.value) : setOpen(!open.value)
}

useEventListener("keydown", (event: KeyboardEvent) => {
  if (!props.shortcut) return
  if (event.key === props.shortcut && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    toggleSidebar()
  }
})

// We add a state so that we can do data-state="expanded" or "collapsed".
// This makes it easier to style the sidebar with Tailwind classes.
const state = computed(() => open.value ? "expanded" : "collapsed")

provideSidebarContext({
  state,
  open,
  setOpen,
  isMobile,
  openMobile,
  setOpenMobile,
  toggleSidebar,
})
</script>

<template>
  <TooltipProvider :delay-duration="0">
    <div
      data-slot="sidebar-wrapper"
      :style="{
        '--sidebar-width': SIDEBAR_WIDTH,
        '--sidebar-width-icon': SIDEBAR_WIDTH_ICON,
      }"
      :class="cn('group/sidebar-wrapper has-data-[variant=inset]:bg-sidebar flex min-h-svh w-full', props.class)"
      v-bind="$attrs"
    >
      <slot />
    </div>
  </TooltipProvider>
</template>
