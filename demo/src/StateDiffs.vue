<template>
  <section class="state-diffs" data-test="playground-diffs" aria-label="step diffs">
    <p v-if="entries.length === 0" class="state-diffs-empty">step diffs appear here</p>
    <article v-for="entry in entries" :key="entry.key" class="state-diff-entry" :data-test="`playground-diff-${entry.step}`">
      <div class="state-diff-meta">#{{ entry.step }} row {{ entry.row }}</div>
      <div class="state-diff-rule" data-test="playground-diff-rule">{{ entry.rule }}</div>
      <div class="state-diff-line removed">
        <span class="state-diff-sign">-</span><span v-for="part in entry.before" :key="part.key" :class="partClass(part, 'removed')">{{ part.text }}</span>
      </div>
      <div class="state-diff-line added">
        <span class="state-diff-sign">+</span><span v-for="part in entry.after" :key="part.key" :class="partClass(part, 'added')">{{ part.text }}</span>
      </div>
    </article>
  </section>
</template>

<script setup lang="ts">
interface DiffPart {
  key: string
  text: string
  changed: boolean
  ellipsis?: boolean
}

interface StateDiffEntry {
  key: string
  step: number
  row: number
  rule: string
  before: DiffPart[]
  after: DiffPart[]
}

defineProps<{
  entries: StateDiffEntry[]
}>()

function partClass(part: DiffPart, side: 'removed' | 'added'): Record<string, boolean> {
  return {
    [`state-diff-char-${side}`]: part.changed,
    'state-diff-ellipsis': Boolean(part.ellipsis),
  }
}
</script>
