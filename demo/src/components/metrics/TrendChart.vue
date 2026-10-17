<script setup lang="ts">
import type { ChartConfig } from '@/components/ui/chart'
import { CurveType } from '@unovis/ts'
import { VisAxis, VisLine, VisScatter, VisXYContainer } from '@unovis/vue'
import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'
import {
  ChartContainer,
  ChartCrosshair,
  ChartTooltip,
  ChartTooltipContent,
  componentToString,
} from '@/components/ui/chart'
import { HistoryError } from '@/metrics'
import type { TrendSample } from '@/overview'

const props = defineProps<{
  points: TrendSample[]
  label: string
  seriesLabel: string
  testId: string
  formatValue: (value: number) => string
  axes?: boolean
}>()

const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const showAxes = computed(() => props.axes === true)

const chartConfig = computed<ChartConfig>(() => ({
  series: { label: props.seriesLabel, color: 'var(--chart-1)' },
}))

interface Datum {
  index: number
  title: string
  series?: string
  value?: number
  mark?: number
}

const rows = computed(() => props.points.map((point, index): Datum => {
  const row: Datum = {
    index,
    title: `${point.timestamp.slice(0, 10)} · ${point.commit.slice(0, 12)}`,
  }
  if (point.value === null) return row
  row.value = point.value
  row.series = props.formatValue(point.value)
  if (point.mark) row.mark = point.value
  return row
}))

const domain = computed((): [number, number] => {
  const values = props.points.flatMap(point => point.value === null ? [] : [point.value])
  if (values.length === 0) throw new HistoryError(`${props.label} has no values`)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = min === max ? Math.max(min * 0.05, 1) : (max - min) * 0.2
  const lower = min >= 0 ? Math.max(0, min - pad) : min - pad
  return [lower, max + pad]
})

function xOf(row: Datum): number {
  return row.index
}

function yOf(row: Datum): number | undefined {
  return row.value
}

function markOf(row: Datum): number | undefined {
  return row.mark
}

const xTicks = computed(() => rows.value.length > 1 ? [0, rows.value.length - 1] : [0])

function formatX(tick: number): string {
  const point = props.points[tick]
  return point ? point.timestamp.slice(0, 10) : ''
}

function formatY(tick: number): string {
  if (!Number.isFinite(tick) || tick <= 0) return '0'
  return props.formatValue(Math.round(tick))
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
  <figure :data-test="testId" class="min-w-0">
    <ChartContainer :config="chartConfig" class="aspect-auto h-full w-full" :cursor="showAxes">
      <VisXYContainer
        :data="rows"
        :y-domain="domain"
        :duration="reduceMotion ? 0 : 200"
        :margin="showAxes ? { top: 8, right: 8, bottom: 28, left: 56 } : { top: 6, right: 6, bottom: 6, left: 6 }"
        :aria-label="label"
      >
        <VisLine :x="xOf" :y="yOf" color="var(--color-series)" :curve-type="CurveType.StepAfter" :line-width="1.5" />
        <VisScatter
          :x="xOf"
          :y="markOf"
          color="var(--color-series)"
          stroke-color="var(--surface)"
          :stroke-width="2"
          :size="8"
        />
        <VisAxis
          v-if="showAxes"
          type="x"
          :tick-line="false"
          :domain-line="false"
          :grid-line="false"
          :tick-values="xTicks"
          :tick-format="formatX"
        />
        <VisAxis
          v-if="showAxes"
          type="y"
          :tick-line="false"
          :domain-line="false"
          :grid-line="true"
          :num-ticks="3"
          :tick-format="formatY"
        />
        <template v-if="showAxes">
          <ChartTooltip />
          <ChartCrosshair :x="xOf" :y="yOf" color="var(--color-series)" :template="tooltip" />
        </template>
      </VisXYContainer>
    </ChartContainer>
  </figure>
</template>
