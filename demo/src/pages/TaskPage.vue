<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import DocPage from '@/components/DocPage.vue'
import FinishLine from '@/components/marks/FinishLine.vue'
import RewriteLine from '@/components/RewriteLine.vue'
import { paragraphs, previewLine, sourceUrl, statusVariant, taskById } from '@/catalog'

const route = useRoute()
const taskId = computed(() => typeof route.params.taskId === 'string' ? route.params.taskId : '')
const task = computed(() => taskById(taskId.value))
const graphic = computed(() => task.value ? previewLine(task.value.cases[0]?.stdout ?? '') : 'missing')

function caseAnchor(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `case-${slug}`
}

</script>

<template>
  <DocPage v-if="task" kicker="Tasks" :title="task.title">
    <template #mark>
      <FinishLine />
    </template>
    <template #actions>
      <Button as-child>
        <RouterLink to="/tasks">All tasks</RouterLink>
      </Button>
    </template>
    <template #graphic>
      <RewriteLine before="stdin" :after="graphic" />
    </template>
    <section id="description" data-test="task-description" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Description</h2>
      <p v-for="(paragraph, index) in paragraphs(task.description)" :key="index" class="leading-7">{{ paragraph }}</p>
    </section>
    <section id="input-and-output" data-test="task-io" class="flex flex-col gap-6">
      <h2 class="text-xl font-semibold tracking-tight">Input and output</h2>
      <div v-for="(item, index) in task.cases" :key="item.name" data-test="task-case" class="flex flex-col gap-3">
        <Separator v-if="index > 0" />
        <h3 v-if="task.cases.length > 1" :id="caseAnchor(item.name)" class="font-medium">{{ item.name }}</h3>
        <p class="text-sm font-medium">stdin</p>
        <pre v-if="item.stdin.length > 0" class="border-line bg-surface overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ item.stdin }}</pre>
        <p v-else class="text-muted-foreground text-sm">empty</p>
        <p class="text-sm font-medium">stdout</p>
        <pre v-if="item.stdout.length > 0" class="border-line bg-surface overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ item.stdout }}</pre>
        <p v-else class="text-muted-foreground text-sm">empty</p>
        <p class="text-sm font-medium">stderr</p>
        <pre v-if="item.stderr.length > 0" class="border-line bg-surface overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ item.stderr }}</pre>
        <p v-else class="text-muted-foreground text-sm">empty</p>
        <p class="text-muted-foreground font-mono text-sm">exit {{ item.exitCode }}</p>
      </div>
    </section>
    <section v-for="guest in task.guests" :id="guest.id" :key="guest.id" data-test="task-guest" :data-guest="guest.id" class="flex flex-col gap-3">
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="text-xl font-semibold tracking-tight">{{ guest.name }}</h2>
        <Badge :variant="statusVariant(guest.status)">{{ guest.status }}</Badge>
        <span v-if="guest.stepCount !== null" class="text-muted-foreground font-mono text-sm">{{ guest.stepCount }} steps</span>
      </div>
      <pre v-if="guest.solution !== null" class="border-line bg-surface overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ guest.solution }}</pre>
      <p v-else class="leading-7">{{ guest.reason }}</p>
      <p v-if="guest.error" class="text-destructive leading-7">{{ guest.error }}</p>
      <p v-if="guest.solutionPath">
        <a class="underline underline-offset-4" :href="sourceUrl(guest.solutionPath)" rel="noreferrer">Solution file</a>
      </p>
    </section>
  </DocPage>
  <DocPage v-else kicker="Tasks" title="This task is not in the suite.">
    <template #mark>
      <FinishLine />
    </template>
    <template #actions>
      <Button as-child>
        <RouterLink to="/tasks">All tasks</RouterLink>
      </Button>
    </template>
    <template #graphic>
      <RewriteLine before="task" after="missing" />
    </template>
    <p data-test="task-missing" class="leading-7">The suite has no task named {{ taskId }}.</p>
  </DocPage>
</template>
