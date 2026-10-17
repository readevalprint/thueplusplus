<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import DocPage from '@/components/DocPage.vue'
import FinishLine from '@/components/marks/FinishLine.vue'
import ProblemHistory from '@/components/ProblemHistory.vue'
import RewriteLine from '@/components/RewriteLine.vue'
import { catalog, sourceUrl, statusVariant, versionStatus } from '@/catalog'
import { pages } from '@/site'

const page = pages.problems
const versions = catalog.problems[0]?.versions ?? []
const shortCommit = catalog.commit.slice(0, 12)
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
    <section id="suite" data-test="problem-index" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Suite</h2>
      <p class="leading-7">A problem is an input and an output. The Go test for that problem builds the inputs and the reference output. A pass means every case matched on the native Go host. A language version with no solution on that problem stays missing.</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Problem</TableHead>
            <TableHead v-for="version in versions" :key="version.id">{{ version.name }}</TableHead>
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
            <TableCell v-for="version in problem.versions" :key="version.id">
              <RouterLink v-if="versionStatus(version)" :to="`${problem.path}#${version.id}`">
                <Badge :variant="statusVariant(versionStatus(version)!)" data-test="problem-status" :data-problem="problem.id" :data-version="version.id" :data-status="versionStatus(version)">{{ versionStatus(version) }}</Badge>
              </RouterLink>
              <span v-else data-test="problem-missing" :data-problem="problem.id" :data-version="version.id">Missing.</span>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      <p class="text-muted-foreground font-mono text-sm">Measured {{ catalog.timestamp }} · {{ shortCommit }}.</p>
    </section>
    <section id="languages" data-test="language-versions" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Languages</h2>
      <p class="leading-7">Forth, Lisp, and BASIC run the shared cases on the native Go host. The overhead on each card is that version's Go cost. A version with no measurement stays missing.</p>
      <div class="grid gap-3 sm:grid-cols-3">
        <Card v-for="lang in catalog.langs" :key="`${lang.language}/${lang.id}`" data-test="language-version" :data-language="lang.language" :data-status="lang.status">
          <CardHeader>
            <CardTitle>{{ lang.name }}</CardTitle>
            <CardDescription v-if="lang.status === 'missing'" data-test="problem-missing">Missing.</CardDescription>
            <CardDescription v-else>{{ lang.status }}</CardDescription>
          </CardHeader>
          <CardContent v-if="lang.status === 'pass'">
            <p data-test="lang-overhead" class="font-mono text-sm">overhead {{ lang.cost }}</p>
          </CardContent>
        </Card>
      </div>
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
