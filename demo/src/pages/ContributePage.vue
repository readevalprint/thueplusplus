<script setup lang="ts">
import { repositoryBlob, repositoryUrl } from '@/hosts'
import DocPage from '@/components/DocPage.vue'
import FinishLine from '@/components/marks/FinishLine.vue'
import { pages } from '@/site'

const page = pages.contribute
const contributing = repositoryBlob('CONTRIBUTING.md')
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title">
    <template #mark>
      <FinishLine />
    </template>
    <section id="clone" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Clone</h2>
      <p class="leading-7">The repository is <a class="underline underline-offset-4" :href="repositoryUrl" rel="noreferrer">github.com/thuelang/thueplusplus</a>. GitLab mirrors that repository. Problems live in <code>problems/</code>. Languages live in <code>langs/</code>. <a class="underline underline-offset-4" :href="contributing" rel="noreferrer">CONTRIBUTING.md</a> is the short contract.</p>
    </section>
    <section id="commands" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Commands</h2>
      <p class="leading-7"><code>make test</code> runs the host suite. <code>make problems</code> and <code>make langs</code> run on native Go. <code>make metrics</code> records every solution run. Limits come from <code>metrics/limits.toml</code>.</p>
    </section>
    <section id="cost" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Cost</h2>
      <p class="leading-7">A changed solution must pass, and its Go cost must be strictly lower than the committed <code>metric.json</code>. Cost is UTF-8 bytes: each regex eval adds the state length plus the pattern, and each applied step adds the replacement. A direct solution is <code>solution.thue</code>. Commit <code>metrics/latest.json</code> with the change.</p>
    </section>
  </DocPage>
</template>
