<template>
  <nav class="koan-breadcrumbs" aria-label="Breadcrumb" data-test="koan-breadcrumbs">
    <ol>
      <li>
        <a href="/koans">Koans</a>
      </li>
      <li v-if="solution">
        <a :href="koan.path">{{ koan.title }}</a>
      </li>
      <li aria-current="page">
        {{ solution?.title ?? koan.title }}
      </li>
    </ol>
  </nav>
</template>

<script setup lang="ts">
import type { KoanEntry, KoanSolution } from './types'

defineProps<{
  koan: KoanEntry
  solution?: KoanSolution
}>()
</script>
