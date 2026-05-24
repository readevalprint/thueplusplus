<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { SplitterGroup, type SplitterGroupProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SplitterGroupProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <SplitterGroup
    v-bind="props"
    data-slot="resizable-panel-group"
    :class="cn('resizable-panel-group', props.class)"
  >
    <slot />
  </SplitterGroup>
</template>
