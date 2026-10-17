<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import DocPage from '@/components/DocPage.vue'
import MarkdownBody from '@/components/MarkdownBody.vue'
import ProblemHistory from '@/components/ProblemHistory.vue'
import ProblemScene from '@/components/scenes/ProblemScene.vue'
import SearchScene from '@/components/scenes/SearchScene.vue'
import PlaygroundSurface from '@/PlaygroundSurface.vue'
import { caseInput, catalog, problemById, versionById, type CatalogSolution, type CatalogVersion } from '@/catalog'
import { repositoryBlob, repositoryTree } from '@/hosts'

const route = useRoute()
const problemId = computed(() => typeof route.params.problemId === 'string' ? route.params.problemId : '')
const solutionId = computed(() => typeof route.params.solutionId === 'string' ? route.params.solutionId : '')
const problem = computed(() => problemById(problemId.value))
const version = computed(() => problem.value ? versionById(problem.value, solutionId.value) : undefined)

function head(item: CatalogVersion): CatalogSolution {
  const solution = item.solutions[0]
  if (!solution) throw new Error(`${item.id} has no solution file`)
  return solution
}

const current = computed(() => version.value ? head(version.value) : undefined)
const sample = computed(() => problem.value?.cases[0])
const reads = computed(() => sample.value ? caseInput(sample.value) : {})
</script>

<template>
  <DocPage v-if="problem && version && current && sample" wide kicker="Solution" :title="`${problem.title} · ${version.name}`" :summary="`${version.name} for ${problem.title}. Go cost ${current.cost}.`">
    <template #meta>
      <RouterLink :to="problem.path" class="text-ash font-mono text-[12px] underline underline-offset-4" data-test="back-problem">{{ problem.title }}</RouterLink>
    </template>
    <template #scene>
      <div class="grid h-full min-h-0 gap-3 lg:grid-cols-2">
        <ProblemScene :problem-id="problem.id" :cases="problem.cases" />
        <figure data-test="solution-chart" class="flex min-h-0 flex-col gap-1">
          <p data-test="cost-caption" class="text-ash text-[13px] leading-snug">Go cost at each commit. The line is that ruleset's best so far.</p>
          <ProblemHistory :commits="catalog.commits" :versions="[version]" />
        </figure>
      </div>
    </template>
    <section id="source" data-test="solution-source" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Source</h2>
      <PlaygroundSurface chrome="panel" :program="current.solution" :program-path="current.solutionPath" :reads="reads" :sync-url="false" run-test="solution-run" />
    </section>
    <section id="readme" data-test="solution-readme" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Notes</h2>
      <MarkdownBody :source="version.notes" />
    </section>
    <section id="next" class="flex flex-wrap items-center gap-3">
      <Button as-child>
        <a data-test="contribute-better" :href="repositoryTree(`problems/${problem.id}/solutions/${version.id}`)" rel="noreferrer">Contribute a better solution</a>
      </Button>
      <a data-test="contributing-link" class="text-ash font-mono text-[13px] underline underline-offset-4" :href="repositoryBlob('CONTRIBUTING.md')" rel="noreferrer">contributing guide</a>
      <Button as-child variant="outline">
        <RouterLink data-test="autoresearch-link" :to="`/autoresearch?problem=${encodeURIComponent(problem.id)}&solution=${encodeURIComponent(version.id)}`">Autoresearch it</RouterLink>
      </Button>
    </section>
  </DocPage>
  <DocPage v-else kicker="Solution" title="This solution is not in the suite." summary="That ruleset has no solution here.">
    <template #scene>
      <SearchScene />
    </template>
    <p data-test="solution-missing" class="leading-7">The suite has no solution {{ problemId }}/{{ solutionId }}.</p>
  </DocPage>
</template>
