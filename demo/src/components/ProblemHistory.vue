<script setup lang="ts">
import type { ChartConfig } from '@/components/ui/chart'
import { computed } from 'vue'
import { ChartContainer, ChartLegendContent } from '@/components/ui/chart'
import ProblemMetricChart from '@/components/ProblemMetricChart.vue'
import { VERSION_COLORS, type CatalogCommit, type CatalogVersion } from '@/catalog'

const props = withDefaults(defineProps<{
  commits: CatalogCommit[]
  versions: CatalogVersion[]
  spark?: boolean
}>(), { spark: false })

const active = computed(() => props.versions.filter(version => version.series.length > 0))

const config = computed<ChartConfig>(() => {
  const next: ChartConfig = {}
  for (const version of active.value) {
    const color = VERSION_COLORS[version.id]
    if (color === undefined) throw new Error(`version ${version.id} has no chart color`)
    next[version.id] = { label: version.name, color }
  }
  return next
})
</script>

<template>
  <div data-test="problem-history-charts" class="flex flex-col gap-3">
    <ChartContainer v-if="!spark && active.length > 0" :config="config" class="aspect-auto h-auto">
      <ChartLegendContent data-test="problem-legend" vertical-align="top" class="justify-start gap-x-4" />
    </ChartContainer>
    <p v-else-if="!spark && active.length === 0">No measurement is recorded.</p>
    <ProblemMetricChart :commits="commits" :versions="versions" :config="config" :spark="spark" />
  </div>
</template>
