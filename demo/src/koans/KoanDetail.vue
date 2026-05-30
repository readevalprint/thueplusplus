<template>
  <article class="readme-document koan-detail-document" :data-test="`koan-${koan.slug}`">
    <section class="koan-playground-region" aria-label="Try It">
      <PlaygroundSurface
        mode="full"
        chrome="bare"
        :header="false"
        :picker="false"
        :show-test-selector="false"
        :sync-url="false"
        :koan="koan"
        :koans="koans"
        :previous-koan="previousKoan"
        :next-koan="nextKoan"
      />
    </section>
  </article>
</template>

<script setup lang="ts">
import PlaygroundSurface from '../PlaygroundSurface.vue'
import type { KoanEntry } from './types'

defineProps<{
  koan: KoanEntry
  koans: KoanEntry[]
  previousKoan?: KoanEntry
  nextKoan?: KoanEntry
}>()
</script>
