<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <section>
    <h1>Learn Thue++</h1>
    <p>
      Learn Thue++ in small steps and compare your answers with others.
    </p>
  </section>

  <section aria-labelledby="open-koans">
    <h2 id="open-koans">Lesson 1</h2>

    <ItemGroup>
      <Item
        v-for="koan in koans"
        :key="koan.slug"
        as="a"
        :href="koan.path"
        :data-test="`koan-${koan.slug}`"
      >
        <ItemContent>
          <ItemTitle>{{ koan.title }}</ItemTitle>
        </ItemContent>
        <ItemActions>
          {{ solutionCountLabel(koan.solutions.length) }}
        </ItemActions>
      </Item>
    </ItemGroup>
  </section>
</template>

<script setup lang="ts">
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import type { KoanEntry } from './types'

defineProps<{
  koans: KoanEntry[]
}>()

function solutionCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'solution' : 'solutions'}`
}
</script>
