<template>
  <template v-if="showSiteTopbar">
    <header class="site-topbar" data-test="site-topbar">
      <div class="site-topbar-inner">
        <a class="site-brand" href="/" aria-label="Thue++ home">Thue++</a>
        <nav class="site-nav" aria-label="Main navigation">
          <a href="/" :aria-current="isDocsRoute ? 'page' : undefined">Docs</a>
          <a href="/playground" :aria-current="isPlaygroundRoute ? 'page' : undefined">Playground</a>
          <a href="https://gitlab.com/thuelang/thueplusplus" rel="noreferrer">GitLab</a>
          <a href="https://x.com/thuelang" rel="noreferrer">Twitter</a>
        </nav>
      </div>
    </header>
    <PlaygroundPage v-if="isPlaygroundRoute" />
    <ReadmePage v-else />
  </template>
  <EmbedDemoPage v-else-if="isEmbedDemoRoute" />
  <PlaygroundSurface v-else-if="isEmbedRoute" v-bind="embedProps" />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import EmbedDemoPage from './EmbedDemoPage.vue'
import PlaygroundPage from './PlaygroundPage.vue'
import PlaygroundSurface from './PlaygroundSurface.vue'
import ReadmePage from './ReadmePage.vue'

interface EmbedRouteProps {
  file?: string
  test?: string
  caseName?: string
  section?: 'output' | 'state' | 'input' | 'trace' | 'resources' | 'source'
  tab?: string
  mode?: 'auto' | 'full' | 'compact' | 'mini' | 'debug'
  chrome?: 'page' | 'embed' | 'bare'
  controls?: 'run' | 'step' | 'debug' | 'none'
  editable?: boolean
  header?: boolean
  picker?: boolean
  showOpenFull?: boolean
  syncUrl?: boolean
}

const routePath = computed(() => normalizedPath() || '/')
const isPlaygroundRoute = computed(() => routePath.value.endsWith('/playground'))
const isEmbedDemoRoute = computed(() => routePath.value.endsWith('/embed/demo'))
const isEmbedRoute = computed(() => routePath.value.endsWith('/embed'))
const showSiteTopbar = computed(() => !isEmbedDemoRoute.value && !isEmbedRoute.value)
const isDocsRoute = computed(() => showSiteTopbar.value && !isPlaygroundRoute.value)
const embedProps = computed<EmbedRouteProps>(() => {
  const params = new URLSearchParams(window.location.search)
  return {
    file: params.get('file') ?? undefined,
    test: params.get('test') ?? undefined,
    caseName: params.get('case') ?? undefined,
    section: normalizeEmbedSection(params.get('section')),
    tab: params.get('tab') ?? undefined,
    mode: normalizeEmbedMode(params.get('mode')),
    chrome: 'embed',
    controls: normalizeEmbedControls(params.get('controls')),
    editable: params.get('editable') !== '0',
    header: params.get('header') === '1',
    picker: params.get('picker') === '1',
    showOpenFull: params.get('openFull') !== '0',
    syncUrl: params.get('syncUrl') === '1',
  }
})

function normalizedPath(): string {
  return window.location.pathname.replace(/\/$/, '')
}

function normalizeEmbedSection(value: string | null): EmbedRouteProps['section'] {
  return ['output', 'state', 'input', 'trace', 'resources', 'source'].includes(value ?? '') ? value as EmbedRouteProps['section'] : undefined
}

function normalizeEmbedMode(value: string | null): EmbedRouteProps['mode'] {
  return ['auto', 'full', 'compact', 'mini', 'debug'].includes(value ?? '') ? value as EmbedRouteProps['mode'] : 'compact'
}

function normalizeEmbedControls(value: string | null): EmbedRouteProps['controls'] {
  return ['run', 'step', 'debug', 'none'].includes(value ?? '') ? value as EmbedRouteProps['controls'] : 'run'
}
</script>
