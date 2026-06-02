<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <nav class="readme-toc" aria-label="Challenge solution table of contents" data-test="challenge-toc">
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

  <article class="readme-document" :data-test="`challenge-solution-${solution.id}`">
    <MarkdownDocument :markdown="challenge.solutionsReadme" document-class="" />

    <section aria-labelledby="solution-source">
      <h2 id="solution-source">{{ solution.title }}</h2>
      <p>
        By <a :href="solution.website" rel="author noopener">{{ solution.author }}</a>.
        {{ solution.ruleCount }} rules, {{ solution.stepCount }} steps, {{ solution.evalCheckCount }} eval checks, {{ solution.cumulativeStateBytes }} bytes cumulative state.
      </p>
      <ReadmeCodeEditor
        data-test="challenge-solution-source"
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
import type { ChallengeEntry, ChallengeSolution } from './types'

const props = defineProps<{
  challenge: ChallengeEntry
  solution: ChallengeSolution
}>()

const markdownHeadings = computed(() => parseMarkdown(props.challenge.solutionsReadme).filter((block): block is Extract<MarkdownBlock, { kind: 'heading' }> => block.kind === 'heading'))
const headings = computed(() => [
  ...markdownHeadings.value.map(heading => ({ id: heading.id, text: heading.text, level: heading.level })),
  { id: 'solution-source', text: props.solution.title, level: 2 },
])
</script>
