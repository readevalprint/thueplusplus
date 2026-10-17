<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import SceneFrame from '@/components/SceneFrame.vue'
import { catalog, type CatalogProblem } from '@/catalog'
import { onControlKey } from '@/rex/useRex'

const router = useRouter()

function open(path: string): void {
  void router.push(path)
}

function bestCost(problem: CatalogProblem): number {
  const costs = problem.versions.flatMap(version => version.solutions.map(solution => solution.cost)).filter((cost): cost is number => cost != null)
  if (costs.length === 0) throw new Error(`${problem.id} has no cost`)
  return Math.min(...costs)
}

const bars = computed(() => {
  const rows = catalog.problems.map(problem => ({ id: problem.id, title: problem.title, path: problem.path, cost: bestCost(problem) }))
  const max = Math.max(...rows.map(row => row.cost))
  const width = 420 / rows.length
  return rows.map((row, index) => {
    const height = 36 + (1 - row.cost / max) * 150
    return { ...row, x: 168 + index * width, width: width - 4, height }
  })
})

const winner = computed(() => bars.value.reduce((best, bar) => bar.height > best.height ? bar : best))
</script>

<template>
  <SceneFrame
    scene="leaderboard"
    label="Rex stands on the cheapest problem"
    mode="cheer"
    :x="winner.x + winner.width / 2"
    :y="248 - winner.height"
    :scale="0.72"
  >
    <text x="28" y="36" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="14">stdin</text>
    <line x1="160" y1="248" x2="620" y2="248" stroke="currentColor" stroke-width="2" />
    <g v-for="bar in bars" :key="bar.id">
      <rect :x="bar.x" :y="248 - bar.height" :width="bar.width" :height="bar.height" :fill="bar.id === winner.id ? '#ff5a36' : 'var(--surface)'" stroke="currentColor" stroke-width="1.5" />
    </g>
    <template #controls>
      <button
        v-for="bar in bars"
        :key="bar.id"
        type="button"
        class="rex-hit"
        :style="{ left: `${(bar.x / 640) * 100}%`, top: `${((248 - bar.height) / 280) * 100}%`, width: `${(bar.width / 640) * 100}%`, height: `${(bar.height / 280) * 100}%` }"
        :aria-label="bar.title"
        :data-test="`bar-${bar.id}`"
        @click="open(bar.path)"
        @keydown="onControlKey($event, () => open(bar.path))"
      />
    </template>
  </SceneFrame>
</template>
