<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { SplitterResizeHandle, type SplitterResizeHandleProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = withDefaults(defineProps<SplitterResizeHandleProps & {
  class?: HTMLAttributes['class']
  withHandle?: boolean
}>(), {
  withHandle: true,
})
const forwarded = computed(() => {
  const { class: _class, withHandle: _withHandle, ...rest } = props
  return rest
})
</script>

<template>
  <SplitterResizeHandle
    v-bind="forwarded"
    data-slot="resizable-handle"
    :class="cn('resizable-handle', props.class)"
  >
    <span v-if="withHandle" class="resizable-handle-grip" />
  </SplitterResizeHandle>
</template>
