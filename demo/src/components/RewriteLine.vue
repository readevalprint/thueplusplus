<script setup lang="ts">
defineProps<{
  before: string
  after: string
}>()
</script>

<template>
  <div class="text-muted-foreground flex max-w-full flex-wrap items-center gap-3 font-mono text-sm">
    <span class="bg-muted text-foreground rounded-md px-3 py-2">{{ before }}</span>
    <span class="motion-safe:animate-pulse">::=</span>
    <span class="bg-muted text-foreground max-w-full rounded-md px-3 py-2 break-words motion-safe:animate-pulse">{{ after }}</span>
  </div>
</template>
