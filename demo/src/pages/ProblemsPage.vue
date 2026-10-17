<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import DocPage from '@/components/DocPage.vue'
import FinishLine from '@/components/marks/FinishLine.vue'
import MetricChart from '@/components/MetricChart.vue'
import ProblemHistory from '@/components/ProblemHistory.vue'
import RewriteLine from '@/components/RewriteLine.vue'
import { catalog, sourceUrl, statusVariant, versionStatus, type CatalogProblem } from '@/catalog'
import { type SeriesPoint } from '@/metrics'
import { pages } from '@/site'

const page = pages.problems
const rulesets = catalog.rulesets
const shortCommit = catalog.commit.slice(0, 12)
const solvedIndex = ref(Math.max(catalog.commits.length - 1, 0))
const solvedSeries = rulesets.map(ruleset => ({
  id: ruleset.id,
  label: ruleset.name,
  points: ruleset.solved.map(point => ({ commit: point.commit, until: point.commit, value: point.count })),
}))

function versionOf(problem: CatalogProblem, id: string) {
  return problem.versions.find(version => version.id === id)
}

function solvedText(id: string, point: SeriesPoint): string {
  const row = catalog.rulesets.find(ruleset => ruleset.id === id)?.solved.find(item => item.commit === point.commit)
  const added = row && row.added.length > 0 ? row.added.join(', ') : 'no new problem'
  return `${point.commit.slice(0, 12)} · ${added}`
}
</script>

<template>
  <DocPage wide :kicker="page.kicker" :title="page.title">
    <template #mark>
      <FinishLine />
    </template>
    <template #actions>
      <Button as-child>
        <RouterLink to="/projects">See the programs</RouterLink>
      </Button>
    </template>
    <template #graphic>
      <RewriteLine before="stdin" after="stdout" />
    </template>
    <section id="rulesets" data-test="program-leaderboard" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Rulesets</h2>
      <p class="leading-7">A ruleset's cost is the sum of its Go costs on the common problems: the problems every ruleset with a passing solution passes. Coverage is how many problems that ruleset passes. {{ catalog.commonProblems.length }} problems are common.</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <Card v-for="ruleset in rulesets" :key="ruleset.id" data-test="ruleset-card" :data-ruleset="ruleset.id">
          <CardHeader>
            <CardTitle>{{ ruleset.name }}</CardTitle>
            <CardDescription>{{ ruleset.passing }}/{{ ruleset.total }} · {{ ruleset.common }} common</CardDescription>
          </CardHeader>
          <CardContent class="flex flex-col gap-2">
            <p data-test="ruleset-aggregate" class="font-mono text-sm">{{ ruleset.aggregate === null ? 'no passing solution' : `sum ${ruleset.aggregate}` }}</p>
            <RouterLink class="underline underline-offset-4" :to="`/rulesets/${ruleset.id}`">Cost history</RouterLink>
          </CardContent>
        </Card>
      </div>
      <h3 id="solved" class="text-lg font-semibold tracking-tight">Solved problems</h3>
      <p class="leading-7">Each step line is one ruleset. The count is how many problems that ruleset passes. The tooltip names the commit and the problem added.</p>
      <MetricChart
        v-if="solvedSeries.some(series => series.points.length > 0)"
        test-id="solved-chart"
        label="Solved problems"
        slider-label="Solved problems commit"
        :commits="catalog.commits"
        :order="catalog.commits.map(commit => commit.commit)"
        :series="solvedSeries"
        :selected="solvedIndex"
        :point-text="solvedText"
        @select="solvedIndex = $event"
      />
    </section>
    <section id="suite" data-test="problem-index" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Suite</h2>
      <p class="leading-7">A problem is an input and an output. The cases in that directory are the contract. A pass means every case matched on the native Go host.</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Problem</TableHead>
            <TableHead v-for="ruleset in rulesets" :key="ruleset.id">{{ ruleset.name }}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="problem in catalog.problems" :key="problem.id">
            <TableCell class="whitespace-normal">
              <RouterLink :to="problem.path" class="font-medium underline-offset-4 hover:underline">{{ problem.title }}</RouterLink>
              <p class="text-muted-foreground mt-1 max-w-md text-sm">{{ problem.summary }}</p>
              <div class="mt-2 max-w-xs" data-test="problem-sparkline" :data-problem="problem.id">
                <ProblemHistory spark :commits="catalog.commits" :versions="problem.versions" />
              </div>
            </TableCell>
            <TableCell v-for="ruleset in rulesets" :key="ruleset.id">
              <RouterLink v-if="versionOf(problem, ruleset.id) && versionStatus(versionOf(problem, ruleset.id)!)" :to="`${problem.path}#${ruleset.id}`">
                <Badge :variant="statusVariant(versionStatus(versionOf(problem, ruleset.id)!)!)" data-test="problem-status" :data-problem="problem.id" :data-version="ruleset.id" :data-status="versionStatus(versionOf(problem, ruleset.id)!)">{{ versionStatus(versionOf(problem, ruleset.id)!) }}</Badge>
              </RouterLink>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p class="text-muted-foreground font-mono text-sm">Measured {{ catalog.timestamp }} · {{ shortCommit }}.</p>
    </section>
    <section id="improve" data-test="program-improve" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Improve a solution</h2>
      <p class="leading-7">Autoresearch is a loop a person or an agent can run. Edit one solution, run <code>make problems</code>, and keep the edit when the tests pass and its Go cost is strictly lower than the other passing file in that directory.</p>
      <ul class="flex flex-col gap-2">
        <li v-for="problem in catalog.problems" :key="problem.id">
          <template v-for="version in problem.versions" :key="version.id">
            <a v-for="solution in version.solutions" :key="solution.id" class="underline underline-offset-4" :href="sourceUrl(solution.solutionPath)" rel="noreferrer">{{ problem.title }} / {{ solution.id }}</a>
          </template>
        </li>
      </ul>
    </section>
  </DocPage>
</template>
