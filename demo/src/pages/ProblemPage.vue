<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import DocPage from '@/components/DocPage.vue'
import MarkdownBody from '@/components/MarkdownBody.vue'
import ProblemHistory from '@/components/ProblemHistory.vue'
import RuleBlock from '@/components/RuleBlock.vue'
import ProblemScene from '@/components/scenes/ProblemScene.vue'
import SearchScene from '@/components/scenes/SearchScene.vue'
import {
  authorName,
  bestVersion,
  catalog,
  measuredOn,
  problemById,
  solutionPath,
  statusVariant,
  type CatalogSolution,
  type CatalogVersion,
  type ProblemCase,
  type ProblemResource,
} from '@/catalog'
import { repositoryBlob, repositoryTree } from '@/hosts'

const route = useRoute()
const problemId = computed(() => typeof route.params.problemId === 'string' ? route.params.problemId : '')
const problem = computed(() => problemById(problemId.value))
const open = ref<Record<string, boolean>>({})
const copyError = ref('')

const best = computed(() => problem.value ? bestVersion(problem.value) : undefined)
const sample = computed(() => problem.value?.cases[0])

function chip(resource: ProblemResource): string {
  const direction = resource.read && resource.write ? 'in/out' : resource.read ? 'in' : 'out'
  return `${resource.name} ${direction}`
}

function head(version: CatalogVersion): CatalogSolution {
  const solution = version.solutions[0]
  if (!solution) throw new Error(`${version.id} has no solution file`)
  return solution
}

function measured(version: CatalogVersion): string {
  const point = version.series.at(-1)
  if (!point) throw new Error(`${version.id} has no measurement`)
  return measuredOn(point.commit)
}

function playgroundTo(id: string, solutionId: string): string {
  return `/playground?problem=${encodeURIComponent(id)}&solution=${encodeURIComponent(solutionId)}`
}

function readLines(item: ProblemCase, name: string): string {
  const lines = item.reads[name]
  if (!lines) throw new Error(`${item.name} has no ${name}`)
  return lines.join('\n')
}

async function copySource(text: string): Promise<void> {
  copyError.value = ''
  if (!navigator.clipboard) {
    copyError.value = 'This browser has no clipboard API.'
    return
  }
  try {
    await navigator.clipboard.writeText(text)
  } catch (error) {
    copyError.value = error instanceof Error ? error.message : String(error)
  }
}
</script>

