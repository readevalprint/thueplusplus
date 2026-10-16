<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Boxes } from '@lucide/vue'
import { RouterLink, useRoute } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import DocPage from '@/components/DocPage.vue'
import GuestRewrite from '@/components/GuestRewrite.vue'
import MetricChart from '@/components/MetricChart.vue'
import { catalog, rankGuests, sourceUrl } from '@/catalog'
import {
  benchmarkCommits,
  commitUrl,
  guestRuleChart,
  history,
  hostDurationSeries,
  seriesFromField,
  taskCommits,
} from '@/metrics'
import { pages } from '@/site'

const route = useRoute()
const page = pages.guests
const ranked = rankGuests(catalog.guests)
const shortCommit = catalog.commit.slice(0, 12)
const names = new Map(catalog.guests.map(guest => [guest.id, guest.name]))
const order = catalog.guests.map(guest => guest.id)
const rules = guestRuleChart(history, order, names)
const tasks = taskCommits(history, order, names)
const benchmarks = benchmarkCommits(history)
const passSeries = seriesFromField(tasks, 'passCount')
const stepSeries = seriesFromField(tasks, 'stepCount')
const stepProbeSeries = [
  { id: 'steps', label: 'Steps', points: benchmarks.map(commit => ({ commit: commit.commit, value: commit.appliedSteps })) },
  { id: 'probes', label: 'Probes', points: benchmarks.map(commit => ({ commit: commit.commit, value: commit.probes })) },
]
const hostSeries = hostDurationSeries(benchmarks)

