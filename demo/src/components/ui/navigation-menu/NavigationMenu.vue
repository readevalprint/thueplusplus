<script setup lang="ts">
import type { NavigationMenuRootEmits, NavigationMenuRootProps, NavigationMenuViewportProps } from "reka-ui"
import type { HTMLAttributes } from "vue"
import { reactiveOmit } from "@vueuse/core"
import {
  NavigationMenuRoot,
  useForwardPropsEmits,
} from "reka-ui"
import { cn } from "@/lib/utils"
import NavigationMenuViewport from "./NavigationMenuViewport.vue"

const props = withDefaults(defineProps<NavigationMenuRootProps & {
  class?: HTMLAttributes["class"]
  viewport?: boolean
  viewportAlign?: NavigationMenuViewportProps["align"]
}>(), {
  viewport: true,
  viewportAlign: "center",
})
const emits = defineEmits<NavigationMenuRootEmits>()

const delegatedProps = reactiveOmit(props, "class", "viewport", "viewportAlign")
const forwarded = useForwardPropsEmits(delegatedProps, emits)
</script>

<template>
  <NavigationMenuRoot
    v-slot="slotProps"
    data-slot="navigation-menu"
    :data-viewport="viewport"
    v-bind="forwarded"
    :class="cn('group/navigation-menu relative flex max-w-max flex-1 items-center justify-center', props.class)"
  >
    <slot v-bind="slotProps" />
    <NavigationMenuViewport v-if="viewport" :align="viewportAlign" />
  </NavigationMenuRoot>
</template>
