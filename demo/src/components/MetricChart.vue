<script setup lang="ts">
import { computed } from 'vue'
import { HistoryError, placeChart, pointAt, rangeLabel, stepPath, type CommitRef, type NamedSeries } from '@/metrics'

const props = withDefaults(defineProps<{
  commits: CommitRef[]
  order: string[]
  series: NamedSeries[]
  selected: number
  label: string
  sliderLabel: string
  testId: string
  controls?: boolean
}>(), {
  controls: true,
})

const emit = defineEmits<{
  select: [index: number]
}>()

const frame = computed(() => {
  if (props.commits.length === 0) throw new HistoryError('chart has no commits')
  if (!Number.isInteger(props.selected) || props.selected < 0 || props.selected >= props.commits.length) {
    throw new HistoryError(`chart selection ${props.selected} is outside 0..${props.commits.length - 1}`)
  }
  const values = props.series.flatMap(series => series.points.map(point => point.value))
  if (values.length === 0) throw new HistoryError('chart has no values')
  const dataMax = Math.max(...values)
  return { placed: placeChart(props.commits.length, dataMax), dataMax }
})

interface Drawn {
  id: string
  tone: number
  d: string
  dots: { x: number; y: number; title: string; selected: boolean }[]
}

interface PlotPoint {
  index: number
  x: number
  y: number
  value: number
  change: boolean
  title: string
}

const drawn = computed(() => {
  const { placed } = frame.value
  return props.series.map((series, index): Drawn => {
    const runs: PlotPoint[][] = []
    let run: PlotPoint[] = []
    props.commits.forEach((commit, commitIndex) => {
      const point = pointAt(series.points, commit.commit, props.order)
      if (!point) {
        if (run.length > 0) runs.push(run)
        run = []
        return
      }
      run.push({
        index: commitIndex,
        x: placed.xAt(commitIndex),
        y: placed.yAt(point.value),
        value: point.value,
        change: point.commit === commit.commit,
        title: rangeLabel(point),
      })
    })
    if (run.length > 0) runs.push(run)
    const dots = runs.flat().filter(point => point.change).map(point => ({
      x: point.x,
      y: point.y,
      title: point.title,
      selected: point.index === props.selected,
    }))
    const d = runs.map(item => stepPath(item)).filter(path => path.length > 0).join(' ')
    return { id: series.id, tone: index % 4, d, dots }
  })
})

const firstDate = computed(() => props.commits[0]?.timestamp.slice(0, 10) ?? '')
const lastDate = computed(() => props.commits[props.commits.length - 1]?.timestamp.slice(0, 10) ?? '')
const selectedCommit = computed(() => props.commits[props.selected]?.commit.slice(0, 12) ?? '')

function onSlider(event: Event): void {
  const raw = event.target instanceof HTMLInputElement ? event.target.value : ''
  if (!/^\d+$/.test(raw)) throw new HistoryError(`commit index ${raw}`)
  const index = Number(raw)
  if (index >= props.commits.length) throw new HistoryError(`commit index ${index}`)
  emit('select', index)
}

function onPointer(event: PointerEvent): void {
  const svg = event.currentTarget
  if (!(svg instanceof SVGSVGElement)) return
  const rect = svg.getBoundingClientRect()
  if (rect.width === 0) return
  const x = ((event.clientX - rect.left) / rect.width) * frame.value.placed.width
  let nearest = 0
  let best = Number.POSITIVE_INFINITY
  for (let index = 0; index < props.commits.length; index += 1) {
    const distance = Math.abs(frame.value.placed.xAt(index) - x)
    if (distance < best) {
      best = distance
      nearest = index
    }
  }
  emit('select', nearest)
}
</script>

<template>
  <figure :data-test="testId" class="border-line bg-surface border p-3">
    <svg
      :viewBox="`0 0 ${frame.placed.width} ${frame.placed.height}`"
      class="h-auto w-full"
      role="img"
      :aria-label="label"
      font-family="JetBrains Mono, ui-monospace, monospace"
      @pointerdown="onPointer"
    >
      <line
        :x1="frame.placed.plotLeft"
        :x2="frame.placed.plotRight"
        :y1="frame.placed.plotBottom"
        :y2="frame.placed.plotBottom"
        stroke="var(--line)"
      />
      <line
        :x1="frame.placed.plotLeft"
        :x2="frame.placed.plotRight"
        :y1="frame.placed.yAt(frame.dataMax)"
        :y2="frame.placed.yAt(frame.dataMax)"
        stroke="var(--line)"
      />
      <text :x="frame.placed.plotLeft - 8" :y="frame.placed.plotBottom" fill="var(--ash)" font-size="11" text-anchor="end" dominant-baseline="middle">0</text>
      <text :x="frame.placed.plotLeft - 8" :y="frame.placed.yAt(frame.dataMax)" fill="var(--ash)" font-size="11" text-anchor="end" dominant-baseline="middle">{{ frame.dataMax }}</text>
      <line
        :x1="frame.placed.xAt(selected)"
        :x2="frame.placed.xAt(selected)"
        :y1="frame.placed.plotTop"
        :y2="frame.placed.plotBottom"
        stroke="var(--signal)"
        stroke-opacity="0.45"
      />
      <template v-for="series in drawn" :key="series.id">
        <path v-if="series.d" :d="series.d" vector-effect="non-scaling-stroke" :class="['series', `tone-${series.tone}`]" />
        <circle
          v-for="(dot, dotIndex) in series.dots"
          :key="`${series.id}-${dotIndex}`"
          :cx="dot.x"
          :cy="dot.y"
          :r="dot.selected ? 3.5 : 2.5"
          :class="['dot', `tone-${series.tone}`]"
        >
          <title>{{ dot.title }}</title>
        </circle>
      </template>
      <text :x="frame.placed.plotLeft" :y="frame.placed.height - 4" fill="var(--dim)" font-size="11">{{ firstDate }}</text>
      <text v-if="commits.length > 1" :x="frame.placed.plotRight" :y="frame.placed.height - 4" fill="var(--dim)" font-size="11" text-anchor="end">{{ lastDate }}</text>
    </svg>
    <ul class="mt-3 flex flex-wrap gap-x-4 gap-y-1">
      <li v-for="(item, index) in series" :key="item.id" class="text-ash flex items-center gap-2 font-mono text-[12px]">
        <svg width="18" height="8" aria-hidden="true">
          <line x1="0" y1="4" x2="18" y2="4" stroke-width="2" :class="`tone-${index % 4}`" />
        </svg>
        {{ item.label }}
      </li>
    </ul>
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
.series {
  fill: none;
  stroke-width: 1.5;
}
.dot {
  stroke: none;
}
.tone-0 {
  --tone: var(--signal);
  stroke: var(--tone);
  fill: var(--tone);
}
.tone-1 {
  --tone: var(--bone);
  stroke: var(--tone);
  fill: var(--tone);
}
.tone-2 {
  --tone: var(--ash);
  stroke: var(--tone);
  fill: var(--tone);
  stroke-dasharray: 6 4;
}
.tone-3 {
  --tone: var(--dim);
  stroke: var(--tone);
  fill: var(--tone);
  stroke-dasharray: 1.5 3.5;
}
.series.tone-0,
.series.tone-1,
.series.tone-2,
.series.tone-3 {
  fill: none;
}
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
