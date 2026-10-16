<script setup lang="ts">
import PageHero from './PageHero.vue'

defineProps<{
  kicker: string
  title: string
  wide?: boolean
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
    <div data-test="page-details" class="flex w-full flex-col gap-10 px-6 pt-2 pb-16" :class="wide ? undefined : 'mx-auto max-w-prose'">
      <slot />
    </div>
  </div>
</template>
