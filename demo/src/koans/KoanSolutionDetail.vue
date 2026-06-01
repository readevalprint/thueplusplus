<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
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

  <article class="readme-document" :data-test="`koan-solution-${solution.id}`">
    <header>
      <h1 :id="titleHeadingId">{{ koan.title }}</h1>
      <p>{{ koan.summary }}</p>
    </header>

    <MarkdownDocument :markdown="koan.readme" document-class="" />

    <section aria-labelledby="solution-source">
      <h2 id="solution-source">{{ solution.title }}</h2>
      <p>
        By <a :href="solution.website" rel="author noopener">{{ solution.author }}</a>.
        {{ solution.ruleCount }} rules, {{ solution.stepCount }} steps, {{ solution.evalCheckCount }} eval checks, {{ solution.cumulativeStateBytes }} bytes cumulative state.
      </p>
      <ReadmeCodeEditor
        data-test="koan-solution-source"
        :code="solution.source"
        language="thuepp"
      />
    </section>
  </article>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import MarkdownDocument from '../MarkdownDocument.vue'
import ReadmeCodeEditor from '../ReadmeCodeEditor.vue'
import { parseMarkdown, type MarkdownBlock } from '../markdown'
import type { KoanEntry, KoanSolution } from './types'

const props = defineProps<{
  koan: KoanEntry
  solution: KoanSolution
}>()

const titleHeadingId = computed(() => props.koan.slug)
const markdownHeadings = computed(() => parseMarkdown(props.koan.readme).filter((block): block is Extract<MarkdownBlock, { kind: 'heading' }> => block.kind === 'heading'))
const headings = computed(() => [
  { id: titleHeadingId.value, text: props.koan.title, level: 1 },
  ...markdownHeadings.value.map(heading => ({ id: heading.id, text: heading.text, level: heading.level })),
  { id: 'solution-source', text: props.solution.title, level: 2 },
])
</script>
