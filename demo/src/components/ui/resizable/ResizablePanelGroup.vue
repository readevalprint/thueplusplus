<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import { computed } from 'vue'
import { SplitterGroup, type SplitterGroupProps } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SplitterGroupProps & { class?: HTMLAttributes['class'] }>()
const forwarded = computed(() => {
  const { class: _class, ...rest } = props
  return rest
})
</script>

<template>
  <SplitterGroup
    v-bind="forwarded"
    data-slot="resizable-panel-group"
    :class="cn('resizable-panel-group', props.class)"
  >
    <slot />
  </SplitterGroup>
</template>
