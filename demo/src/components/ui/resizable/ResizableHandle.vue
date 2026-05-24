<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { SplitterResizeHandle, type SplitterResizeHandleProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<SplitterResizeHandleProps & {
  class?: HTMLAttributes['class']
  withHandle?: boolean
}>(), {
  withHandle: false,
})
</script>

<template>
  <SplitterResizeHandle
    v-bind="props"
    data-slot="resizable-handle"
    :class="cn('resizable-handle', props.class)"
  >
    <span v-if="withHandle" class="resizable-handle-grip" />
  </SplitterResizeHandle>
</template>
