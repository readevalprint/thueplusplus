<script setup lang="ts">
import { computed, ref } from 'vue'
import SceneFrame from '@/components/SceneFrame.vue'
import { onControlKey } from '@/rex/useRex'

const angle = ref(-24)
const found = computed(() => angle.value > 8 && angle.value < 36)

function sweep(direction: -1 | 1): void {
  const next = angle.value + direction * 16
  if (next < -48 || next > 48) return
  angle.value = next
}
</script>

<template>
  <SceneFrame scene="search" label="Rex searches with a flashlight" mode="search" :x="180" :y="236">
    <g :transform="`rotate(${angle} 250 150)`">
      <path d="M250 150 L430 70 L430 230 Z" fill="#ff5a36" opacity="0.28" />
    </g>
    <text data-test="hidden-mark" x="470" y="158" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="22" :opacity="found ? 1 : 0.12">::=</text>
    <template #controls>
      <button type="button" class="rex-hit" style="left: 4%; top: 74%; width: 18%; height: 18%" data-test="sweep-left" aria-label="Sweep the light left" @click="sweep(-1)" @keydown="onControlKey($event, () => sweep(-1))" />
      <button type="button" class="rex-hit" style="left: 24%; top: 74%; width: 18%; height: 18%" data-test="sweep-right" aria-label="Sweep the light right" @click="sweep(1)" @keydown="onControlKey($event, () => sweep(1))" />
    </template>
  </SceneFrame>
</template>
