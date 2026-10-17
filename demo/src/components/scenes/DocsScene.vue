<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import SceneFrame from '@/components/SceneFrame.vue'
import { onControlKey } from '@/rex/useRex'

const pages = [
  { rule: 'a ::= b', before: 'a', after: 'b' },
  { rule: 'cat ::= tac', before: 'cat', after: 'tac' },
  { rule: '0 ::= 1', before: '0', after: '1' },
]
const index = ref(0)
const rewritten = ref(false)
const page = computed(() => pages[index.value])
const shown = computed(() => rewritten.value ? page.value.after : page.value.before)
let timer = 0

function turn(): void {
  if (!rewritten.value) {
    rewritten.value = true
    return
  }
  index.value = (index.value + 1) % pages.length
  rewritten.value = false
}

onMounted(() => {
  if (import.meta.env.MODE === 'test') return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    rewritten.value = true
    return
  }
  timer = window.setInterval(() => turn(), 1200)
})

onBeforeUnmount(() => {
  window.clearInterval(timer)
})
</script>

<template>
  <SceneFrame scene="docs" label="Rex turns the pages of a rule book" mode="read" :x="470" :y="236" :scale="1.05">
    <rect x="70" y="36" width="250" height="190" rx="4" fill="var(--surface)" stroke="currentColor" stroke-width="2.5" />
    <path d="M70 36 H150 Q196 70 150 226 H70 Z" fill="var(--raised)" stroke="currentColor" stroke-width="2" />
    <text x="250" y="78" text-anchor="middle" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="16">{{ page.rule }}</text>
    <text data-test="doc-state" x="250" y="132" text-anchor="middle" fill="#ff5a36" font-family="JetBrains Mono, ui-monospace, monospace" font-size="28">{{ shown }}</text>
    <text x="250" y="176" text-anchor="middle" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="14">::=</text>
    <template #controls>
      <button
        type="button"
        class="rex-hit"
        style="left: 18%; top: 16%; width: 34%; height: 68%"
        data-test="turn-page"
        aria-label="Turn the page"
        @click="turn"
        @keydown="onControlKey($event, turn)"
      />
    </template>
  </SceneFrame>
</template>
