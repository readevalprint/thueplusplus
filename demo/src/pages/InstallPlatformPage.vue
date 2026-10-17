<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import DocPage from '@/components/DocPage.vue'
import InstallScene from '@/components/scenes/InstallScene.vue'
import { installPage } from '@/install'
import { pageByPath } from '@/site'

const route = useRoute()
const page = computed(() => {
  const record = pageByPath(route.path)
  if (!record) throw new Error(`pages.json has no install page for ${route.path}`)
  return record
})
const section = computed(() => installPage(route.path))
</script>

<template>
  <DocPage :kicker="page.kicker" :title="page.title" :summary="page.description">
    <template #scene>
      <InstallScene :host-id="section.id" />
    </template>
    <p class="leading-7">{{ section.prose }}</p>
    <section id="install" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Install</h2>
      <p class="leading-7">{{ section.installLead }}</p>
      <pre class="bg-surface border-line overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ section.install }}</pre>
      <p v-if="section.installAfter" class="leading-7">{{ section.installAfter }}</p>
      <pre v-if="section.installAfterBody" class="bg-surface border-line overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ section.installAfterBody }}</pre>
      <template v-for="block in section.moreInstall" :key="block.lead">
        <p class="leading-7">{{ block.lead }}</p>
        <pre class="bg-surface border-line overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ block.body }}</pre>
      </template>
    </section>
    <section id="library" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">Library</h2>
      <p class="leading-7">{{ section.libraryLead }}</p>
      <pre class="bg-surface border-line overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ section.library }}</pre>
    </section>
    <section id="cli" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">CLI</h2>
      <p class="leading-7">{{ section.cliLead }}</p>
      <pre class="bg-surface border-line overflow-x-auto border p-4 font-mono text-[13px] leading-[1.7]">{{ section.cli }}</pre>
    </section>
    <section id="api" class="flex flex-col gap-3">
      <h2 class="text-xl font-semibold tracking-tight">API</h2>
      <p v-for="link in section.api" :key="link.href" class="leading-7">
        <a class="underline underline-offset-4" :href="link.href" rel="noreferrer">{{ link.label }}</a>
      </p>
    </section>
  </DocPage>
</template>
