<script setup lang="ts">
defineProps<{
  before: string
  after: string
}>()
</script>

<template>
  <div class="text-ash flex max-w-full flex-wrap items-center gap-3 font-mono text-[13px]">
    <span class="border-line bg-surface text-bone border px-3 py-2">{{ before }}</span>
    <span class="text-signal">::=</span>
    <span class="border-line bg-surface text-bone max-w-full border px-3 py-2 break-words">{{ after }}</span>
  </div>
</template>
