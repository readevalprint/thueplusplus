<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <article class="readme-document" :data-test="`challenge-solutions-${challenge.slug}`">
    <MarkdownDocument :markdown="challenge.solutionsReadme" document-class="" />

    <section aria-labelledby="solutions-list">
      <h2 id="solutions-list">Solutions</h2>
      <ChallengeSolutionsTable :solutions="challenge.solutions" />
    </section>
  </article>
</template>

<script setup lang="ts">
import MarkdownDocument from '../MarkdownDocument.vue'
import ChallengeSolutionsTable from './ChallengeSolutionsTable.vue'
import type { ChallengeEntry } from './types'

defineProps<{
  challenge: ChallengeEntry
}>()
</script>
