<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import DocPage from '@/components/DocPage.vue'
import ProjectsScene from '@/components/scenes/ProjectsScene.vue'
import { repositoryTree } from '@/hosts'
import { projects } from '@/projects'
import { pages } from '@/site'

const page = pages.projects

function playgroundPath(program: string): string {
  return `/playground?file=./${program}`
}

function improveHref(program: string): string {
  const slash = program.lastIndexOf('/')
  if (slash <= 0) throw new Error(`program has no directory: ${program}`)
  return repositoryTree(program.slice(0, slash))
}
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title" :summary="page.description">
    <template #scene>
      <ProjectsScene />
    </template>
    <p class="leading-7">A host runs the Thue++ engine. The engine runs a program, any <code>.thue</code> file, and the program handles input and output. Some programs are interpreters that run scripts. Others are apps written directly in Thue++.</p>
    <div data-test="project-cards" class="flex flex-col gap-4">
      <Card
        v-for="project in projects"
        :id="project.id"
        :key="project.id"
        data-test="project-card"
        :data-project="project.id"
        class="hover:border-bone gap-0 py-8 transition-colors duration-150"
      >
        <CardHeader class="gap-3">
          <CardTitle class="font-display text-[28px] tracking-[-0.03em]">
            <RouterLink :to="playgroundPath(project.program)" class="hover:text-signal">{{ project.name }}</RouterLink>
          </CardTitle>
          <CardDescription class="text-ash text-base leading-7">{{ project.description }}</CardDescription>
          <a class="text-ash hover:text-bone w-fit font-mono text-[13px] lowercase underline underline-offset-4" data-test="improve-link" :href="improveHref(project.program)" rel="noreferrer">Improve this</a>
        </CardHeader>
      </Card>
    </div>
  </DocPage>
</template>
