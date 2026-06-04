<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <PlaygroundSurface
    :mode="mode"
    chrome="page"
    controls="debug"
    :header="false"
    :picker="true"
    :show-test-selector="true"
    :sync-url="true"
    @ready="markReady"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import PlaygroundSurface, { type PlaygroundMode } from './PlaygroundSurface.vue'

const mode = computed<PlaygroundMode>(() => normalizeMode(new URLSearchParams(window.location.search).get('mode')))

const emit = defineEmits<{
  ready: []
}>()

function markReady(): void {
  emit('ready')
}

function normalizeMode(value: string | null): PlaygroundMode {
  return ['auto', 'full', 'compact', 'mini', 'debug'].includes(value ?? '') ? value as PlaygroundMode : 'auto'
}
</script>
