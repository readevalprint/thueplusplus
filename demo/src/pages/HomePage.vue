<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import RewriteMotif from '@/components/RewriteMotif.vue'
import { mirrorUrl, repositoryUrl, siteHosts, soonLanguages } from '@/hosts'

const ready = siteHosts
const soon = soonLanguages

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
    <section data-test="page-hero" class="grid items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[minmax(0,680px)_minmax(0,1fr)] lg:px-14 lg:py-24">
      <div>
        <h1 class="font-display text-[15px] font-semibold tracking-[-0.03em]">Thue++</h1>
        <p class="font-display mt-4 text-[clamp(40px,6vw,72px)] leading-[1.02] font-extrabold tracking-[-0.05em]">The safest, smallest, sandbox.</p>
        <p data-test="landing-languages" class="text-ash mt-6 max-w-[640px] font-sans text-[18px] leading-[1.5]">
          Available in
          <template v-for="(language, index) in ready" :key="language.id">
            <RouterLink :to="language.href" class="text-bone hover:text-signal transition-colors duration-150">{{ language.landing }}</RouterLink><span v-if="index < ready.length - 1">, </span>
          </template>, and soon {{ soon.join(', ') }}
        </p>
        <div class="mt-8 flex flex-wrap gap-2">
          <Button as-child size="lg">
            <RouterLink to="/playground">playground</RouterLink>
          </Button>
          <Button as-child size="lg" variant="outline">
            <RouterLink to="/docs/guides">guides</RouterLink>
          </Button>
        </div>
      </div>
      <div data-test="page-hero-graphic" class="mx-auto w-full max-w-[520px]">
        <RewriteMotif />
      </div>
    </section>

    <section data-test="page-details" class="border-line grid max-w-none border-t md:grid-cols-3">
      <article v-for="(pillar, index) in pillars" :id="pillar.title" :key="pillar.title" class="border-line px-4 py-8 sm:px-6 lg:px-8" :class="index < pillars.length - 1 ? 'md:border-r' : undefined">
        <h2 class="font-display text-[18px] font-semibold tracking-[-0.03em]">{{ pillar.title }}</h2>
        <p class="text-ash mt-3 text-[15px] leading-[1.55]">{{ pillar.body }}</p>
      </article>
    </section>

    <footer class="border-line flex flex-wrap items-center gap-x-5 gap-y-2 border-t px-4 py-6 font-mono text-[13px] sm:px-6 lg:px-14">
      <nav class="flex flex-wrap gap-x-4 gap-y-2" aria-label="Site">
        <RouterLink to="/docs/guides" class="text-ash hover:text-bone lowercase">Guides</RouterLink>
        <RouterLink to="/docs/language" class="text-ash hover:text-bone lowercase">Language</RouterLink>
        <RouterLink to="/install" class="text-ash hover:text-bone lowercase">Install</RouterLink>
        <RouterLink to="/projects" class="text-ash hover:text-bone lowercase">Projects</RouterLink>
        <RouterLink to="/metrics" class="text-ash hover:text-bone lowercase">Metrics</RouterLink>
        <RouterLink to="/problems" class="text-ash hover:text-bone lowercase">Problems</RouterLink>
        <RouterLink to="/playground" class="text-ash hover:text-bone lowercase">Playground</RouterLink>
        <RouterLink to="/contribute" class="text-ash hover:text-bone lowercase">Contribute</RouterLink>
        <RouterLink to="/autoresearch" class="text-ash hover:text-bone lowercase">Autoresearch prompt</RouterLink>
      </nav>
      <a class="text-ash hover:text-bone lowercase" :href="repositoryUrl" rel="noreferrer">github</a>
      <a class="text-ash hover:text-bone lowercase" :href="mirrorUrl" rel="noreferrer">gitlab</a>
    </footer>
  </div>
</template>
