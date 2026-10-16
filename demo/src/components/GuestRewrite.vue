<script setup lang="ts">
import { computed } from 'vue'
import { placeChart, type CommitRef, type NamedSeries } from '@/metrics'

const props = defineProps<{
  commits: CommitRef[]
  series: NamedSeries[]
}>()

const paths = computed(() => {
  const values = props.series.flatMap(series => series.points.map(point => point.value))
  if (props.commits.length === 0 || values.length === 0) return []
  const placed = placeChart(props.commits.length, Math.max(...values), 640, 168)
  return props.series.flatMap(series => {
    const byCommit = new Map(series.points.map(point => [point.commit, point.value]))
    let d = ''
    let drawing = false
    props.commits.forEach((commit, index) => {
      const value = byCommit.get(commit.commit)
      if (value === undefined) {
        drawing = false
        return
      }
      d += `${drawing ? 'L' : 'M'}${placed.xAt(index).toFixed(1)} ${(placed.yAt(value) + 78).toFixed(1)}`
      drawing = true
    })
    return d.length > 0 ? [d] : []
  })
})
</script>

<template>
  <svg data-test="guest-rewrite" viewBox="0 0 640 280" class="text-bone h-auto w-full" fill="none" aria-hidden="true">
    <text x="8" y="36" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="22">guest</text>
    <text x="132" y="36" fill="#ff5a36" font-family="Martian Mono, ui-monospace, monospace" font-size="22" font-weight="600">::=</text>
    <text x="196" y="36" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="22">rules</text>
    <rect x="8" y="72" width="624" height="188" stroke="currentColor" stroke-width="1" opacity="0.28" />
    <rect x="28" y="92" width="584" height="148" stroke="currentColor" stroke-width="1" opacity="0.16" />
    <path
      v-for="(path, index) in paths"
      :key="index"
      :d="path"
      pathLength="1"
      stroke-width="1.5"
      vector-effect="non-scaling-stroke"
      :class="['draw', `tone-${index % 4}`]"
      :style="{ animationDelay: `${index * 140}ms` }"
    />
  </svg>
</template>

<style scoped>
.draw {
  stroke-dasharray: 1;
  stroke-dashoffset: 1;
  animation: draw 1.4s ease-out forwards;
}
.tone-0 { stroke: var(--signal); }
.tone-1 { stroke: var(--bone); }
.tone-2 { stroke: var(--ash); }
.tone-3 { stroke: var(--dim); }
@keyframes draw {
  to { stroke-dashoffset: 0; }
}
</style>
