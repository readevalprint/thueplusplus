<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <section>
    <h1>Learn Thue++</h1>
    <p>
      Learn Thue++ in small steps and compare your answers with others.
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

defineProps<{
  challenges: ChallengeEntry[]
}>()

function solutionCountLabel(count: number): string {
  return `${count} ${count === 1 ? 'solution' : 'solutions'}`
}
</script>
