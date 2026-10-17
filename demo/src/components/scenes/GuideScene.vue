<script setup lang="ts">
import { ref } from 'vue'
import SceneFrame from '@/components/SceneFrame.vue'
import { onControlKey } from '@/rex/useRex'

const step = ref(0)
const frames = ['hello Ada', 'hi Ada']

function advance(): void {
  step.value = (step.value + 1) % frames.length
}
</script>

<template>
  <SceneFrame scene="guide" label="Rex watches one rule rewrite the state" mode="read" :x="470" :y="236">
    <rect x="48" y="48" width="280" height="150" rx="4" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
    <text x="68" y="90" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="16">hello Ada ::= hi Ada</text>
    <text data-test="guide-state" x="68" y="148" fill="#ff5a36" font-family="JetBrains Mono, ui-monospace, monospace" font-size="28">{{ frames[step] }}</text>
    <template #controls>
      <button
        type="button"
        class="rex-hit"
        style="left: 8%; top: 16%; width: 46%; height: 58%"
        data-test="guide-step"
        aria-label="Rewrite the state"
        @click="advance"
        @keydown="onControlKey($event, advance)"
      />
    </template>
  </SceneFrame>
</template>
