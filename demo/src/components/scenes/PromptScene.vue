<script setup lang="ts">
import { computed, ref } from 'vue'
import SceneFrame from '@/components/SceneFrame.vue'
import { onControlKey } from '@/rex/useRex'

const props = defineProps<{ problem?: string, solution?: string }>()
const lines = computed(() => {
  if (props.problem && props.solution) {
    return [
      `problems/${props.problem}`,
      `solutions/${props.solution}`,
      'make it cheaper',
    ]
  }
  return ['clone the repo', 'pick one solution', 'open a pull request']
})
const shown = ref(1)

function more(): void {
  shown.value = Math.min(lines.value.length, shown.value + 1)
}
</script>

<template>
  <SceneFrame scene="prompt" label="Rex types the autoresearch prompt" mode="read" :x="470" :y="236">
    <rect x="40" y="40" width="300" height="180" rx="4" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
    <text
      v-for="(line, index) in lines.slice(0, shown)"
      :key="line"
      data-test="prompt-line"
      x="58"
      :y="84 + index * 36"
      fill="currentColor"
      font-family="JetBrains Mono, ui-monospace, monospace"
      font-size="16"
    >{{ line }}</text>
    <template #controls>
      <button type="button" class="rex-hit" style="left: 6%; top: 14%; width: 48%; height: 66%" data-test="type-line" aria-label="Type the next line" @click="more" @keydown="onControlKey($event, more)" />
    </template>
  </SceneFrame>
</template>