<template>
  <DocPage v-if="problem && best && sample" wide kicker="Problems" :title="problem.title" :summary="problem.summary">
    <template #meta>
      <RouterLink to="/problems" class="text-ash font-mono text-[12px] underline underline-offset-4" data-test="all-problems">All problems</RouterLink>
      <span v-for="resource in problem.resources" :key="resource.name" data-test="resource-chip" class="border-line text-ash border px-2 py-0.5 font-mono text-[12px]">{{ chip(resource) }}</span>
    </template>
    <template #scene>
      <ProblemScene :problem-id="problem.id" :cases="problem.cases" />
    </template>
    <section id="cost" data-test="problem-history" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Cost</h2>
      <p data-test="cost-caption" class="text-ash max-w-[62ch] text-[15px] leading-snug">Each point is one solution. The line is that ruleset's best so far.</p>
      <figure data-test="problem-chart-cost">
        <ProblemHistory :commits="catalog.commits" :versions="problem.versions" />
      </figure>
    </section>
    <section id="scoreboard" data-test="problem-scoreboard" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Scoreboard</h2>
      <table class="w-full border-collapse text-left text-sm">
        <thead>
          <tr class="text-dim border-line border-b font-mono text-[12px]">
            <th class="py-2 pr-3 font-medium">Ruleset</th>
            <th class="py-2 pr-3 font-medium">Cost</th>
            <th class="py-2 pr-3 font-medium">Status</th>
            <th class="py-2 pr-3 font-medium">Author</th>
            <th class="py-2 font-medium">Measured</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="version in problem.versions" :key="version.id" data-test="score-row" :data-version="version.id" class="border-line border-b">
            <td class="py-2 pr-3">
              <RouterLink :to="solutionPath(problem.id, version.id)" class="underline underline-offset-4">{{ version.name }}</RouterLink>
            </td>
            <td class="py-2 pr-3 font-mono" data-test="problem-cost">cost {{ head(version).cost }}</td>
            <td class="py-2 pr-3">
              <Badge :variant="statusVariant(head(version).status)">{{ head(version).status }}</Badge>
            </td>
            <td class="py-2 pr-3">{{ authorName(version.author) }}</td>
            <td class="py-2 font-mono">{{ measured(version) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
    <section id="example" data-test="problem-example" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Example</h2>
      <p class="font-mono text-sm" data-test="example-name">{{ sample.name }}</p>
      <div v-if="Object.keys(sample.reads).length === 0" data-test="example-input" class="text-ash text-sm">no input</div>
      <div v-for="(_lines, name) in sample.reads" :key="`read-${name}`" class="flex flex-col gap-1">
        <p class="text-dim font-mono text-[12px]">{{ name }}</p>
        <pre data-test="example-input" class="border-line bg-surface overflow-x-auto border p-3 font-mono text-[13px] leading-[1.7]">{{ readLines(sample, String(name)) }}</pre>
      </div>
      <div v-for="(text, name) in sample.writes" :key="`write-${name}`" class="flex flex-col gap-1">
        <p class="text-dim font-mono text-[12px]">{{ name }}</p>
        <pre data-test="example-output" class="border-line bg-surface overflow-x-auto border p-3 font-mono text-[13px] leading-[1.7]">{{ text }}</pre>
      </div>
    </section>
    <section id="actions" class="flex flex-wrap items-center gap-3">
      <Button as-child>
        <a data-test="improve-link" :href="repositoryTree(`problems/${problem.id}`)" rel="noreferrer">Beat this</a>
      </Button>
      <a data-test="contributing-link" class="text-ash font-mono text-[13px] underline underline-offset-4" :href="repositoryBlob('CONTRIBUTING.md')" rel="noreferrer">contributing guide</a>
      <Button as-child variant="outline">
        <RouterLink data-test="try-playground" :to="playgroundTo(problem.id, best.id)">Try in playground</RouterLink>
      </Button>
    </section>
    <section id="description" data-test="problem-description" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Description</h2>
      <MarkdownBody :source="problem.description" />
    </section>
    <section id="solutions" data-test="problem-solutions" class="flex flex-col gap-4">
      <h2 class="text-xl font-semibold tracking-tight">Solutions</h2>
      <article v-for="version in problem.versions" :id="version.id" :key="version.id" data-test="problem-version" :data-version="version.id" class="border-line flex flex-col gap-3 border p-4">
        <button type="button" class="flex w-full items-center justify-between gap-3 text-left" data-test="solution-toggle" :aria-expanded="open[version.id] === true" @click="open[version.id] = !open[version.id]">
          <span class="font-medium">{{ version.name }}</span>
          <span class="text-dim font-mono text-sm">{{ open[version.id] ? 'hide' : 'show' }} · {{ head(version).status }} · cost {{ head(version).cost }}</span>
        </button>
        <template v-if="open[version.id]">
          <RuleBlock :source="head(version).solution" />
          <div class="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" data-test="copy-solution" @click="copySource(head(version).solution)">Copy</Button>
            <Button as-child variant="outline" size="sm">
              <RouterLink data-test="run-solution" :to="playgroundTo(problem.id, version.id)">Run in playground</RouterLink>
            </Button>
            <Button as-child variant="outline" size="sm">
              <RouterLink :to="solutionPath(problem.id, version.id)">Open solution</RouterLink>
            </Button>
          </div>
          <p v-if="copyError" data-test="copy-solution-error" class="text-destructive text-sm">{{ copyError }}</p>
          <MarkdownBody v-if="version.notes" :source="version.notes" />
        </template>
      </article>
    </section>
    <div data-test="problem-credit" class="text-dim text-sm">
      <MarkdownBody :source="problem.credit" />
    </div>
  </DocPage>
  <DocPage v-else kicker="Problems" title="This problem is not in the suite." summary="That name is not on the leaderboard.">
    <template #scene>
      <SearchScene />
    </template>
    <template #meta>
      <Button as-child variant="outline" size="sm">
        <RouterLink to="/problems">All problems</RouterLink>
      </Button>
    </template>
    <p data-test="problem-missing" class="leading-7">The suite has no problem named {{ problemId }}.</p>
  </DocPage>
</template>
