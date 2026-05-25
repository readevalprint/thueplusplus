<script setup lang="ts">
import type { HTMLAttributes } from 'vue'
import type { SelectTriggerProps } from 'reka-ui'
import { SelectTrigger } from 'reka-ui'
import { cn } from '@/lib/utils'

const props = defineProps<SelectTriggerProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <SelectTrigger data-slot="select-trigger" v-bind="props" :class="cn('inline-flex items-center justify-between gap-2', props.class)">
    <slot />
  </SelectTrigger>
</template>
