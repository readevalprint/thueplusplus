<script setup lang="ts">
import { computed, ref } from 'vue'
import DocPage from '@/components/DocPage.vue'
import MetricChart from '@/components/MetricChart.vue'
import MetricsScene from '@/components/scenes/MetricsScene.vue'
import { commitUrl, history, hostChart, hostLine, type HostMeasure } from '@/metrics'
import { pages } from '@/site'

const page = pages.metrics
const latest = computed(() => history.entries[history.entries.length - 1])
const time = computed(() => hostChart(history, 'durationMs'))
const memory = computed(() => hostChart(history, 'memoryBytes'))
const timeIndex = ref(0)
const memoryIndex = ref(0)

function select(measure: HostMeasure): number {
  const chart = measure === 'durationMs' ? time.value : memory.value
  return Math.max(chart.commits.length - 1, 0)
}

timeIndex.value = select('durationMs')
memoryIndex.value = select('memoryBytes')
</script>

<template>
  <DocPage wide :kicker="page.kicker" :title="page.title" :summary="page.description">
    <template #scene>
      <MetricsScene />
    </template>
    <p class="leading-7">Host time and host memory come from the solution runs. Each line is that host divided by Go native, so it reads python 1.2× go. Milliseconds stay off the readout.</p>
    <section id="host-time" data-test="benchmarks" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Host time</h2>
      <p v-if="time.series.length === 0">No host run is recorded.</p>
      <MetricChart
        v-else
        test-id="time-chart"
        label="Host time relative to Go native"
        slider-label="Host time commit"
        scale="ratio"
        :commits="time.commits"
        :order="time.order"
        :series="time.series"
        :selected="timeIndex"
        @select="timeIndex = $event"
      />
      <div v-if="latest" data-test="benchmark-readout" class="flex flex-col gap-1">
        <p class="font-mono text-[13px] leading-6 break-all">
          <a class="underline underline-offset-4" :href="commitUrl(latest.commit)" rel="noreferrer">{{ latest.commit.slice(0, 12) }}</a>
          <span class="text-ash"> · {{ latest.author }} · {{ latest.timestamp }}</span>
        </p>
        <p v-for="host in latest.hosts" :key="host.id" class="font-mono text-[13px] tabular-nums">{{ host.environment }} · {{ hostLine(latest, host.id, 'durationMs') }}</p>
      </div>
    </section>
    <section id="host-memory" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Host memory</h2>
      <p v-if="memory.series.length === 0">No memory is recorded.</p>
      <MetricChart
        v-else
        test-id="memory-chart"
        label="Host memory relative to Go native"
        slider-label="Host memory commit"
        scale="ratio"
        :commits="memory.commits"
        :order="memory.order"
        :series="memory.series"
        :selected="memoryIndex"
        @select="memoryIndex = $event"
      />
    </section>
  </DocPage>
</template>
