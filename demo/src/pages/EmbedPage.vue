<script setup lang="ts">
import { computed } from 'vue'
import PlaygroundSurface, { type PlaygroundControls, type PlaygroundMode, type PlaygroundSection } from '@/PlaygroundSurface.vue'

const embedProps = computed(() => {
  const params = new URLSearchParams(window.location.search)
  return {
    file: params.get('file') ?? undefined,
    test: params.get('test') ?? undefined,
    caseName: params.get('case') ?? undefined,
    section: normalizeSection(params.get('section')),
    tab: params.get('tab') ?? undefined,
    mode: normalizeMode(params.get('mode')),
    chrome: 'embed' as const,
    controls: normalizeControls(params.get('controls')),
    editable: params.get('editable') !== '0',
    header: params.get('header') === '1',
    picker: params.get('picker') === '1',
    showOpenFull: params.get('openFull') !== '0',
    syncUrl: params.get('syncUrl') === '1',
  }
})

function normalizeSection(value: string | null): PlaygroundSection | undefined {
  return ['output', 'state', 'input', 'trace', 'resources', 'source'].includes(value ?? '') ? value as PlaygroundSection : undefined
}

function normalizeMode(value: string | null): PlaygroundMode {
  return ['auto', 'full', 'compact', 'mini', 'debug'].includes(value ?? '') ? value as PlaygroundMode : 'compact'
}

function normalizeControls(value: string | null): PlaygroundControls {
  return ['run', 'step', 'debug', 'none'].includes(value ?? '') ? value as PlaygroundControls : 'run'
}
</script>

<template>
  <PlaygroundSurface v-bind="embedProps" />
</template>
