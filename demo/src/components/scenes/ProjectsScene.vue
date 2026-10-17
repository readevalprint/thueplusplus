<script setup lang="ts">
import { useRouter } from 'vue-router'
import SceneFrame from '@/components/SceneFrame.vue'
import { projects } from '@/projects'
import { onControlKey } from '@/rex/useRex'

const router = useRouter()

function open(path: string): void {
  void router.push(path)
}

function crateX(index: number): number {
  return 24 + (index % 5) * 78
}

function crateY(index: number): number {
  return index < 5 ? 36 : 132
}
</script>

<template>
  <SceneFrame scene="projects" label="Rex opens a crate for each sandboxed project" mode="read" :x="520" :y="248" :scale="0.85">
    <g v-for="(project, index) in projects" :key="project.id">
      <rect :x="crateX(index)" :y="crateY(index)" width="70" height="58" rx="3" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
      <text :x="crateX(index) + 35" :y="crateY(index) + 34" text-anchor="middle" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="9">{{ project.name }}</text>
    </g>
    <template #controls>
      <button
        v-for="(project, index) in projects"
        :key="project.id"
        type="button"
        class="rex-hit"
        :style="{ left: `${(crateX(index) / 640) * 100}%`, top: `${(crateY(index) / 280) * 100}%`, width: '70px', height: '58px' }"
        :aria-label="project.name"
        :data-test="`crate-${project.id}`"
        @click="open(`/projects#${project.id}`)"
        @keydown="onControlKey($event, () => open(`/projects#${project.id}`))"
      />
    </template>
  </SceneFrame>
</template>
