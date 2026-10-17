<script setup lang="ts">
import type { ChartConfig } from '@/components/ui/chart'
import { CurveType } from '@unovis/ts'
import { VisAxis, VisLine, VisScatter, VisXYContainer } from '@unovis/vue'
import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'
import {
  ChartContainer,
  ChartCrosshair,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
} from '@/components/ui/chart'
import { HistoryError } from '@/metrics'
import { PARETO_AXES, formatCount, paretoScale, type ParetoPoint } from '@/overview'

const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'] as const

const props = defineProps<{
  points: ParetoPoint[]
  label: string
}>()

const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const scale = computed(() => paretoScale(props.points))

const chartConfig = computed<ChartConfig>(() => {
  if (props.points.length === 0) throw new HistoryError(`${props.label} pareto chart has no points`)
  if (props.points.length > CHART_COLORS.length) throw new HistoryError(`${props.label} pareto chart has ${props.points.length} solutions`)
  const config: ChartConfig = {}
  props.points.forEach((point, index) => {
    config[point.solution] = { label: point.solution, color: CHART_COLORS[index] }
  })
  return config
})

interface Datum {
  index: number
  title: string
  [key: string]: number | string | undefined
}

const rows = computed(() => PARETO_AXES.map((axis, index): Datum => {
  const row: Datum = { index, title: axis.label }
  for (const point of props.points) {
    const value = point[axis.id]
    row[point.solution] = formatCount(value)
    row[`y:${point.solution}`] = scale.value === 'log' ? Math.log10(value) : value
  }
  return row
}))

function numeric(value: number | string | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined
}

const yLine = computed(() => props.points.map(point => (row: Datum) => numeric(row[`y:${point.solution}`])))
const colors = computed(() => props.points.map(point => `var(--color-${point.solution})`))

function xOf(row: Datum): number {
  return row.index
}

function formatX(tick: number): string {
  return PARETO_AXES[tick]?.short ?? ''
}

function formatY(tick: number): string {
  if (!Number.isFinite(tick)) return ''
  const value = scale.value === 'log' ? 10 ** tick : tick
  if (!Number.isFinite(value) || value < 0) return ''
  return formatCount(Math.round(value))
}

function labelFormatter(x: number | Date): string {
  if (typeof x !== 'number' || !Number.isFinite(x)) return ''
  return rows.value[Math.round(x)]?.title ?? ''
}

const tooltip = componentToString(chartConfig.value, ChartTooltipContent, {
  class: 'max-w-[min(18rem,80vw)] font-mono',
  labelFormatter,
})
</script>

<template>
  <figure data-test="pareto-chart" :data-scale="scale" class="metric-chart min-w-0">
    <ChartContainer :config="chartConfig" class="aspect-auto h-[180px] w-full" :cursor="true">
      <VisXYContainer
        :data="rows"
        :duration="reduceMotion ? 0 : 200"
        :margin="{ top: 8, right: 8, bottom: 28, left: 56 }"
        :aria-label="label"
      >
        <VisLine :x="xOf" :y="yLine" :color="colors" :curve-type="CurveType.Linear" :line-width="1.5" />
        <VisScatter :x="xOf" :y="yLine" :color="colors" :size="6" />
        <VisAxis
          type="x"
          :tick-line="false"
          :domain-line="false"
          :grid-line="false"
          :tick-values="[0, 1, 2, 3, 4]"
          :tick-format="formatX"
        />
        <VisAxis
          type="y"
          :tick-line="false"
          :domain-line="false"
          :grid-line="true"
          :num-ticks="3"
          :tick-format="formatY"
        />
        <ChartTooltip />
        <ChartCrosshair :x="xOf" :y="yLine" :color="colors" :template="tooltip" />
      </VisXYContainer>
      <ChartLegendContent v-if="points.length > 1" />
    </ChartContainer>
    <figcaption class="text-ash mt-1 font-mono text-[11px]">{{ scale === 'log' ? 'Log scale.' : 'Linear scale.' }}</figcaption>
  </figure>
</template>