const ruleIndex = ref(last(rules.commits.length))
const taskIndex = ref(last(tasks.length))
const benchIndex = ref(last(benchmarks.length))
const selectedRule = computed(() => rules.commits[ruleIndex.value])
const selectedTask = computed(() => tasks[taskIndex.value])
const selectedBench = computed(() => benchmarks[benchIndex.value])
const selectedRules = computed(() => {
  const commit = selectedRule.value
  if (!commit) return []
  return rules.series.flatMap(series => {
    const point = series.points.find(item => item.commit === commit.commit)
    if (!point) return []
    return [{ id: series.id, label: series.label, value: point.value }]
  })
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
      <Boxes />
    </template>
    <template #actions>
      <Button as-child>
        <RouterLink to="/tasks">See the tasks</RouterLink>
      </Button>
      <Button as-child variant="outline">
        <a href="#improve">Improve a guest</a>
      </Button>
    </template>
    <template #graphic>
      <GuestRewrite :commits="rules.commits" :series="rules.series" />
    </template>
    <section id="leaderboard" data-test="guest-leaderboard" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Leaderboard</h2>
      <p class="leading-7">A guest is a language implemented in Thue++. A host runs those rules. Each row is that guest across the whole suite.</p>
      <Table>
        <TableCaption>
          Run {{ catalog.timestamp }} · {{ shortCommit }}<template v-if="catalog.commitDirty"> · dirty tree</template>.
          Steps are applied rewrites on tasks that pass. Rule lines are the interpreter, not the solution.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Guest</TableHead>
            <TableHead class="text-right">Passed</TableHead>
            <TableHead class="text-right">Rule lines</TableHead>
            <TableHead class="text-right">Steps</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="guest in ranked" :key="guest.id" data-test="guest-row" :data-guest="guest.id">
            <TableCell class="font-medium">{{ guest.name }}</TableCell>
            <TableCell data-test="guest-passes" class="text-right font-mono tabular-nums">{{ guest.passCount }} / {{ guest.taskCount }}</TableCell>
            <TableCell data-test="guest-rules" class="text-right font-mono tabular-nums">{{ guest.ruleCount }}</TableCell>
            <TableCell data-test="guest-steps" class="text-right font-mono tabular-nums">{{ guest.stepCount }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </section>
    <section id="rule-lines" data-test="rule-lines" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Rule lines</h2>
      <p class="leading-7">Each point is one commit. The count is compiled rule lines from <code>--list-rules</code>. A break is a commit where that guest was absent, or the host could not list its rules.</p>
      <MetricChart
        v-if="rules.commits.length > 0"
        test-id="rule-chart"
        label="Guest rule lines per commit"
        slider-label="Rule line commit"
        :commits="rules.commits"
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
      <p class="leading-7">Each point is a commit measured with <code>make tasks</code>. A task passes when every recorded host passed it. Steps are applied rewrites on those passing tasks, counted once.</p>
      <h3 id="passes" class="font-display text-[18px] font-semibold tracking-[-0.03em]">Passes</h3>
      <MetricChart
        v-if="tasks.length > 0"
        test-id="pass-chart"
        label="Task passes per commit"
        slider-label="Task commit"
        :controls="false"
        :commits="tasks"
        :series="passSeries"
        :selected="taskIndex"
        @select="taskIndex = $event"
      />
      <p v-else>No task run is recorded.</p>
      <h3 id="task-steps" class="font-display mt-4 text-[18px] font-semibold tracking-[-0.03em]">Steps</h3>
      <MetricChart
        v-if="tasks.length > 0"
        test-id="step-chart"
        label="Applied steps per commit"
        slider-label="Task step commit"
        :commits="tasks"
        :series="stepSeries"
        :selected="taskIndex"
        @select="taskIndex = $event"
      />
      <div v-if="selectedTask" data-test="task-readout" class="flex flex-col gap-1">
        <p class="font-mono text-[13px] leading-6 break-all">
          <a class="underline underline-offset-4" :href="commitUrl(selectedTask.commit)" rel="noreferrer">{{ selectedTask.commit.slice(0, 12) }}</a>
          <span class="text-ash"> · {{ selectedTask.author }} · {{ selectedTask.timestamp }}</span>
        </p>
        <p v-for="guest in selectedTask.guests" :key="guest.id" class="font-mono text-[13px] leading-6 tabular-nums">
          {{ guest.name }} · {{ guest.passCount }} pass · {{ guest.failCount }} fail · {{ guest.unsupportedCount }} unsupported · {{ guest.stepCount }} steps
        </p>
      </div>
    </section>
    <section id="benchmarks" data-test="benchmarks" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Benchmarks</h2>
      <p class="leading-7">Each point is one run of <code>metrics/benchmark.tpp</code> on a host from <code>hosts.toml</code>. Applied steps and probes are the same on every host that ran. A host missing from an older commit is a gap. Probes are host evals. Duration is wall-clock milliseconds, including startup.</p>
      <h3 id="steps-and-probes" class="font-display text-[18px] font-semibold tracking-[-0.03em]">Steps and probes</h3>
      <MetricChart
        v-if="benchmarks.length > 0"
        test-id="probe-chart"
        label="Benchmark steps and probes per commit"
        slider-label="Benchmark commit"
        :controls="false"
        :commits="benchmarks"
        :series="stepProbeSeries"
        :selected="benchIndex"
        @select="benchIndex = $event"
      />
      <p v-else>No benchmark is recorded.</p>
      <h3 id="host-time" class="font-display mt-4 text-[18px] font-semibold tracking-[-0.03em]">Host time</h3>
      <MetricChart
        v-if="benchmarks.length > 0"
        test-id="time-chart"
        label="Benchmark host time per commit"
        slider-label="Host time commit"
        :commits="benchmarks"
        :series="hostSeries"
        :selected="benchIndex"
        @select="benchIndex = $event"
      />
      <div v-if="selectedBench" data-test="benchmark-readout" class="flex flex-col gap-1">
        <p class="font-mono text-[13px] leading-6 break-all">
          <a class="underline underline-offset-4" :href="commitUrl(selectedBench.commit)" rel="noreferrer">{{ selectedBench.commit.slice(0, 12) }}</a>
          <span class="text-ash"> · {{ selectedBench.author }} · {{ selectedBench.timestamp }}</span>
        </p>
        <p class="font-mono text-[13px] tabular-nums">steps {{ selectedBench.appliedSteps }} · probes {{ selectedBench.probes }}</p>
        <p v-for="host in selectedBench.hosts" :key="host.id" class="font-mono text-[13px] tabular-nums">{{ host.environment }} · {{ host.durationMs }} ms · exit {{ host.exitCode }}</p>
        <p class="text-ash font-mono text-[13px] leading-6 tabular-nums">max steps {{ selectedBench.maxSteps }} · max probes {{ selectedBench.maxEvals }} · state {{ selectedBench.maxStateBytes }} bytes · timeout {{ selectedBench.timeoutSeconds }} s · memory {{ selectedBench.memoryCapBytes }} bytes</p>
      </div>
    </section>
    <section id="improve" data-test="guest-improve" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Improve a guest</h2>
      <p class="leading-7">Autoresearch is a loop a person or an agent can run. Edit one guest, run <code>make tasks</code>, and keep the edit when more tasks pass, or when the same tasks pass with fewer rules or fewer steps.</p>
      <ul class="flex flex-col gap-2">
        <li v-for="guest in catalog.guests" :key="guest.id">
          <a class="underline underline-offset-4" :href="sourceUrl(guest.program)" rel="noreferrer">{{ guest.name }}</a>
          <Badge variant="secondary" class="ml-2">{{ guest.ruleCount }} rules</Badge>
        </li>
      </ul>
    </section>
  </DocPage>
</template>
