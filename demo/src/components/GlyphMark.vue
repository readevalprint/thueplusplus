<script setup lang="ts">
import type { Glyph } from '@/sandbox/scene'

withDefaults(defineProps<{ glyph: Glyph, hot?: number }>(), { hot: 1 })
</script>

<template>
  <g>
    <g v-if="glyph === 'assign'" fill="currentColor" transform="translate(0 8) scale(0.3)">
      <rect x="-14" y="-75" width="7" height="22" rx="3.5" />
      <rect x="7" y="-75" width="7" height="22" rx="3.5" />
      <circle cx="-18" cy="-33" r="7" />
      <circle cx="18" cy="-33" r="7" />
      <circle cx="-14" cy="-7" r="7" />
      <circle cx="14" cy="-7" r="7" />
    </g>
    <circle v-else-if="glyph === 'dot'" r="7" fill="currentColor" />
    <text
      v-else-if="glyph === 'rule'"
      text-anchor="middle"
      dominant-baseline="middle"
      fill="currentColor"
      font-family="JetBrains Mono, ui-monospace, monospace"
      font-size="14"
    >a::=b</text>
    <polygon
      v-else-if="glyph === 'spike'"
      fill="currentColor"
      points="0,-15 4.2,-5.7 13.9,-6.5 6.8,-1.5 11.5,9.6 0,4.5 -11.5,9.6 -6.8,-1.5 -13.9,-6.5 -4.2,-5.7"
    />
    <g v-else-if="glyph === 'fuse'">
      <circle cx="-1" cy="3" r="8" fill="currentColor" />
      <path d="M5 -2 Q12 -12 7 -18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      <circle cx="7" cy="-18" r="2.4" fill="#ff5a36" :opacity="hot" />
    </g>
    <text
      v-else
      text-anchor="middle"
      dominant-baseline="middle"
      fill="currentColor"
      font-family="JetBrains Mono, ui-monospace, monospace"
      font-size="16"
      font-weight="700"
    >x_x</text>
  </g>
</template>
