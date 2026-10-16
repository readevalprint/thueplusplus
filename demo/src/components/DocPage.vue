<script setup lang="ts">
import PageHero from './PageHero.vue'

defineProps<{
  kicker: string
  title: string
}>()
</script>

<template>
  <div>
    <PageHero :kicker="kicker" :title="title">
      <template v-if="$slots.actions" #actions>
        <slot name="actions" />
      </template>
      <template v-if="$slots.graphic" #graphic>
        <slot name="graphic" />
      </template>
    </PageHero>
    <div data-test="page-details" class="mx-auto flex w-full max-w-prose flex-col gap-10 px-6 pt-2 pb-16">
      <slot />
    </div>
  </div>
</template>
