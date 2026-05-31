<script setup lang="ts">
import type { CollapsibleTriggerProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { CollapsibleTrigger } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<CollapsibleTriggerProps & {
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <CollapsibleTrigger
    data-slot="collapsible-trigger"
    :as="props.as"
    :as-child="props.asChild"
    :class="cn(props.class)"
  >
    <slot />
  </CollapsibleTrigger>
</template>
