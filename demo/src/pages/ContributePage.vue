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
      <p class="leading-7"><code>make test</code> runs the host suite. <code>make problems</code> and <code>make langs</code> run on native Go. <code>make metrics</code> records host benchmarks and refuses a host that reports no resident memory. Every run sets step, probe, and state limits, <code>timeout(1)</code>, and a 256 MiB cap.</p>
    </section>
    <section id="pareto" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Pareto</h2>
      <p class="leading-7">A new solution or language version must pass, and it must not be dominated on regex evals, regex matches, cumulative state size, rule count, and rule chars. The check names the dominator. Open a pull request only when the file is on that front, and commit <code>metrics/latest.json</code> with the change.</p>
    </section>
  </DocPage>
</template>
