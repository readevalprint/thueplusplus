<script setup lang="ts">
import DocPage from '@/components/DocPage.vue'
import FinishLine from '@/components/marks/FinishLine.vue'
import { pages } from '@/site'

const page = pages.tasks
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title">
    <template #mark>
      <FinishLine />
    </template>
    <section id="what-a-task-is" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">What a task is</h2>
      <p class="leading-7">A task is a small Thue++ program with a result you can check. You get the rules, or a gap in them, and a state to start from.</p>
    </section>
    <section id="finish-line" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Finish line</h2>
      <p class="text-muted-foreground leading-7">Placeholder. A finished task stops on its own, or with <code>::-</code>, and its output matches the expected text. The checker is not on this page yet.</p>
    </section>
    <section id="list" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">List</h2>
      <p class="text-muted-foreground leading-7">Placeholder. No tasks are published here yet.</p>
    </section>
  </DocPage>
</template>
