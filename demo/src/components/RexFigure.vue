<script setup lang="ts">
import { computed } from 'vue'
import type { Pose } from '@/sandbox/motion'

const props = defineProps<{ pose: Pose }>()

const bulge = computed(() => 1 + (1 - props.pose.squash) * 0.45)
const eyeMidX = computed(() => (props.pose.eyeLX + props.pose.eyeRX) / 2)
const eyeMidY = computed(() => (props.pose.eyeLY + props.pose.eyeRY) / 2)
const eyeRx = computed(() => Math.min(3.5, Math.max(props.pose.eyeH, 0.8) / 2))
</script>

<template>
  <g :transform="`scale(${bulge} ${pose.squash})`" fill="currentColor">
    <g
      data-test="hard-hat"
      :transform="`translate(${eyeMidX} ${eyeMidY}) rotate(${pose.hatRot})`"
    >
      <path d="M-16 -13 C-20 -34 20 -34 16 -13 Z" fill="#ff5a36" />
      <ellipse cx="0" cy="-12" rx="24" ry="5.2" fill="#ff5a36" />
      <path d="M-16 -13 C-20 -34 20 -34 16 -13 Z" fill="none" stroke="#1a100c" stroke-width="1.3" opacity="0.4" />
      <rect x="-9" y="-19" width="18" height="4.5" rx="1" fill="#c43b1d" />
      <path d="M-7 -30 Q-1 -35 5 -28" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity="0.55" />
    </g>
    <rect data-test="rex-eye" :x="pose.eyeLX - 3.5" :y="pose.eyeLY - pose.eyeH / 2" width="7" :height="Math.max(pose.eyeH, 0.8)" :rx="eyeRx" />
    <rect data-test="rex-eye" :x="pose.eyeRX - 3.5" :y="pose.eyeRY - pose.eyeH / 2" width="7" :height="Math.max(pose.eyeH, 0.8)" :rx="eyeRx" />
    <circle data-test="rex-dot" :cx="pose.handLX" :cy="pose.handLY" r="7" />
    <circle data-test="rex-dot" :cx="pose.handRX" :cy="pose.handRY" r="7" />
    <circle data-test="rex-dot" :cx="pose.footLX" :cy="pose.footLY" r="7" />
    <circle data-test="rex-dot" :cx="pose.footRX" :cy="pose.footRY" r="7" />
  </g>
</template>
