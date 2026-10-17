<script setup lang="ts">
import Rex from '@/components/Rex.vue'
import type { PoseMode } from '@/rex/motion'
import { useRex } from '@/rex/useRex'

const props = defineProps<{ mode: PoseMode, label: string }>()
const { pose } = useRex(() => props.mode)
</script>

<template>
  <svg class="text-bone h-14 w-12 shrink-0" viewBox="-58 -112 116 128" role="img" :aria-label="label">
    <g transform="translate(0 8)">
      <Rex :pose="pose" />
    </g>
  </svg>
</template>
