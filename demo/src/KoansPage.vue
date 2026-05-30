<template>
  <main :class="selectedKoan ? 'readme-page' : 'readme-page koans-page'" data-test="koans-page">
    <KoanSolutionDetail
      v-if="selectedKoan && selectedSolution"
      :koan="selectedKoan"
      :solution="selectedSolution"
    />

    <KoanDetail
      v-else-if="selectedKoan"
      :koan="selectedKoan"
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
const selectedSolution = computed(() => selectedKoan.value?.solutions.find(solution => solution.id === props.selectedSolutionId?.toLowerCase()))
</script>
