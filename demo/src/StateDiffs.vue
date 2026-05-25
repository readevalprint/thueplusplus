<template>
  <section ref="timeline" class="state-diffs" data-test="playground-diffs" aria-label="timeline">
    <article
      v-for="(entry, index) in entries"
      :key="entry.key"
      class="state-diff-entry"
      :class="{ selected: entry.key === selectedKey, future: isFuture(index) }"
      :data-test="`playground-diff-${entry.step}`"
      :data-selected="entry.key === selectedKey || undefined"
      :data-future="isFuture(index) || undefined"
      role="button"
      tabindex="0"
      @click="$emit('select', entry.key)"
      @keydown.enter.prevent="$emit('select', entry.key)"
      @keydown.space.prevent="$emit('select', entry.key)"
    >
      <div class="state-diff-meta">#{{ entry.step }} row {{ entry.row }}</div>
      <div class="state-diff-rule" data-test="playground-diff-rule">{{ entry.rule }}</div>
      <div v-if="entry.error" class="state-diff-error" data-test="playground-diff-error">{{ entry.error }}</div>
      <div v-else-if="entry.note" class="state-diff-note" data-test="playground-diff-note">{{ entry.note }}</div>
      <template v-else>
        <div class="state-diff-line removed">
          <span class="state-diff-sign">-</span><span v-for="part in entry.before" :key="part.key" :class="partClass(part, 'removed')">{{ part.text }}</span>
        </div>
        <div class="state-diff-line added">
          <span class="state-diff-sign">+</span><span v-for="part in entry.after" :key="part.key" :class="partClass(part, 'added')">{{ part.text }}</span>
        </div>
      </template>
    </article>
  </section>
</template>

<script setup lang="ts">
import { nextTick, ref, watch } from 'vue'

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
  stateBefore: string
  stateAfter: string
  before: DiffPart[]
  after: DiffPart[]
  error?: string
  note?: string
}

const props = defineProps<{
  entries: StateDiffEntry[]
  selectedKey?: string
}>()

defineEmits<{
  select: [key: string]
}>()

const timeline = ref<HTMLElement | null>(null)

watch(() => props.entries.length, async () => {
  await nextTick()
  if (timeline.value) timeline.value.scrollTop = timeline.value.scrollHeight
})

function isFuture(index: number): boolean {
  const selectedIndex = props.entries.findIndex(entry => entry.key === props.selectedKey)
  return selectedIndex >= 0 && index > selectedIndex
}

function partClass(part: DiffPart, side: 'removed' | 'added'): Record<string, boolean> {
  return {
    [`state-diff-char-${side}`]: part.changed,
    'state-diff-ellipsis': Boolean(part.ellipsis),
  }
}
</script>
