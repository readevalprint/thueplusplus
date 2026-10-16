<template>
  <DocPage :kicker="page.kicker" :title="page.title">
    <template #actions>
      <Button as-child variant="outline">
        <RouterLink to="/reference#limits">Step limits</RouterLink>
      </Button>
    </template>
    <section id="editor" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Editor</h2>
      <p class="text-muted-foreground leading-7">The editor is the Go host compiled to WebAssembly. Step and play send a step limit with every run.</p>
      <PlaygroundSurface
        :mode="mode"
        chrome="page"
        controls="debug"
        :header="false"
        :picker="true"
        :show-test-selector="true"
        :sync-url="true"
      />
    </section>
  </DocPage>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import DocPage from '@/components/DocPage.vue'
import { pages } from '@/site'
import PlaygroundSurface, { type PlaygroundMode } from './PlaygroundSurface.vue'

const page = pages.playground
const mode = computed<PlaygroundMode>(() => normalizeMode(new URLSearchParams(window.location.search).get('mode')))

function normalizeMode(value: string | null): PlaygroundMode {
  return ['auto', 'full', 'compact', 'mini', 'debug'].includes(value ?? '') ? value as PlaygroundMode : 'auto'
}
</script>
