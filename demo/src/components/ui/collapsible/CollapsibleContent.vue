<script setup lang="ts">
import type { CollapsibleContentProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { CollapsibleContent } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<CollapsibleContentProps & {
  class?: HTMLAttributes['class']
}>()
</script>

<template>
  <CollapsibleContent
    data-slot="collapsible-content"
    :as="props.as"
    :as-child="props.asChild"
    :force-mount="props.forceMount"
    :class="cn(props.class)"
  >
    <slot />
  </CollapsibleContent>
</template>
