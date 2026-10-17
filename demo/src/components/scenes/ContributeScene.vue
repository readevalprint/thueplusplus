<script setup lang="ts">
import { ref } from 'vue'
import SceneFrame from '@/components/SceneFrame.vue'
import { onControlKey } from '@/rex/useRex'

const swept = ref(false)

function sweep(): void {
  swept.value = true
}
</script>

<template>
  <SceneFrame scene="contribute" label="Rex hands over a wrench and clears the podium" :mode="swept ? 'cheer' : 'offer'" :x="150" :y="236">
    <rect x="300" y="200" width="70" height="48" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
    <rect x="390" y="156" width="70" height="92" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
    <rect v-if="swept" data-test="cheaper-bar" x="480" y="188" width="70" height="60" fill="#ff5a36" stroke="currentColor" stroke-width="2" />
    <g transform="translate(250 150)" data-test="wrench">
      <rect x="-4" y="0" width="8" height="36" rx="2" fill="currentColor" />
      <circle cx="0" cy="0" r="8" fill="none" stroke="currentColor" stroke-width="3" />
    </g>
    <template #controls>
      <button
        type="button"
        class="rex-hit"
        style="left: 36%; top: 42%; width: 12%; height: 28%"
        data-test="hand-wrench"
        aria-label="Sweep a cheaper solution onto the podium"
        @click="sweep"
        @keydown="onControlKey($event, sweep)"
      />
    </template>
  </SceneFrame>
</template>
