<script setup lang="ts">
import type { ChartConfig } from '@/components/ui/chart'
import { CurveType, Scatter } from '@unovis/ts'
import { VisAxis, VisLine, VisScatter, VisXYContainer } from '@unovis/vue'
import { useMediaQuery } from '@vueuse/core'
import { computed } from 'vue'
import { ChartContainer, ChartTooltip } from '@/components/ui/chart'
import { diagnosticText, runningBest, type CatalogCommit, type CatalogVersion } from '@/catalog'

const props = withDefaults(defineProps<{
  commits: CatalogCommit[]
  versions: CatalogVersion[]
  config: ChartConfig
  spark?: boolean
}>(), { spark: false })

const reduceMotion = useMediaQuery('(prefers-reduced-motion: reduce)')
const active = computed(() => props.versions.filter(version => version.series.length > 0))

interface LineRow {
  index: number
  commit: string
  [key: `y:${string}`]: number | undefined
}

interface ScatterRow {
  index: number
  commit: string
  solution: string
  versionId: CatalogVersion['id']
  color: string
  value: number
  diagnostics: string
}

const measured = computed(() => {
  const seen = new Set<string>()
  for (const version of active.value) {
    for (const point of version.series) seen.add(point.commit)
  }
  const rows = props.commits.filter(commit => seen.has(commit.commit))
  const known = new Set(rows.map(commit => commit.commit))
  for (const version of active.value) {
    for (const point of version.series) {
      if (!known.has(point.commit)) throw new Error(`series commit ${point.commit} is not in the catalog`)
    }
  }
  return rows
})

const lineRows = computed(() => {
  const order = measured.value.map(commit => commit.commit)
  const best = new Map(active.value.map(version => [version.id, runningBest(order, version.series)]))
  return measured.value.map((commit, index): LineRow => {
    const row: LineRow = { index, commit: commit.commit }
    for (const version of active.value) row[`y:${version.id}`] = best.get(version.id)?.[index]
    return row
  })
})

const scatterRows = computed(() => {
  const indexOf = new Map(measured.value.map((commit, index) => [commit.commit, index]))
  const rows: ScatterRow[] = []
  for (const version of active.value) {
    if (!version.color) throw new Error(`version ${version.id} has no chart color`)
    for (const point of version.series) {
      const index = indexOf.get(point.commit)
      if (index === undefined) throw new Error(`series commit ${point.commit} is not in the catalog`)
      rows.push({
        index,
        commit: point.commit,
        solution: point.solution,
        versionId: version.id,
        color: version.color,
        value: point.cost,
        diagnostics: diagnosticText(point),
      })
    }
  }
  return rows
})

const lineColors = computed(() => active.value.map(version => `var(--color-${version.id})`))
const yLine = computed(() => active.value.map(version => (row: LineRow) => row[`y:${version.id}`]))
const xTicks = computed(() => lineRows.value.length > 1 ? [0, lineRows.value.length - 1] : [0])

function xOf(row: { index: number }): number {
  return row.index
}

function yOf(row: ScatterRow): number {
  return row.value
}

function colorOf(row: ScatterRow): string {
  return `var(--color-${row.versionId})`
}

function formatX(tick: number): string {
  const commit = measured.value[tick]
  return commit ? commit.timestamp.slice(0, 10) : ''
}

function formatY(tick: number): string {
  if (!Number.isFinite(tick)) return ''
  return Math.round(tick).toLocaleString('en-US')
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => {
    if (char === '&') return '&amp;'
    if (char === '<') return '&lt;'
    if (char === '>') return '&gt;'
    if (char === '"') return '&quot;'
    return '&#39;'
  })
}

const triggers = {
  [Scatter.selectors.point]: (datum: ScatterRow) => {
    const color = datum.color
    return `<div class="border-border/50 bg-background grid min-w-[8rem] max-w-[min(22rem,80vw)] items-start gap-1.5 rounded-lg border px-2.5 py-1.5 font-mono text-xs shadow-xl"><div class="font-medium">${escapeHtml(datum.solution)}</div><div class="flex items-center gap-2"><span class="inline-block h-2 w-2" style="background:${color}"></span><span>${datum.value.toLocaleString('en-US')}</span></div><div class="break-all">${escapeHtml(datum.commit)}</div><div class="text-muted-foreground break-words">${escapeHtml(datum.diagnostics)}</div></div>`
  },
}
</script>

<template>
  <ChartContainer v-if="measured.length > 0" :config="config" class="aspect-auto w-full" :class="spark ? 'h-[48px]' : 'h-[180px]'" :cursor="!spark">
    <VisXYContainer
      :duration="reduceMotion ? 0 : 200"
      :margin="spark ? { top: 4, right: 4, bottom: 4, left: 4 } : { top: 8, right: 12, bottom: 24, left: 56 }"
      aria-label="Cost by commit"
    >
      <VisLine :data="lineRows" :x="xOf" :y="yLine" :color="lineColors" :curve-type="CurveType.StepAfter" :line-width="1.5" />
      <VisScatter :data="scatterRows" :x="xOf" :y="yOf" :color="colorOf" :size="spark ? 4 : 6" />
      <template v-if="!spark">
        <VisAxis type="x" :tick-line="false" :domain-line="false" :grid-line="false" :tick-values="xTicks" :tick-format="formatX" />
        <VisAxis type="y" :tick-line="false" :domain-line="false" :grid-line="true" :num-ticks="3" :tick-format="formatY" />
      </template>
      <ChartTooltip :triggers="triggers" />
    </VisXYContainer>
  </ChartContainer>
</template>
