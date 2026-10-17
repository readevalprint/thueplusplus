<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import SceneFrame from '@/components/SceneFrame.vue'
import { catalog } from '@/catalog'
import { onControlKey } from '@/rex/useRex'

const props = defineProps<{ rulesetId: string }>()
const router = useRouter()

function open(path: string): void {
  void router.push(path)
}

const bars = computed(() => {
  const rows = catalog.problems.flatMap(problem => {
    const version = problem.versions.find(item => item.id === props.rulesetId)
    const cost = version?.solutions[0]?.cost
    return cost == null ? [] : [{ id: problem.id, title: problem.title, path: problem.path, cost }]
  })
  if (rows.length === 0) return []
  const max = Math.max(...rows.map(row => row.cost))
  const width = Math.min(36, 460 / rows.length)
  return rows.map((row, index) => {
    const height = 28 + (1 - row.cost / max) * 140
    return { ...row, x: 150 + index * (width + 6), width, height }
  })
})

const winner = computed(() => bars.value.reduce((best, bar) => bar.height > best.height ? bar : best, bars.value[0]))
</script>

<template>
  <SceneFrame
    v-if="winner"
    scene="ruleset"
    :label="`Rex on the cheapest ${rulesetId} problem`"
    mode="cheer"
    :x="winner.x + winner.width / 2"
    :y="250 - winner.height"
    :scale="0.7"
  >
    <g v-for="bar in bars" :key="bar.id">
      <rect :x="bar.x" :y="250 - bar.height" :width="bar.width" :height="bar.height" :fill="bar.id === winner.id ? '#ff5a36' : 'var(--surface)'" stroke="currentColor" stroke-width="1.5" />
    </g>
    <template #controls>
      <button
        v-for="bar in bars"
        :key="bar.id"
        type="button"
        class="rex-hit"
        :style="{ left: `${(bar.x / 640) * 100}%`, top: `${((250 - bar.height) / 280) * 100}%`, width: `${bar.width}px`, height: `${bar.height}px` }"
        :aria-label="bar.title"
        @click="open(bar.path)"
        @keydown="onControlKey($event, () => open(bar.path))"
      />
    </template>
  </SceneFrame>
</template>
