<script setup lang="ts">
import type { PoseMode } from '@/rex/motion'
import PillarRex from './PillarRex.vue'

defineProps<{
  id: string
  title: string
  mode: PoseMode
  label: string
  settled: 'yes' | 'no'
  ok: 'yes' | 'no' | 'pending'
  limit?: string
}>()
</script>

<template>
  <article
    :id="id"
    data-shard
    :data-pillar="id"
    :data-test="`pillar-${id}`"
    :data-settled="settled"
    :data-ok="ok"
    :data-limit="limit"
    class="border-line flex min-w-0 flex-col gap-4 px-4 py-6 sm:px-6 lg:border-r lg:px-8 lg:last:border-r-0 max-lg:border-b max-lg:last:border-b-0"
  >
    <div class="flex items-start justify-between gap-3">
      <h2 class="font-display text-[18px] font-semibold tracking-[-0.03em]">{{ title }}</h2>
      <PillarRex :mode="mode" :label="label" />
    </div>
    <slot />
  </article>
</template>
