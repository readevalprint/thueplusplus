<template>
  <article class="readme-document koan-detail-document" :data-test="`koan-${koan.slug}`">
    <KoanBreadcrumbs :koan="koan" />

    <header>
      <h1 :id="titleHeadingId">{{ koan.title }}</h1>
      <p>{{ koan.summary }}</p>
    </header>

    <MarkdownDocument :markdown="koan.readme" document-class="" />

    <section aria-labelledby="try-it">
      <h2 id="try-it">Try It</h2>
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

    <section aria-labelledby="solutions">
      <h2 id="solutions">Solutions</h2>
      <KoanSolutionsTable :solutions="koan.solutions" />
    </section>
  </article>
</template>

<script setup lang="ts">
import MarkdownDocument from '../MarkdownDocument.vue'
import PlaygroundSurface from '../PlaygroundSurface.vue'
import KoanBreadcrumbs from './KoanBreadcrumbs.vue'
import KoanSolutionsTable from './KoanSolutionsTable.vue'
import type { KoanEntry } from './types'

const props = defineProps<{
  koan: KoanEntry
}>()

const titleHeadingId = props.koan.slug
</script>
