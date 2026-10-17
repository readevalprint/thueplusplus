<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { repositoryBlob, repositoryUrl } from '@/hosts'
import DocPage from '@/components/DocPage.vue'
import ContributeScene from '@/components/scenes/ContributeScene.vue'
import { pages } from '@/site'

const page = pages.contribute
const contributing = repositoryBlob('CONTRIBUTING.md')
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title" :summary="page.description">
    <template #scene>
      <ContributeScene />
    </template>
    <section id="clone" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Clone</h2>
      <p class="leading-7">The repository is <a class="underline underline-offset-4" :href="repositoryUrl" rel="noreferrer">github.com/thuelang/thueplusplus</a>. GitLab mirrors that repository. Problems live in <code>problems/</code>. Languages live in <code>langs/</code>. <a class="underline underline-offset-4" :href="contributing" rel="noreferrer">CONTRIBUTING.md</a> is the short contract.</p>
    </section>
    <section id="commands" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Commands</h2>
      <p class="leading-7"><code>make test</code> runs the host suite. <code>make problems</code> and <code>make langs</code> run on native Go. <code>make metrics</code> is a local preview and does not get committed. Limits come from <code>metrics/limits.toml</code>.</p>
    </section>
    <section id="cost" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Cost</h2>
      <p class="leading-7">A changed solution must pass. A strictly lower Go cost is the goal. Cost is UTF-8 bytes: each regex eval adds the state length plus the pattern, and each applied step adds the replacement. A higher cost warns on the pull request and does not block it. A direct solution is <code>solution.thue</code>. CI commits <code>metric.json</code> on main when the result changes. The <RouterLink to="/autoresearch" class="underline underline-offset-4">autoresearch prompt</RouterLink> is the copy an agent runs.</p>
    </section>
  </DocPage>
</template>
