<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import SiteHeader from '@/components/SiteHeader.vue'
import PlaygroundScene from '@/components/scenes/PlaygroundScene.vue'
import PlaygroundSurface from '@/PlaygroundSurface.vue'
import { pages } from '@/site'

const page = pages.playground
const route = useRoute()
const mood = ref<'idle' | 'pass' | 'fail' | 'timeout'>('idle')
const problem = computed(() => typeof route.query.problem === 'string' ? route.query.problem : undefined)
const solution = computed(() => typeof route.query.solution === 'string' ? route.query.solution : undefined)

function onOutcome(next: 'idle' | 'pass' | 'fail' | 'timeout'): void {
  mood.value = next
}
</script>

<template>
  <div class="bg-void text-bone min-h-svh">
    <SiteHeader />
    <div class="page-screen page-screen-bare">
      <header data-test="page-hero" class="page-hero px-4 sm:px-6">
        <p class="text-dim font-mono text-[11px] tracking-[0.08em] uppercase">{{ page.kicker }}</p>
        <h1 class="font-display mt-2 max-w-[16ch] text-[clamp(32px,5vw,52px)] leading-[1.02] font-extrabold tracking-[-0.045em]">{{ page.title }}</h1>
        <p data-test="page-summary" class="text-ash mt-2 max-w-[48ch] text-[15px] leading-snug">{{ page.description }}</p>
        <div data-test="page-hero-graphic" class="mt-2 min-h-0 flex-1">
          <PlaygroundScene :mood="mood" />
        </div>
      </header>
      <div class="page-screen-gap" aria-hidden="true" />
    </div>
    <div data-test="page-details" class="page-details px-4 pb-8 sm:px-6">
      <PlaygroundSurface chrome="panel" :problem="problem" :solution="solution" @outcome="onOutcome" />
    </div>
  </div>
</template>
