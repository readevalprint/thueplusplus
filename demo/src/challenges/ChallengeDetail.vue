<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <article class="challenge-detail-document" :data-test="`challenge-${challenge.slug}`">
    <section class="challenge-playground-region" aria-label="Try It">
      <PlaygroundSurface
        mode="full"
        chrome="bare"
        :header="false"
        :picker="false"
        :show-test-selector="false"
        :sync-url="false"
        :challenge="challenge"
        :challenges="challenges"
        :previous-challenge="previousChallenge"
        :next-challenge="nextChallenge"
      />
    </section>
  </article>
</template>

<script setup lang="ts">
import PlaygroundSurface from '../PlaygroundSurface.vue'
import type { ChallengeEntry } from './types'

defineProps<{
  challenge: ChallengeEntry
  challenges: ChallengeEntry[]
  previousChallenge?: ChallengeEntry
  nextChallenge?: ChallengeEntry
}>()
</script>
