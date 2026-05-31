<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <main class="readme-page" data-test="readme-index">
    <nav class="readme-toc" aria-label="Table of contents" data-test="readme-toc">
      <p>On this page</p>
      <a
        v-for="heading in headings"
        :key="heading.id"
        :href="`#${heading.id}`"
        :class="{ active: activeHeadingId === heading.id }"
        :aria-current="activeHeadingId === heading.id ? 'location' : undefined"
        :data-level="heading.level"
        @click="activeHeadingId = heading.id"
      >
        {{ heading.text }}
      </a>
    </nav>
    <MarkdownDocument :markdown="readme" />
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import readme from '../../README.md?raw'
import MarkdownDocument from './MarkdownDocument.vue'
import { parseMarkdown, type MarkdownBlock } from './markdown'

const blocks = computed(() => parseMarkdown(readme))
const headings = computed(() => blocks.value.filter((block): block is Extract<MarkdownBlock, { kind: 'heading' }> => block.kind === 'heading' && block.level <= 3))
const activeHeadingId = ref(headings.value[0]?.id ?? '')

onMounted(() => {
  updateActiveHeading()
  window.addEventListener('scroll', updateActiveHeading, { passive: true })
  window.addEventListener('resize', updateActiveHeading, { passive: true })
  window.addEventListener('hashchange', updateActiveHeading)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', updateActiveHeading)
  window.removeEventListener('resize', updateActiveHeading)
  window.removeEventListener('hashchange', updateActiveHeading)
})

function updateActiveHeading(): void {
  const headingElements = Array.from(document.querySelectorAll<HTMLElement>('.readme-document h1[id], .readme-document h2[id], .readme-document h3[id]'))
  if (!headingElements.length) return
  const anchorLine = Math.min(180, window.innerHeight * 0.25)
  const current = headingElements.reduce((active, heading) => {
    return heading.getBoundingClientRect().top <= anchorLine ? heading : active
  }, headingElements[0])
  activeHeadingId.value = current.id
}
</script>
