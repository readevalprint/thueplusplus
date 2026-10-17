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
import { HistoryError, pointAt, rangeLabel, type CommitRef, type Machine, type NamedSeries, type SeriesPoint } from '@/metrics'

const CHART_COLORS = ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'] as const

const props = withDefaults(defineProps<{
  commits: CommitRef[]
  order: string[]
  series: NamedSeries[]
  selected: number
  label: string
  sliderLabel: string
  testId: string
  controls?: boolean
  scale?: 'count' | 'ratio'
  pointText?: (seriesId: string, point: SeriesPoint) => string
  commitTitle?: (commit: CommitRef & { machine?: Machine | null }) => string
}>(), {
  controls: true,
  scale: 'count',
})

const emit = defineEmits<{
  select: [index: number]
}>()

const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')

interface Datum {
  index: number
  title: string
  [key: string]: number | string | undefined
}

const chartConfig = computed(() => {
  if (props.commits.length === 0) throw new HistoryError('chart has no commits')
  if (!Number.isInteger(props.selected) || props.selected < 0 || props.selected >= props.commits.length) {
    throw new HistoryError(`chart selection ${props.selected} is outside 0..${props.commits.length - 1}`)
  }
  if (props.series.length === 0) throw new HistoryError('chart has no series')
  if (props.series.length > CHART_COLORS.length) throw new HistoryError(`chart has ${props.series.length} series`)
  const config: ChartConfig = {}
  props.series.forEach((series, index) => {
    config[series.id] = { label: series.label, color: CHART_COLORS[index] }
  })
  return config
})

function textFor(seriesId: string, point: SeriesPoint): string {
  return props.pointText ? props.pointText(seriesId, point) : rangeLabel(point)
}

function titleFor(commit: CommitRef): string {
  return props.commitTitle ? props.commitTitle(commit) : commit.timestamp.slice(0, 10)
}

const rows = computed(() => props.commits.map((commit, index): Datum => {
  const row: Datum = { index, title: titleFor(commit) }
  for (const series of props.series) {
    const point = pointAt(series.points, commit.commit, props.order)
    if (!point) continue
    row[`y:${series.id}`] = point.value
    row[series.id] = textFor(series.id, point)
    if (point.commit === commit.commit) row[`c:${series.id}`] = point.value
  }
  return row
}))

function numeric(value: number | string | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined
}

const yLine = computed(() => props.series.map(series => (row: Datum) => numeric(row[`y:${series.id}`])))
const yPoint = computed(() => props.series.map(series => (row: Datum) => numeric(row[`c:${series.id}`])))
const colors = computed(() => props.series.map(series => `var(--color-${series.id})`))
const xTicks = computed(() => rows.value.length > 1 ? [0, rows.value.length - 1] : [0])

function xOf(row: Datum): number {
  return row.index
}

function formatX(tick: number): string {
  const commit = props.commits[tick]
  return commit ? commit.timestamp.slice(0, 10) : ''
}

function formatY(tick: number): string {
  if (!Number.isFinite(tick)) return ''
  if (props.scale === 'ratio') {
    const rounded = Math.round(tick * 10) / 10
    const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
    return `${text}×`
  }
  return String(Math.round(tick))
}

function pointSize(row: Datum): number {
  return row.index === props.selected ? 7 : 4
}

function labelFormatter(x: number | Date): string {
  if (typeof x !== 'number' || !Number.isFinite(x)) return ''
  const row = rows.value[Math.round(x)]
  return row?.title ?? ''
}

const tooltip = componentToString(chartConfig.value, ChartTooltipContent, {
  class: 'max-w-[min(18rem,80vw)] font-mono break-words',
  hideLabel: props.scale === 'count',
  labelFormatter,
})

const selectedCommit = computed(() => props.commits[props.selected]?.commit.slice(0, 12) ?? '')

function onSlider(event: Event): void {
  const raw = event.target instanceof HTMLInputElement ? event.target.value : ''
  if (!/^\d+$/.test(raw)) throw new HistoryError(`commit index ${raw}`)
  const index = Number(raw)
  if (index >= props.commits.length) throw new HistoryError(`commit index ${index}`)
  emit('select', index)
}
</script>

<template>
  <figure :data-test="testId" class="border-line bg-surface min-w-0 border p-3">
    <ChartContainer :config="chartConfig" class="metric-chart aspect-auto h-[220px] w-full" :cursor="true">
      <VisXYContainer
        :data="rows"
        :duration="reduceMotion ? 0 : 200"
        :margin="{ top: 8, right: 8, bottom: 28, left: 64 }"
        :aria-label="label"
      >
        <VisLine
          :x="xOf"
          :y="yLine"
          :color="colors"
          :curve-type="CurveType.StepAfter"
          :line-width="1.5"
        />
        <VisScatter :x="xOf" :y="yPoint" :color="colors" :size="pointSize" />
        <VisAxis
          type="x"
          :tick-line="false"
          :domain-line="false"
          :grid-line="false"
          :tick-values="xTicks"
          :tick-format="formatX"
        />
        <VisAxis
          type="y"
          :tick-line="false"
          :domain-line="false"
          :grid-line="true"
          :num-ticks="4"
          :tick-format="formatY"
        />
        <ChartTooltip />
        <ChartCrosshair :x="xOf" :y="yLine" :color="colors" :template="tooltip" />
      </VisXYContainer>
      <ChartLegendContent v-if="series.length > 1" class="flex-wrap justify-start gap-x-4 gap-y-1" />
    </ChartContainer>
    <label v-if="controls && commits.length > 1" class="mt-3 block font-mono text-[11px] tracking-[0.08em] uppercase">
      <span class="text-dim flex items-center justify-between gap-3">
        <span>Commit</span>
        <span class="text-ash tracking-normal tabular-nums normal-case">{{ selected + 1 }} / {{ commits.length }}</span>
      </span>
      <input
        :data-test="`${testId}-slider`"
        class="commit-slider mt-2 block h-11 w-full"
        type="range"
        min="0"
        :max="commits.length - 1"
        :value="selected"
        :aria-label="sliderLabel"
        :aria-valuetext="selectedCommit"
        @input="onSlider"
      >
    </label>
  </figure>
</template>

<style scoped>
.commit-slider {
  appearance: none;
  background: transparent;
}
.commit-slider::-webkit-slider-runnable-track {
  height: 1px;
  background: var(--line);
}
.commit-slider::-webkit-slider-thumb {
  appearance: none;
  width: 14px;
  height: 14px;
  margin-top: -7px;
  background: var(--signal);
  border: 0;
}
.commit-slider::-moz-range-track {
  height: 1px;
  background: var(--line);
  border: 0;
}
.commit-slider::-moz-range-thumb {
  width: 14px;
  height: 14px;
  background: var(--signal);
  border: 0;
  border-radius: 0;
}
</style>
