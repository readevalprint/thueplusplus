<script setup lang="ts">
import { computed } from 'vue'
import Rex from './Rex.vue'
import { useRex } from '@/rex/useRex'
import type { PoseMode } from '@/rex/motion'

const props = withDefaults(defineProps<{
  scene: string
  label: string
  mode: PoseMode
  x?: number
  y?: number
  scale?: number
}>(), {
  x: 150,
  y: 230,
  scale: 1.15,
})

const { pose, reduced } = useRex(() => props.mode)
const transform = computed(() => `translate(${props.x} ${props.y}) scale(${props.scale})`)
</script>

<template>
  <div
    class="rex-scene text-bone relative h-full min-h-[148px] w-full"
    data-test="rex-scene"
    :data-scene="scene"
    :data-reduced="reduced ? 'yes' : 'no'"
  >
    <svg class="rex-svg h-full w-full" viewBox="0 0 640 280" role="img" :aria-label="label">
      <slot />
      <g :transform="transform">
        <Rex :pose="pose" />
      </g>
    </svg>
    <slot name="controls" />
  </div>
</template>
