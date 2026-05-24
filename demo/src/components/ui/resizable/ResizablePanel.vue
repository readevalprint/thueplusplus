<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { SplitterPanel, type SplitterPanelProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SplitterPanelProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <SplitterPanel
    v-bind="props"
    data-slot="resizable-panel"
    :class="cn('resizable-panel', props.class)"
  >
    <slot />
  </SplitterPanel>
</template>
