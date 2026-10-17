<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Boxes } from '@lucide/vue'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import DocPage from '@/components/DocPage.vue'
import { projects } from '@/projects'
import { pages } from '@/site'

const page = pages.projects

function playgroundPath(program: string): string {
  return `/playground?file=./${program}`
}
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title">
    <template #mark>
      <Boxes />
    </template>
    <p class="leading-7">A host runs the Thue++ engine. The engine runs a program, any <code>.thue</code> file, and the program handles input and output. Some programs are interpreters that run scripts. Others are apps written directly in Thue++.</p>
    <div data-test="project-cards" class="flex flex-col gap-4">
      <RouterLink
        v-for="project in projects"
        :id="project.id"
        :key="project.id"
        :to="playgroundPath(project.program)"
        data-test="project-card"
        :data-project="project.id"
        class="block no-underline"
      >
        <Card class="hover:border-bone gap-0 py-8 transition-colors duration-150">
          <CardHeader class="gap-3">
            <CardTitle class="font-display text-[28px] tracking-[-0.03em]">{{ project.name }}</CardTitle>
            <CardDescription class="text-ash text-base leading-7">{{ project.description }}</CardDescription>
          </CardHeader>
        </Card>
      </RouterLink>
    </div>
  </DocPage>
</template>
