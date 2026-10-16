<script setup lang="ts">
import { computed } from 'vue'
import PlaygroundSurface from '@/PlaygroundSurface.vue'

const embedProps = computed(() => {
  const params = new URLSearchParams(window.location.search)
  return {
    file: params.get('file') ?? undefined,
    test: params.get('test') ?? undefined,
    caseName: params.get('case') ?? undefined,
    chrome: 'embed' as const,
    editable: params.get('editable') !== '0',
    showOpenFull: params.get('openFull') !== '0',
    syncUrl: params.get('syncUrl') === '1',
  }
})
</script>

<template>
  <PlaygroundSurface v-bind="embedProps" />
</template>
