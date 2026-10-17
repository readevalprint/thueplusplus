<script setup lang="ts">
import { computed } from 'vue'
import { markModel, viewBoxString } from '@/rex/geometry.mjs'
import { bindMascot, headerPose, reachRadius, reachSide } from '@/rex/mascot'
import RexFigure from './RexFigure.vue'

const layout = markModel('header')
if (layout.hatTilt === 0) throw new Error('header rex lost its hat tilt')
const box = viewBoxString('header')
const pose = computed(() => headerPose())
bindMascot()
</script>

<template>
  <svg
    class="rex-mark block h-10 w-auto shrink-0 overflow-visible"
    :viewBox="box"
    aria-hidden="true"
    data-test="header-mark"
  >
    <RexFigure
      :pose="pose"
      hat-paint="var(--signal)"
      mark-paint="currentColor"
      :reach-side="reachSide()"
      :reach-radius="reachRadius()"
    />
  </svg>
</template>

<style scoped>
:deep(.rex-eye) {
  transform-box: fill-box;
  transform-origin: center;
}

/* Shut scale is 0.14, from motion.ts `eyeH * (1 - 0.86 * blink)`.
   230ms is 70ms close, 30ms hold, 130ms open. */
@media (prefers-reduced-motion: no-preference) {
  :global(button:hover) :deep(.rex-eye),
  :global(button:focus-visible) :deep(.rex-eye) {
    animation: rex-blink 230ms linear;
  }
}

@media (prefers-reduced-motion: reduce) {
  :deep(.rex-eye) {
    animation: none;
  }
}

@keyframes rex-blink {
  0% { transform: scaleY(1); }
  30.43% { transform: scaleY(0.14); }
  43.48% { transform: scaleY(0.14); }
  100% { transform: scaleY(1); }
}
</style>
