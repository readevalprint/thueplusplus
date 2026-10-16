<script setup lang="ts">
import { Boxes } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import DocPage from '@/components/DocPage.vue'
import RewriteLine from '@/components/RewriteLine.vue'
import { catalog, rankGuests, sourceUrl } from '@/catalog'
import { pages } from '@/site'

const page = pages.guests
const ranked = rankGuests(catalog.guests)
const shortCommit = catalog.commit.slice(0, 12)
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title">
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
        <RewriteLine before="guest" after="rules" />
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
      <!-- #16: per-commit trend charts go between the leaderboard and the call. -->
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
