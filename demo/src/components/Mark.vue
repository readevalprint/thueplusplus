<script setup lang="ts">
import { markModel, viewBoxString, bandFill } from '@/rex/geometry.mjs'

const model = markModel('header')
const hatParts = model.parts.filter(part => part.space === 'hat')
const worldParts = model.parts.filter(part => part.space === 'world')

function fillFor(role: string): string {
  if (role === 'hat') return 'var(--signal)'
  if (role === 'band') return bandFill
  throw new Error(`header rex has no paint for ${role}`)
}
</script>

<template>
  <svg
    class="rex-mark block h-10 w-auto shrink-0"
    :viewBox="viewBoxString('header')"
    aria-hidden="true"
    data-test="header-mark"
  >
    <g :transform="`translate(${model.hatAt.x} ${model.hatAt.y})`">
      <template v-for="(part, index) in hatParts" :key="`hat-${index}`">
        <path v-if="part.kind === 'path'" :d="part.d" :fill="fillFor(part.role)" />
        <ellipse
          v-else-if="part.kind === 'ellipse'"
          :cx="part.cx"
          :cy="part.cy"
          :rx="part.rx"
          :ry="part.ry"
          :fill="fillFor(part.role)"
        />
        <rect
          v-else-if="part.kind === 'rect'"
          :x="part.x"
          :y="part.y"
          :width="part.w"
          :height="part.h"
          :rx="part.rx"
          :fill="fillFor(part.role)"
        />
      </template>
    </g>
    <template v-for="(part, index) in worldParts" :key="`mark-${index}`">
      <rect
        v-if="part.kind === 'rect'"
        class="rex-eye"
        :x="part.x"
        :y="part.y"
        :width="part.w"
        :height="part.h"
        :rx="part.rx"
        fill="currentColor"
      />
      <circle
        v-else-if="part.kind === 'circle'"
        :cx="part.cx"
        :cy="part.cy"
        :r="part.r"
        fill="currentColor"
      />
    </template>
  </svg>
</template>

<style scoped>
.rex-eye {
  transform-box: fill-box;
  transform-origin: center;
}

/* Shut scale is 0.14, from motion.ts `eyeH * (1 - 0.86 * blink)`.
   230ms is 70ms close, 30ms hold, 130ms open. */
@media (prefers-reduced-motion: no-preference) {
  a:hover .rex-eye,
  a:focus-visible .rex-eye {
    animation: rex-blink 230ms linear;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rex-eye {
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
