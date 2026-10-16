<script setup lang="ts">
const frames = [0.34, 0.26, 0.18, 0.12, 0.07, 0.04, 0.02]
</script>

<template>
  <svg data-test="rewrite-motif" viewBox="0 0 640 640" class="text-bone h-auto w-full" fill="none" aria-hidden="true">
    <rect
      v-for="(opacity, index) in frames"
      :key="index"
      :x="28 + index * 36"
      :y="28 + index * 36"
      :width="584 - index * 72"
      :height="584 - index * 72"
      stroke="currentColor"
      stroke-width="1"
      :opacity="opacity"
    />
    <path d="M250 320h52M318 308l16 12-16 12" stroke="#ff5a36" stroke-width="1.5" />
    <text x="392" y="328" fill="currentColor" font-family="Martian Mono, monospace" font-size="22" font-weight="600">::=</text>
    <g data-test="landing-rewrite" font-family="JetBrains Mono, monospace" font-size="16">
      <text x="180" y="470" fill="currentColor">hello Ada</text>
      <text x="300" y="470" fill="#ff5a36">::=</text>
      <text x="360" y="470" fill="currentColor">hi Ada</text>
    </g>
  </svg>
</template>
