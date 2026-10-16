<script setup lang="ts">
import RewriteMark from './RewriteMark.vue'

defineProps<{
  kicker: string
  title: string
}>()
</script>

<template>
  <section data-test="page-hero" class="flex h-[75cqh] flex-col justify-center px-6">
    <div class="mx-auto flex w-full max-w-prose flex-col gap-8">
      <div>
        <div v-if="$slots.mark" class="text-foreground mb-4 [&_svg]:size-8">
          <slot name="mark" />
        </div>
        <p class="text-muted-foreground text-sm font-medium">{{ kicker }}</p>
        <h1 class="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{{ title }}</h1>
        <div v-if="$slots.actions" class="mt-6 flex flex-wrap gap-2">
          <slot name="actions" />
        </div>
      </div>
      <div data-test="page-hero-graphic" aria-hidden="true">
        <slot name="graphic">
          <RewriteMark />
        </slot>
      </div>
    </div>
  </section>
</template>
