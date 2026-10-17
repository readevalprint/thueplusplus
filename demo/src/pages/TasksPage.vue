<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import DocPage from '@/components/DocPage.vue'
import FinishLine from '@/components/marks/FinishLine.vue'
import RewriteLine from '@/components/RewriteLine.vue'
import { catalog, rankGuests, sourceUrl, statusVariant } from '@/catalog'
import { pages } from '@/site'

const page = pages.tasks
const ranked = rankGuests(catalog.guests)
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
      <section id="suite" data-test="task-index" class="flex flex-col gap-3">
        <h2 class="text-xl font-semibold tracking-tight">Suite</h2>
        <p class="leading-7">A task is an input and an output. The Go test for that task builds the inputs and the reference output. A pass means every case matched. The cell is that program on the native Go host.</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead v-for="program in catalog.guests" :key="program.id">{{ program.name }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="task in catalog.tasks" :key="task.id">
              <TableCell class="whitespace-normal">
                <RouterLink :to="task.path" class="font-medium underline-offset-4 hover:underline">{{ task.title }}</RouterLink>
                <p class="text-muted-foreground mt-1 max-w-md text-sm">{{ task.summary }}</p>
              </TableCell>
              <TableCell v-for="program in task.guests" :key="program.id">
                <RouterLink :to="`${task.path}#${program.id}`">
                  <Badge :variant="statusVariant(program.status)" data-test="task-status" :data-task="task.id" :data-program="program.id" :data-status="program.status">{{ program.status }}</Badge>
                </RouterLink>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
    </section>
    <section id="leaderboard" data-test="program-leaderboard" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Leaderboard</h2>
      <p class="leading-7">Each row is one program across the whole suite. Steps are applied rewrites on tasks that pass. Rule lines are the program, not the solution.</p>
      <Table>
        <TableCaption>
          Run {{ catalog.timestamp }} · {{ shortCommit }}<template v-if="catalog.commitDirty"> · dirty tree</template>.
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>Program</TableHead>
            <TableHead class="text-right">Passed</TableHead>
            <TableHead class="text-right">Rule lines</TableHead>
            <TableHead class="text-right">Steps</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow v-for="program in ranked" :key="program.id" data-test="program-row" :data-program="program.id">
            <TableCell class="font-medium">{{ program.name }}</TableCell>
            <TableCell data-test="program-passes" class="text-right font-mono tabular-nums">{{ program.passCount }} / {{ program.taskCount }}</TableCell>
            <TableCell data-test="program-rules" class="text-right font-mono tabular-nums">{{ program.ruleCount }}</TableCell>
            <TableCell data-test="program-steps" class="text-right font-mono tabular-nums">{{ program.stepCount }}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </section>
    <section id="improve" data-test="program-improve" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Improve a program</h2>
      <p class="leading-7">Autoresearch is a loop a person or an agent can run. Edit one program, run <code>make tasks</code>, and keep the edit when more tasks pass, or when the same tasks pass with fewer rules or fewer steps.</p>
      <ul class="flex flex-col gap-2">
        <li v-for="program in catalog.guests" :key="program.id">
          <a class="underline underline-offset-4" :href="sourceUrl(program.program)" rel="noreferrer">{{ program.name }}</a>
        </li>
      </ul>
    </section>
  </DocPage>
</template>
