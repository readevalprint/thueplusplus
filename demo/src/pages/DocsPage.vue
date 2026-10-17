<script setup lang="ts">
import { RouterLink } from 'vue-router'
import DocPage from '@/components/DocPage.vue'
import RewriteArrow from '@/components/marks/RewriteArrow.vue'
import { pages } from '@/site'

const page = pages.docs
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title">
    <template #mark>
      <RewriteArrow />
    </template>
    <section id="language" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Language</h2>
      <p class="leading-7">Operators, resources, and the limits a new interpreter starts with. Programs are <code>.thue</code> files.</p>
      <RouterLink to="/docs/language" class="underline underline-offset-4">Language reference</RouterLink>
    </section>
    <section id="guides" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Guides</h2>
      <p class="leading-7">A short tour of a Thue++ program and a run in the browser.</p>
      <RouterLink to="/docs/guides" class="underline underline-offset-4">Guides</RouterLink>
    </section>
  </DocPage>
</template>
