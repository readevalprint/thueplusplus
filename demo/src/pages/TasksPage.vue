<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import DocPage from '@/components/DocPage.vue'
import FinishLine from '@/components/marks/FinishLine.vue'
import RewriteLine from '@/components/RewriteLine.vue'
import { catalog, statusVariant } from '@/catalog'
import { pages } from '@/site'

const page = pages.tasks
</script>

<template>
  <DocPage wide :kicker="page.kicker" :title="page.title">
      <template #mark>
        <FinishLine />
      </template>
      <template #actions>
        <Button as-child>
          <RouterLink to="/guests">See the guests</RouterLink>
        </Button>
      </template>
      <template #graphic>
        <RewriteLine before="stdin" after="stdout" />
      </template>
      <section id="suite" data-test="task-index" class="flex flex-col gap-3">
        <h2 class="text-xl font-semibold tracking-tight">Suite</h2>
        <p class="leading-7">A task is an input and an output. The same transcript is the contract for every guest. The cell is that guest's status on every host.</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Task</TableHead>
              <TableHead v-for="guest in catalog.guests" :key="guest.id">{{ guest.name }}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow v-for="task in catalog.tasks" :key="task.id">
              <TableCell class="whitespace-normal">
                <RouterLink :to="task.path" class="font-medium underline-offset-4 hover:underline">{{ task.title }}</RouterLink>
                <p class="text-muted-foreground mt-1 max-w-md text-sm">{{ task.summary }}</p>
              </TableCell>
              <TableCell v-for="guest in task.guests" :key="guest.id">
                <RouterLink :to="`${task.path}#${guest.id}`">
                  <Badge :variant="statusVariant(guest.status)" data-test="task-status" :data-task="task.id" :data-guest="guest.id" :data-status="guest.status">{{ guest.status }}</Badge>
                </RouterLink>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
    </section>
  </DocPage>
</template>
