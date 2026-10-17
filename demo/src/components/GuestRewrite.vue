<script setup lang="ts">
import type { ChartConfig } from '@/components/ui/chart'
import { CurveType } from '@unovis/ts'
import { VisLine, VisXYContainer } from '@unovis/vue'
import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'
import { ChartContainer } from '@/components/ui/chart'
import { HistoryError, pointAt, type CommitRef, type NamedSeries } from '@/metrics'

const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'] as const

const props = defineProps<{
  commits: CommitRef[]
  order: string[]
  series: NamedSeries[]
}>()

const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

const chartConfig = computed(() => {
  if (props.series.length > CHART_COLORS.length) throw new HistoryError(`chart has ${props.series.length} series`)
  const config: ChartConfig = {}
  props.series.forEach((series, index) => {
    config[series.id] = { label: series.label, color: CHART_COLORS[index] }
  })
  return config
})

interface Datum {
  index: number
  [key: string]: number | undefined
}

const rows = computed(() => {
  if (props.commits.length === 0) return []
  return props.commits.map((commit, index) => {
    const row: Datum = { index }
    for (const series of props.series) {
      const point = pointAt(series.points, commit.commit, props.order)
      if (point) row[series.id] = point.value
    }
    return row
  })
})

const y = computed(() => props.series.map(series => (row: Datum) => row[series.id]))
const colors = computed(() => props.series.map(series => `var(--color-${series.id})`))

function xOf(row: Datum): number {
  return row.index
}
</script>

<template>
  <div data-test="guest-rewrite" class="text-bone w-full" aria-hidden="true">
    <p class="font-mono text-[22px] leading-none">
      program <span class="text-signal font-display font-semibold">::=</span> rules
    </p>
    <ChartContainer v-if="rows.length > 0" :config="chartConfig" class="metric-chart mt-4 aspect-auto h-[148px] w-full">
      <VisXYContainer
        :data="rows"
        :duration="reduceMotion ? 0 : 700"
        :margin="{ top: 12, right: 8, bottom: 8, left: 8 }"
      >
        <VisLine :x="xOf" :y="y" :color="colors" :curve-type="CurveType.StepAfter" :line-width="1.5" />
      </VisXYContainer>
    </ChartContainer>
  </div>
</template>
