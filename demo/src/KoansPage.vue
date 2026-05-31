<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <main :class="pageClass" data-test="koans-page">
    <KoanSolutionDetail
      v-if="selectedKoan && selectedSolution"
      :koan="selectedKoan"
      :solution="selectedSolution"
    />

    <KoanDetail
      v-else-if="selectedKoan"
      :koan="selectedKoan"
      :koans="koans"
      :previous-koan="previousKoan"
      :next-koan="nextKoan"
    />

    <article v-else-if="selectedSlug" class="readme-document" data-test="koan-not-found">
      <h1>{{ selectedSolutionId ? 'Solution Not Found' : 'Koan Not Found' }}</h1>
      <p v-if="selectedSolutionId">No solution named <code>{{ selectedSolutionId }}</code> for <code>{{ selectedSlug }}</code>.</p>
      <p v-else>No koan named <code>{{ selectedSlug }}</code>.</p>
    </article>

    <article v-else class="readme-document">
      <KoansList :koans="koans" />
    </article>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import KoanDetail from './koans/KoanDetail.vue'
import KoanSolutionDetail from './koans/KoanSolutionDetail.vue'
import KoansList from './koans/KoansList.vue'
import { koans } from './koans/data'

const props = defineProps<{
  selectedSlug?: string
  selectedSolutionId?: string
}>()

const selectedKoan = computed(() => koans.find((koan) => koan.slug === props.selectedSlug))
const selectedKoanIndex = computed(() => selectedKoan.value ? koans.findIndex(koan => koan.slug === selectedKoan.value?.slug) : -1)
const previousKoan = computed(() => selectedKoanIndex.value > 0 ? koans[selectedKoanIndex.value - 1] : undefined)
const nextKoan = computed(() => selectedKoanIndex.value >= 0 && selectedKoanIndex.value < koans.length - 1 ? koans[selectedKoanIndex.value + 1] : undefined)
const selectedSolution = computed(() => selectedKoan.value?.solutions.find(solution => solution.id === props.selectedSolutionId?.toLowerCase()))
const pageClass = computed(() => {
  if (selectedKoan.value && !selectedSolution.value) return 'koan-detail-page'
  return selectedKoan.value ? 'readme-page' : 'readme-page koans-page'
})
</script>
