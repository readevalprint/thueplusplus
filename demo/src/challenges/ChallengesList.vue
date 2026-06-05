<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <section>
    <h1>Learn Thue++</h1>
    <p>
      Learn Thue++ in small steps and compare your answers with others.
    </p>
    <p class="challenge-contribute-panel" data-test="challenge-index-contribute-links">
      <span>Contribute:</span>
      <a :href="contributingLinks.challenges" rel="noreferrer" target="_blank">challenges</a>
      <span aria-hidden="true">·</span>
      <a :href="contributingLinks.testCases" rel="noreferrer" target="_blank">test cases</a>
      <span aria-hidden="true">·</span>
      <a :href="contributingLinks.solutions" rel="noreferrer" target="_blank">solutions</a>
    </p>
  </section>

  <section aria-labelledby="open-challenges">
    <h2 id="open-challenges">Lesson 1</h2>

    <ItemGroup>
      <Item
        v-for="challenge in challenges"
        :key="challenge.slug"
        as="a"
        :href="challenge.path"
        :data-test="`challenge-${challenge.slug}`"
      >
        <ItemContent>
          <ItemTitle>{{ challenge.title }}</ItemTitle>
        </ItemContent>
        <ItemActions>
          {{ solutionCountLabel(challenge.solutions.length) }}
        </ItemActions>
      </Item>
    </ItemGroup>
  </section>
</template>

<script setup lang="ts">
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import type { ChallengeEntry } from './types'

const CONTRIBUTING_URL = 'https://gitlab.com/thuelang/thueplusplus/-/blob/develop/challenges/CONTRIBUTING.md'
const contributingLinks = {
  challenges: `${CONTRIBUTING_URL}#challenges`,
  testCases: `${CONTRIBUTING_URL}#test-cases`,
  solutions: `${CONTRIBUTING_URL}#solutions`,
} as const

defineProps<{
  challenges: ChallengeEntry[]
}>()

function solutionCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'solution' : 'solutions'}`
}
</script>
