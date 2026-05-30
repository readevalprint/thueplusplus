<template>
  <article class="readme-document koan-detail-document" :data-test="`koan-${koan.slug}`">
    <KoanBreadcrumbs :koan="koan" />

    <section aria-label="Try It">
      <PlaygroundSurface
        mode="full"
        chrome="bare"
        :header="false"
        :picker="false"
        :show-test-selector="false"
        :sync-url="false"
        :koan="koan"
      />
    </section>
  </article>
</template>

<script setup lang="ts">
import PlaygroundSurface from '../PlaygroundSurface.vue'
import KoanBreadcrumbs from './KoanBreadcrumbs.vue'
import type { KoanEntry } from './types'

defineProps<{
  koan: KoanEntry
}>()
</script>
