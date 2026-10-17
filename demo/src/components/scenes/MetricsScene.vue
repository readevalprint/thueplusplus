<script setup lang="ts">
import SceneFrame from '@/components/SceneFrame.vue'
</script>

<template>
  <SceneFrame scene="metrics" label="Rex reads the host chart" mode="read" :x="470" :y="236">
    <text x="48" y="56" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="18">program ::= output</text>
    <polyline points="48,200 120,170 190,176 270,120 340,128 410,80" fill="none" stroke="#ff5a36" stroke-width="3" />
    <line x1="48" y1="210" x2="430" y2="210" stroke="currentColor" stroke-width="2" />
  </SceneFrame>
</template>
