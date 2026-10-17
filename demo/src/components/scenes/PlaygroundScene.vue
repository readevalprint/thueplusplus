<script setup lang="ts">
import { computed } from 'vue'
import SceneFrame from '@/components/SceneFrame.vue'
import type { PoseMode } from '@/rex/motion'

const props = defineProps<{ mood: 'idle' | 'pass' | 'fail' | 'timeout' }>()
const mode = computed<PoseMode>(() => {
  if (props.mood === 'pass') return 'cheer'
  if (props.mood === 'fail') return 'facepalm'
  if (props.mood === 'timeout') return 'duck'
  return 'read'
})
</script>

<template>
  <SceneFrame scene="playground" label="Rex sits at the console" :mode="mode" :x="430" :y="230" :scale="1.2">
    <rect x="48" y="78" width="250" height="140" rx="6" fill="var(--surface)" stroke="currentColor" stroke-width="2.5" />
    <rect x="64" y="94" width="218" height="86" fill="var(--void)" />
    <text x="78" y="128" fill="#ff5a36" font-family="JetBrains Mono, ui-monospace, monospace" font-size="16">::=</text>
    <text data-test="console-mood" x="78" y="160" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="14">{{ mood }}</text>
  </SceneFrame>
</template>
