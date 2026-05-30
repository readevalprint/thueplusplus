<template>
  <nav class="readme-toc" aria-label="Koan table of contents" data-test="koan-toc">
    <p>On this page</p>
    <a
      v-for="heading in headings"
      :key="heading.id"
      :href="`#${heading.id}`"
      :data-level="heading.level"
    >
      {{ heading.text }}
    </a>
  </nav>

  <article class="readme-document" :data-test="`koan-${koan.slug}`">
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
import { computed } from 'vue'
import MarkdownDocument from '../MarkdownDocument.vue'
import PlaygroundSurface from '../PlaygroundSurface.vue'
import KoanBreadcrumbs from './KoanBreadcrumbs.vue'
import KoanSolutionsTable from './KoanSolutionsTable.vue'
import { parseMarkdown, type MarkdownBlock } from '../markdown'
import type { KoanEntry } from './types'

const props = defineProps<{
  koan: KoanEntry
}>()

const titleHeadingId = computed(() => props.koan.slug)
const markdownHeadings = computed(() => parseMarkdown(props.koan.readme).filter((block): block is Extract<MarkdownBlock, { kind: 'heading' }> => block.kind === 'heading'))
const headings = computed(() => [
  { id: titleHeadingId.value, text: props.koan.title, level: 1 },
  ...markdownHeadings.value.map(heading => ({ id: heading.id, text: heading.text, level: heading.level })),
  { id: 'try-it', text: 'Try It', level: 2 },
  { id: 'solutions', text: 'Solutions', level: 2 },
])
</script>
