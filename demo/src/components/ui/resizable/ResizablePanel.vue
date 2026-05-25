<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { SplitterPanel, type SplitterPanelProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SplitterPanelProps & { class?: HTMLAttributes['class'] }>()
const forwarded = computed(() => {
  const { class: _class, ...rest } = props
  return rest
})
</script>

<template>
  <SplitterPanel
    v-bind="forwarded"
    data-slot="resizable-panel"
    :class="cn('resizable-panel', props.class)"
  >
    <slot />
  </SplitterPanel>
</template>
