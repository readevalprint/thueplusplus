<script setup lang="ts">
defineProps<{
  kicker: string
  title: string
  wide?: boolean
  fold?: boolean
}>()
</script>

<template>
  <article class="doc-page py-8 lg:py-10">
    <header data-test="page-hero" :class="fold ? 'flex min-h-[calc(100svh-8rem)] flex-col justify-center' : undefined">
      <div class="flex items-center gap-3">
        <span v-if="$slots.mark" class="text-signal inline-flex size-5 items-center justify-center">
          <slot name="mark" />
        </span>
        <p class="text-dim font-mono text-[11px] tracking-[0.08em] uppercase">{{ kicker }}</p>
      </div>
      <h1 class="font-display mt-3 max-w-[18ch] text-[clamp(40px,5vw,52px)] leading-[1.05] font-extrabold tracking-[-0.05em]">{{ title }}</h1>
      <div v-if="$slots.graphic" data-test="page-hero-graphic" class="mt-6" aria-hidden="true">
        <slot name="graphic" />
      </div>
      <div v-if="$slots.actions" class="mt-6 flex flex-wrap gap-2">
        <slot name="actions" />
      </div>
    </header>
    <div data-test="page-details" class="mt-10 flex w-full flex-col gap-10 pb-16" :class="wide ? 'max-w-none' : 'max-w-[65ch]'">
      <slot />
    </div>
  </article>
</template>
