<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <main :class="pageClass" data-test="challenges-page">
    <ChallengeSolutionDetail
      v-if="selectedChallenge && selectedSolution"
      :challenge="selectedChallenge"
      :solution="selectedSolution"
    />

    <ChallengeSolutionsIndex
      v-else-if="selectedChallenge && props.solutionsRoute"
      :challenge="selectedChallenge"
    />

    <ChallengeDetail
      v-else-if="selectedChallenge"
      :challenge="selectedChallenge"
      :challenges="challenges"
      :previous-challenge="previousChallenge"
      :next-challenge="nextChallenge"
    />

    <article v-else-if="selectedSlug" class="readme-document" data-test="challenge-not-found">
      <h1>{{ selectedSolutionId ? 'Solution Not Found' : 'Challenge Not Found' }}</h1>
      <p v-if="selectedSolutionId">No solution named <code>{{ selectedSolutionId }}</code> for <code>{{ selectedSlug }}</code>.</p>
      <p v-else-if="props.solutionsRoute">No solutions page for <code>{{ selectedSlug }}</code>.</p>
      <p v-else>No challenge named <code>{{ selectedSlug }}</code>.</p>
    </article>

    <article v-else class="readme-document">
      <ChallengesList :challenges="challenges" />
    </article>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import ChallengeDetail from './challenges/ChallengeDetail.vue'
import ChallengeSolutionDetail from './challenges/ChallengeSolutionDetail.vue'
import ChallengeSolutionsIndex from './challenges/ChallengeSolutionsIndex.vue'
import ChallengesList from './challenges/ChallengesList.vue'
import { challenges } from './challenges/data'

const props = defineProps<{
  selectedSlug?: string
  solutionsRoute?: boolean
  selectedSolutionId?: string
}>()

const selectedChallenge = computed(() => challenges.find((challenge) => challenge.slug === props.selectedSlug))
const selectedChallengeIndex = computed(() => selectedChallenge.value ? challenges.findIndex(challenge => challenge.slug === selectedChallenge.value?.slug) : -1)
const previousChallenge = computed(() => selectedChallengeIndex.value > 0 ? challenges[selectedChallengeIndex.value - 1] : undefined)
const nextChallenge = computed(() => selectedChallengeIndex.value >= 0 && selectedChallengeIndex.value < challenges.length - 1 ? challenges[selectedChallengeIndex.value + 1] : undefined)
const selectedSolution = computed(() => selectedChallenge.value?.solutions.find(solution => solution.id === props.selectedSolutionId?.toLowerCase()))
const pageClass = computed(() => {
  if (selectedChallenge.value && !props.solutionsRoute && !selectedSolution.value) return 'challenge-detail-page'
  return selectedChallenge.value ? 'readme-page' : 'readme-page challenges-page'
})
</script>
