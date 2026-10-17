<script setup lang="ts">
/** RexFigure is the only drawing of the mark. */
import { computed } from 'vue'
import type { Pose } from '@/rex/motion'
import { MARK, hat, hatFill, bandFill, hatInk, shineFill } from '@/rex/geometry.mjs'

const props = defineProps<{ pose: Pose }>()

const bulge = computed(() => 1 + (1 - props.pose.squash) * 0.45)
const eyeMidX = computed(() => (props.pose.eyeLX + props.pose.eyeRX) / 2)
const eyeMidY = computed(() => (props.pose.eyeLY + props.pose.eyeRY) / 2)
const eyeRx = computed(() => Math.min(MARK.eyeW / 2, Math.max(props.pose.eyeH, 0.8) / 2))
</script>

<template>
  <g :transform="`scale(${bulge} ${pose.squash})`" fill="currentColor">
    <g
      data-test="hard-hat"
      :transform="`translate(${eyeMidX} ${eyeMidY}) rotate(${pose.hatRot})`"
    >
      <path :d="hat.crown" :fill="hatFill" />
      <ellipse :cx="hat.brim.cx" :cy="hat.brim.cy" :rx="hat.brim.rx" :ry="hat.brim.ry" :fill="hatFill" />
      <path :d="hat.crown" fill="none" :stroke="hatInk" :stroke-width="hat.strokeWidth" :opacity="hat.strokeOpacity" />
      <rect :x="hat.band.x" :y="hat.band.y" :width="hat.band.w" :height="hat.band.h" :rx="hat.band.rx" :fill="bandFill" />
      <path :d="hat.shine" fill="none" :stroke="shineFill" :stroke-width="hat.shineWidth" stroke-linecap="round" :opacity="hat.shineOpacity" />
    </g>
    <rect data-test="rex-eye" :x="pose.eyeLX - MARK.eyeW / 2" :y="pose.eyeLY - pose.eyeH / 2" :width="MARK.eyeW" :height="Math.max(pose.eyeH, 0.8)" :rx="eyeRx" />
    <rect data-test="rex-eye" :x="pose.eyeRX - MARK.eyeW / 2" :y="pose.eyeRY - pose.eyeH / 2" :width="MARK.eyeW" :height="Math.max(pose.eyeH, 0.8)" :rx="eyeRx" />
    <circle data-test="rex-dot" :cx="pose.handLX" :cy="pose.handLY" :r="MARK.dotR" />
    <circle data-test="rex-dot" :cx="pose.handRX" :cy="pose.handRY" :r="MARK.dotR" />
    <circle data-test="rex-dot" :cx="pose.footLX" :cy="pose.footLY" :r="MARK.dotR" />
    <circle data-test="rex-dot" :cx="pose.footRX" :cy="pose.footRY" :r="MARK.dotR" />
  </g>
</template>
