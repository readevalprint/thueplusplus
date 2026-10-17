<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Button } from '@/components/ui/button'
import DocPage from '@/components/DocPage.vue'
import MetricChart from '@/components/MetricChart.vue'
import RulesetScene from '@/components/scenes/RulesetScene.vue'
import SearchScene from '@/components/scenes/SearchScene.vue'
import { catalog, rulesetById } from '@/catalog'

const route = useRoute()
const rulesetId = computed(() => typeof route.params.rulesetId === 'string' ? route.params.rulesetId : '')
const ruleset = computed(() => rulesetById(rulesetId.value))
const selected = ref(0)
const commits = computed(() => ruleset.value?.aggregateSeries ?? [])
const series = computed(() => ruleset.value ? [{
  id: ruleset.value.id,
  label: ruleset.value.name,
  points: ruleset.value.aggregateSeries.map(point => ({ commit: point.commit, until: point.commit, value: point.cost })),
}] : [])

const problems = computed(() => {
  const current = ruleset.value
  if (!current) return []
  return catalog.problems.flatMap(problem => {
    const version = problem.versions.find(item => item.id === current.id)
    const cost = version?.solutions[0]?.cost
    return cost == null ? [] : [{ id: problem.id, title: problem.title, path: problem.path, cost }]
  })
})
</script>

<template>
  <DocPage v-if="ruleset" wide kicker="Rulesets" :title="ruleset.name" :summary="`${ruleset.passing} of ${ruleset.total} problems pass.`">
    <template #scene>
      <RulesetScene :ruleset-id="ruleset.id" />
    </template>
    <template #meta>
      <Button as-child variant="outline" size="sm">
        <RouterLink to="/problems">All problems</RouterLink>
      </Button>
    </template>
    <section id="aggregate" data-test="ruleset-aggregate-chart" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Aggregate cost</h2>
      <p class="leading-7">The sum of this ruleset's Go costs on the problems that were common at that commit. Coverage is {{ ruleset.passing }}/{{ ruleset.total }}. {{ ruleset.common }} problems are common now.</p>
      <p data-test="ruleset-aggregate" class="font-mono text-sm">{{ ruleset.aggregate === null ? 'no passing solution' : `sum ${ruleset.aggregate}` }}</p>
      <MetricChart
        v-if="series[0] && series[0].points.length > 0"
        test-id="aggregate-chart"
        label="Aggregate cost"
        slider-label="Aggregate commit"
        :commits="commits"
        :order="commits.map(commit => commit.commit)"
        :series="series"
        :selected="Math.min(selected, Math.max(commits.length - 1, 0))"
        @select="selected = $event"
      />
    </section>
    <section id="problems" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Problems</h2>
      <p v-for="problem in problems" :key="problem.id" class="font-mono text-sm">
        <RouterLink class="underline underline-offset-4" :to="problem.path">{{ problem.title }}</RouterLink>
        · {{ problem.cost }}
      </p>
    </section>
  </DocPage>
  <DocPage v-else kicker="Rulesets" title="This ruleset is not in the suite." summary="That name is not on the leaderboard.">
    <template #scene>
      <SearchScene />
    </template>
    <template #meta>
      <Button as-child variant="outline" size="sm">
        <RouterLink to="/problems">All problems</RouterLink>
      </Button>
    </template>
    <p data-test="ruleset-missing" class="leading-7">The suite has no ruleset named {{ rulesetId }}.</p>
  </DocPage>
</template>
