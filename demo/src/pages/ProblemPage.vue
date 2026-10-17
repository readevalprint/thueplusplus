<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import DocPage from '@/components/DocPage.vue'
import FinishLine from '@/components/marks/FinishLine.vue'
import ProblemHistory from '@/components/ProblemHistory.vue'
import RewriteLine from '@/components/RewriteLine.vue'
import { catalog, paragraphs, previewLine, problemById, sourceUrl, statusVariant } from '@/catalog'

const route = useRoute()
const problemId = computed(() => typeof route.params.problemId === 'string' ? route.params.problemId : '')
const problem = computed(() => problemById(problemId.value))
const graphic = computed(() => {
  const solution = problem.value?.versions.flatMap(version => version.solutions)[0]
  return solution ? previewLine(solution.solution) : 'missing'
})
</script>

<template>
  <DocPage v-if="problem" kicker="Problems" :title="problem.title">
    <template #mark>
      <FinishLine />
    </template>
    <template #actions>
      <Button as-child>
        <RouterLink to="/problems">All problems</RouterLink>
      </Button>
    </template>
    <template #graphic>
      <RewriteLine before="stdin" :after="graphic" />
    </template>
    <section id="description" data-test="problem-description" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Description</h2>
      <p v-for="(paragraph, index) in paragraphs(problem.description)" :key="index" class="leading-7">{{ paragraph }}</p>
    </section>
    <section id="cost" data-test="problem-history" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Cost</h2>
      <p class="leading-7">Each point is one solution at the commit that measured it. The y axis is its Go cost. Color is the ruleset. The step line is that ruleset's running best, the minimum so far. The tooltip shows the solution file, the cost, the commit, and the diagnostic counters.</p>
      <figure data-test="problem-chart-cost">
        <ProblemHistory :commits="catalog.commits" :versions="problem.versions" />
      </figure>
    </section>
    <section id="solutions" data-test="problem-solutions" class="flex flex-col gap-8">
      <div class="flex flex-col gap-3">
        <h2 class="text-xl font-semibold tracking-tight">Solutions</h2>
        <p class="leading-7">Cost is the native Go measurement. A changed solution must pass and be strictly cheaper. Regex evals, regex matches, cumulative state size, rule count, and rule chars stay on the chart tooltip.</p>
      </div>
      <section v-for="version in problem.versions" :id="version.id" :key="version.id" data-test="problem-version" :data-version="version.id" class="flex flex-col gap-3">
        <h3 class="text-lg font-semibold tracking-tight">{{ version.name }}</h3>
        <p v-for="(paragraph, index) in paragraphs(version.notes)" :key="index" class="leading-7" data-test="solution-notes">{{ paragraph }}</p>
        <p class="text-muted-foreground text-sm">{{ version.author }}</p>
        <article v-for="solution in version.solutions" :key="solution.id" data-test="problem-solution" :data-solution="solution.id" class="flex flex-col gap-3">
          <div class="flex flex-wrap items-center gap-3">
            <p class="font-medium">{{ solution.id }}</p>
            <Badge :variant="statusVariant(solution.status)">{{ solution.status }}</Badge>
          </div>
          <p v-if="solution.status === 'pass'" data-test="problem-cost" class="font-mono text-sm leading-6">cost {{ solution.cost }}</p>
          <pre class="border-line bg-surface overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ solution.solution }}</pre>
          <p>
            <a class="underline underline-offset-4" :href="sourceUrl(solution.solutionPath)" rel="noreferrer">Solution file</a>
          </p>
        </article>
      </section>
    </section>
  </DocPage>
  <DocPage v-else kicker="Problems" title="This problem is not in the suite.">
    <template #mark>
      <FinishLine />
    </template>
    <template #actions>
      <Button as-child>
        <RouterLink to="/problems">All problems</RouterLink>
      </Button>
    </template>
    <template #graphic>
      <RewriteLine before="problem" after="missing" />
    </template>
    <p data-test="problem-missing" class="leading-7">The suite has no problem named {{ problemId }}.</p>
  </DocPage>
</template>
