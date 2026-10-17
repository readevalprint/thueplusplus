<script setup lang="ts">
import { Package } from '@lucide/vue'
import { RouterLink } from 'vue-router'
import DocPage from '@/components/DocPage.vue'
import { shippedHosts, siteHosts, soonLanguages } from '@/hosts'
import { navGroups } from '@/nav'
import { pages } from '@/site'

const page = pages.install
const notes = new Map(navGroups.find(group => group.title === 'Install')?.items.map(item => [item.to, item.description]) ?? [])
for (const host of siteHosts) {
  if (!notes.get(host.href)) throw new Error(`install page has no note for ${host.href}`)
}
const quickStart = `uv run thue program.thue`
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title">
    <template #mark>
      <Package />
    </template>
    <section id="quick-start" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Quick start</h2>
      <p class="leading-7">A host runs the Thue++ engine. The engine runs a program, any <code>.thue</code> file. The program handles input and output.</p>
      <p class="leading-7">Nothing is published to a registry yet. From a checkout of this repository, the Python host runs a program with:</p>
      <pre class="bg-surface border-line overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ quickStart }}</pre>
      <p class="leading-7">{{ shippedHosts }} run that same program. Each platform page covers the install, a short library example, the command, and the API.</p>
    </section>
    <section id="supported" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Supported</h2>
      <ul class="flex flex-col gap-4">
        <li v-for="host in siteHosts" :key="host.id">
          <RouterLink :to="host.href" class="underline underline-offset-4">{{ host.title }}</RouterLink>
          <p class="text-ash leading-7">{{ notes.get(host.href) }}</p>
        </li>
      </ul>
    </section>
    <section id="coming-soon" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Coming soon</h2>
      <p class="leading-7">{{ soonLanguages.join(', ') }}</p>
    </section>
  </DocPage>
</template>
