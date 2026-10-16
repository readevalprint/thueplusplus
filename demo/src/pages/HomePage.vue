<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import DocPage from '@/components/DocPage.vue'
import RewriteArrow from '@/components/marks/RewriteArrow.vue'
import { pages } from '@/site'

const page = pages.home
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title">
    <template #mark>
      <RewriteArrow />
    </template>
    <template #actions>
      <Button as-child>
        <RouterLink to="/playground">Playground</RouterLink>
      </Button>
      <Button as-child variant="outline">
        <RouterLink to="/learn">Learn</RouterLink>
      </Button>
      <Button as="a" variant="outline" href="https://gitlab.com/thuelang/thueplusplus" rel="noreferrer">GitLab</Button>
    </template>
    <section id="placeholder" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Placeholder</h2>
      <p class="text-muted-foreground leading-7">This landing page will be designed on its own later. The line above is the whole introduction for now.</p>
    </section>
    <section id="start" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Start</h2>
      <p class="leading-7">Read <RouterLink to="/learn" class="underline underline-offset-4">Learn</RouterLink> for what a program is, <RouterLink to="/reference" class="underline underline-offset-4">Reference</RouterLink> for the operators, or open the <RouterLink to="/playground" class="underline underline-offset-4">Playground</RouterLink> and run one.</p>
    </section>
  </DocPage>
</template>
