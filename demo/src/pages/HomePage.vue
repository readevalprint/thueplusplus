<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import SandboxScene from '@/components/SandboxScene.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { siteHosts, soonLanguages } from '@/hosts'
import { beginRubble, type Rubble } from '@/sandbox/rubble'

const ready = siteHosts
const soon = soonLanguages
const rubble = ref<Rubble | null>(null)

function onBreak(reduced: boolean): void {
  rubble.value?.restore(true)
  rubble.value = beginRubble(reduced)
}

function onRebuilt(): void {
  rubble.value?.restore(false)
}

onBeforeUnmount(() => {
  rubble.value?.restore(true)
  rubble.value = null
})

const pillars = [
  {
    title: 'smallest',
    body: 'A program is an ordered list of rules and one state string. The engine rewrites that string until it stops.',
  },
  {
    title: 'safest',
    body: 'A new interpreter starts with a step limit, a probe limit, and a state limit. A run cannot go on forever.',
  },
  {
    title: 'sandbox',
    body: 'Rules do not open files, sockets, or processes. A host binds the resources a program is allowed to touch.',
  },
]
</script>

<template>
  <div class="mx-auto w-full max-w-[1320px]">
    <div class="page-screen page-screen-bare">
      <section data-test="page-hero" class="page-hero px-4 sm:px-6 lg:px-14">
        <div class="grid min-h-0 flex-1 items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)]">
          <div class="min-w-0">
            <h1 data-shard class="font-display text-[15px] font-semibold tracking-[-0.03em]">Thue++</h1>
            <p data-shard class="font-display mt-3 text-[clamp(32px,5vw,64px)] leading-[1.02] font-extrabold tracking-[-0.05em]">The safest, smallest, sandbox.</p>
            <p data-shard data-test="page-summary" class="text-ash mt-3 max-w-[640px] font-sans text-[15px] leading-snug">A program is rules and one string. The host decides what it can touch.</p>
            <p data-shard data-test="landing-languages" class="text-ash mt-3 max-w-[640px] font-sans text-[15px] leading-snug">
              Available in
              <template v-for="(language, index) in ready" :key="language.id">
                <RouterLink :to="language.href" class="text-bone hover:text-signal transition-colors duration-150">{{ language.landing }}</RouterLink><span v-if="index < ready.length - 1">, </span>
              </template>, and soon {{ soon.join(', ') }}
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <Button as-child size="lg" data-shard>
                <RouterLink to="/playground">playground</RouterLink>
              </Button>
              <Button as-child size="lg" variant="outline" data-shard>
                <RouterLink to="/docs/guides">guides</RouterLink>
              </Button>
            </div>
          </div>
          <div data-test="page-hero-graphic" class="mx-auto h-full min-h-0 w-full max-w-[640px]">
            <SandboxScene @break="onBreak" @rebuilt="onRebuilt" />
          </div>
        </div>
      </section>
      <div class="page-screen-gap" aria-hidden="true" />
    </div>

    <section data-test="page-details" class="page-details border-line grid max-w-none border-t md:grid-cols-3">
      <article v-for="(pillar, index) in pillars" :id="pillar.title" :key="pillar.title" data-shard class="border-line px-4 py-8 sm:px-6 lg:px-8" :class="index < pillars.length - 1 ? 'md:border-r' : undefined">
        <h2 class="font-display text-[18px] font-semibold tracking-[-0.03em]">{{ pillar.title }}</h2>
        <p class="text-ash mt-3 text-[15px] leading-[1.55]">{{ pillar.body }}</p>
      </article>
    </section>

    <SiteFooter data-shard class="px-4 sm:px-6 lg:px-14" />
  </div>
</template>
