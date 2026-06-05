<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <nav class="readme-toc" aria-label="Challenge solutions table of contents" data-test="challenge-toc">
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

  <article class="readme-document" :data-test="`challenge-solutions-${challenge.slug}`">
    <MarkdownDocument :markdown="challenge.solutionsReadme" document-class="" />

    <section aria-labelledby="solutions-list">
      <h2 id="solutions-list">Solutions</h2>
      <ChallengeSolutionsTable :solutions="challenge.solutions" />
    </section>

    <section
      v-for="solution in challenge.solutions"
      :id="solutionAnchorId(solution.id)"
      :key="solution.id"
      class="challenge-solution-section"
      :data-test="`challenge-solution-${solution.id}`"
      tabindex="-1"
    >
      <h2>{{ solution.title }}</h2>
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
import ChallengeSolutionsTable from './ChallengeSolutionsTable.vue'
import { solutionAnchorId } from './solutionLinks'
import type { ChallengeEntry } from './types'

const props = defineProps<{
  challenge: ChallengeEntry
}>()

const markdownHeadings = computed(() => parseMarkdown(props.challenge.solutionsReadme).filter((block): block is Extract<MarkdownBlock, { kind: 'heading' }> => block.kind === 'heading'))
const headings = computed(() => [
  ...markdownHeadings.value.map(heading => ({ id: heading.id, text: heading.text, level: heading.level })),
  { id: 'solutions-list', text: 'Solutions', level: 2 },
  ...props.challenge.solutions.map(solution => ({ id: solutionAnchorId(solution.id), text: solution.title, level: 2 })),
])
</script>
