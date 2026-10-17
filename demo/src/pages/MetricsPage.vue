<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import DocPage from '@/components/DocPage.vue'
import GuestRewrite from '@/components/GuestRewrite.vue'
import MetricChart from '@/components/MetricChart.vue'
import RewriteArrow from '@/components/marks/RewriteArrow.vue'
import { catalog } from '@/catalog'
import {
  benchmarkCommits,
  changeAxis,
  commitUrl,
  countSeries,
  guestRuleChart,
  history,
  hostDurationSeries,
  pointAt,
  seriesFromField,
  taskCommits,
  workloadIds,
  workloadLabel,
  type WorkloadCommit,
} from '@/metrics'
import { pages } from '@/site'

const route = useRoute()
const page = pages.metrics
const names = new Map(catalog.guests.map(guest => [guest.id, guest.name]))
const order = catalog.guests.map(guest => guest.id)
const rules = guestRuleChart(history, order, names)
const tasks = taskCommits(history, order, names)
const passSeries = seriesFromField(tasks, 'passCount')
const stepSeries = seriesFromField(tasks, 'stepCount')
const passAxis = changeAxis(tasks, passSeries)
const stepAxis = changeAxis(tasks, stepSeries)
const workloads = workloadIds(history).map(id => {
  const commits = benchmarkCommits(history, id)
  const counts = countSeries(commits)
  const hosts = hostDurationSeries(commits)
  return {
    id,
    label: workloadLabel(id),
    commits,
    order: commits.map(commit => commit.commit),
    counts,
    countAxis: changeAxis(commits, counts),
    hosts,
    hostAxis: changeAxis(commits, hosts),
  }
})

const ruleIndex = ref(last(rules.commits.length))
const passIndex = ref(last(passAxis.length))
const stepIndex = ref(last(stepAxis.length))
const countIndex = ref<Record<string, number>>({})
const hostIndex = ref<Record<string, number>>({})
const selectedRule = computed(() => rules.commits[ruleIndex.value])
const selectedStep = computed(() => stepAxis[stepIndex.value])
const selectedTask = computed(() => {
  const commit = selectedStep.value
  if (!commit) return undefined
  return tasks.find(item => item.commit === commit.commit)
})
const selectedRules = computed(() => {
  const commit = selectedRule.value
  if (!commit) return []
  return rules.series.flatMap(series => {
    const point = pointAt(series.points, commit.commit, rules.order)
    if (!point) return []
    return [{ id: series.id, label: series.label, value: point.value }]
  })
})

function axisIndex(selected: Record<string, number>, id: string, count: number): number {
  const current = selected[id]
  if (current === undefined) return last(count)
  return current
}

function hostCommit(workload: (typeof workloads)[number]): WorkloadCommit | undefined {
  const axis = workload.hostAxis[axisIndex(hostIndex.value, workload.id, workload.hostAxis.length)]
  if (!axis) return undefined
  return workload.commits.find(commit => commit.commit === axis.commit)
}

const selectedBench = computed(() => {
  const workload = workloads[0]
  if (!workload) return undefined
  return hostCommit(workload)
})

watch(() => route.hash, hash => {
  const id = hash.startsWith('#') ? hash.slice(1) : ''
  if (!id) return
  document.getElementById(id)?.scrollIntoView()
}, { flush: 'post', immediate: true })

function last(count: number): number {
  return count === 0 ? 0 : count - 1
}
</script>

