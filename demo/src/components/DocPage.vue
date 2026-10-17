<script setup lang="ts">
defineProps<{
  kicker: string
  title: string
  summary: string
  wide?: boolean
}>()
</script>

<template>
  <article class="doc-page">
    <div class="page-screen">
      <header data-test="page-hero" class="page-hero">
        <p class="text-dim font-mono text-[11px] tracking-[0.08em] uppercase">{{ kicker }}</p>
        <h1 class="font-display mt-2 max-w-[18ch] text-[clamp(32px,5vw,52px)] leading-[1.02] font-extrabold tracking-[-0.045em]">{{ title }}</h1>
        <p data-test="page-summary" class="text-ash mt-2 max-w-[48ch] text-[15px] leading-snug">{{ summary }}</p>
        <div v-if="$slots.meta" class="mt-3 flex flex-wrap items-center gap-2">
          <slot name="meta" />
        </div>
        <div data-test="page-hero-graphic" class="mt-2 min-h-0 flex-1">
          <slot name="scene" />
        </div>
      </header>
      <div class="page-screen-gap" aria-hidden="true" />
    </div>
    <div data-test="page-details" class="page-details flex w-full flex-col gap-10 pb-16" :class="wide ? 'max-w-none' : 'max-w-[65ch]'">
      <slot />
    </div>
  </article>
</template>
