<script setup lang="ts">
import { computed } from 'vue'
import { MARK, markModel, viewBoxString } from '@/rex/geometry.mjs'
import { bindMascot, headerPose, reachRadiusFor } from '@/rex/mascot'
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
      :hat-origin-x="0"
      :hat-origin-y="MARK.eyeDy"
      :reach-radius-l="reachRadiusFor('left')"
      :reach-radius-r="reachRadiusFor('right')"
    />
  </svg>
</template>

<style>
/* Unscoped on purpose. A scoped `:global(button:hover) :deep(.rex-eye)`
   compiles to `button:hover`, and scaleY then flattens the whole figure.
   The button is outside this component, so the hover selector cannot carry
   Mark's scope id. Only the header svg has `.rex-mark`. */
/* Bone is the same token as the page background's pair, so a theme change
   repaints Rex with the page instead of leaving currentColor on the old ink. */
.rex-mark {
  color: var(--bone);
}

.rex-mark .rex-eye {
  transform-box: fill-box;
  transform-origin: center;
}

/* Shut scale is 0.14, from motion.ts `eyeH * (1 - 0.86 * blink)`.
   230ms is 70ms close, 30ms hold, 130ms open. */
@media (prefers-reduced-motion: no-preference) {
  button:hover .rex-mark .rex-eye,
  button:focus-visible .rex-mark .rex-eye {
    animation: rex-blink 230ms linear;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rex-mark .rex-eye {
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