<template>
  <DocPage fold :kicker="page.kicker" :title="page.title">
    <template #mark>
      <RewriteArrow />
    </template>
    <template #graphic>
      <GuestRewrite :commits="rules.commits" :order="rules.order" :series="rules.series" />
    </template>
    <section id="rule-lines" data-test="rule-lines" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Rule lines</h2>
      <p class="leading-7">A point is the first commit where that program's compiled rule-line count changed. The line stays flat through the later commits with the same count. The point tooltip is that commit through the last unchanged commit. A break is a commit where that program was absent, or the host could not list its rules.</p>
      <MetricChart
        v-if="rules.commits.length > 0"
        test-id="rule-chart"
        label="Program rule lines per commit"
        slider-label="Rule line commit"
        :commits="rules.commits"
        :order="rules.order"
        :series="rules.series"
        :selected="ruleIndex"
        @select="ruleIndex = $event"
      />
      <p v-else>No commits are recorded.</p>
      <div v-if="selectedRule" data-test="rule-readout" class="flex flex-col gap-1">
        <p class="font-mono text-[13px] leading-6 break-all">
          <a class="underline underline-offset-4" :href="commitUrl(selectedRule.commit)" rel="noreferrer">{{ selectedRule.commit.slice(0, 12) }}</a>
          <span class="text-ash"> · {{ selectedRule.author }} · {{ selectedRule.timestamp }}</span>
        </p>
        <p v-for="point in selectedRules" :key="point.id" class="font-mono text-[13px] tabular-nums">{{ point.label }} · {{ point.value }}</p>
      </div>
    </section>
    <section id="tasks" data-test="task-trends" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Tasks</h2>
      <p class="leading-7">A point is the first commit where that program's count changed. The line stays flat while the count stays the same. Older task points were measured with <code>make tasks</code> on native Go. A new measurement records problems and languages with <code>make problems</code> and <code>make langs</code>.</p>
      <h3 id="passes" class="font-display text-[18px] font-semibold tracking-[-0.03em]">Passes</h3>
      <MetricChart
        v-if="passAxis.length > 0"
        test-id="pass-chart"
        label="Task passes per commit"
        slider-label="Task commit"
        :controls="false"
        :commits="passAxis"
        :order="tasks.map(commit => commit.commit)"
        :series="passSeries"
        :selected="passIndex"
        @select="passIndex = $event"
      />
      <p v-else>No task run is recorded.</p>
      <h3 id="task-steps" class="font-display mt-4 text-[18px] font-semibold tracking-[-0.03em]">Steps</h3>
      <MetricChart
        v-if="stepAxis.length > 0"
        test-id="step-chart"
        label="Applied steps per commit"
        slider-label="Task step commit"
        :commits="stepAxis"
        :order="tasks.map(commit => commit.commit)"
        :series="stepSeries"
        :selected="stepIndex"
        @select="stepIndex = $event"
      />
      <div v-if="selectedTask" data-test="task-readout" class="flex flex-col gap-1">
        <p class="font-mono text-[13px] leading-6 break-all">
          <a class="underline underline-offset-4" :href="commitUrl(selectedTask.commit)" rel="noreferrer">{{ selectedTask.commit.slice(0, 12) }}</a>
          <span class="text-ash"> · {{ selectedTask.author }} · {{ selectedTask.timestamp }}</span>
        </p>
        <p v-for="program in selectedTask.guests" :key="program.id" class="font-mono text-[13px] leading-6 tabular-nums">
          {{ program.name }} · {{ program.passCount }} pass · {{ program.failCount }} fail · {{ program.unsupportedCount }} unsupported · {{ program.stepCount }} steps
        </p>
      </div>
    </section>
    <section id="benchmarks" data-test="benchmarks" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Benchmarks</h2>
      <p class="leading-7">Each workload is one program. Applied steps and probes are the same on every host that ran. A host missing from an older commit is a gap. A point is the first commit where that series changed, and the line stays flat through the later commits with the same value. The point tooltip is that commit through the last unchanged commit. Duration is wall-clock milliseconds, including startup. Memory is the peak resident set size when the run recorded it. Each host line is that environment.</p>
      <p v-if="workloads.length === 0">No benchmark is recorded.</p>
      <article v-for="(workload, index) in workloads" :key="workload.id" class="flex flex-col gap-3">
        <h3 class="font-display text-[18px] font-semibold tracking-[-0.03em]">{{ workload.label }}</h3>
        <h3 v-if="index === 0" id="steps-and-probes" class="font-display text-[18px] font-semibold tracking-[-0.03em]">Steps and probes</h3>
        <p v-else class="font-display text-[18px] font-semibold tracking-[-0.03em]">Steps and probes</p>
        <MetricChart
          v-if="workload.countAxis.length > 0"
          :test-id="index === 0 ? 'probe-chart' : `probe-chart-${workload.id}`"
          :label="`${workload.label} steps and probes`"
          slider-label="Benchmark commit"
          :controls="false"
          :commits="workload.countAxis"
          :order="workload.order"
          :series="workload.counts"
          :selected="axisIndex(countIndex, workload.id, workload.countAxis.length)"
          @select="countIndex[workload.id] = $event"
        />
        <h3 v-if="index === 0" id="host-time" class="font-display mt-4 text-[18px] font-semibold tracking-[-0.03em]">Host time</h3>
        <p v-else class="font-display mt-4 text-[18px] font-semibold tracking-[-0.03em]">Host time</p>
        <MetricChart
          v-if="workload.hostAxis.length > 0"
          :test-id="index === 0 ? 'time-chart' : `time-chart-${workload.id}`"
          :label="`${workload.label} host time by environment`"
          slider-label="Host time commit"
          :commits="workload.hostAxis"
          :order="workload.order"
          :series="workload.hosts"
          :selected="axisIndex(hostIndex, workload.id, workload.hostAxis.length)"
          @select="hostIndex[workload.id] = $event"
        />
        <div v-if="index === 0 && selectedBench" data-test="benchmark-readout" class="flex flex-col gap-1">
          <p class="font-mono text-[13px] leading-6 break-all">
            <a class="underline underline-offset-4" :href="commitUrl(selectedBench.commit)" rel="noreferrer">{{ selectedBench.commit.slice(0, 12) }}</a>
            <span class="text-ash"> · {{ selectedBench.author }} · {{ selectedBench.timestamp }}</span>
          </p>
          <p class="font-mono text-[13px] tabular-nums">steps {{ selectedBench.appliedSteps }} · probes {{ selectedBench.probes }}</p>
          <p v-for="host in selectedBench.hosts" :key="host.id" class="font-mono text-[13px] tabular-nums">{{ host.environment }} · {{ host.durationMs }} ms<template v-if="host.memoryBytes !== null"> · {{ host.memoryBytes }} bytes</template> · exit {{ host.exitCode }}</p>
          <p class="text-ash font-mono text-[13px] leading-6 tabular-nums">max steps {{ selectedBench.maxSteps }} · max probes {{ selectedBench.maxEvals }} · state {{ selectedBench.maxStateBytes }} bytes · timeout {{ selectedBench.timeoutSeconds }} s · memory {{ selectedBench.memoryCapBytes }} bytes</p>
        </div>
      </article>
    </section>
  </DocPage>
</template>
