<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { SelectContentEmits, SelectContentProps } from 'reka-ui'
import { SelectContent, SelectPortal, SelectViewport, useForwardPropsEmits } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SelectContentProps & { class?: HTMLAttributes['class'] }>()
const emits = defineEmits<SelectContentEmits>()
const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <SelectPortal>
    <SelectContent data-slot="select-content" v-bind="forwarded" :class="cn('z-50 min-w-[8rem] overflow-hidden rounded-md border shadow-md', props.class)">
      <SelectViewport data-slot="select-viewport">
        <slot />
      </SelectViewport>
    </SelectContent>
  </SelectPortal>
</template>
