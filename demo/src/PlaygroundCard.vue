<template>
  <section class="playground-card" :data-test="dataTest">
    <header class="playground-card-header">
      <span class="panel-label">{{ title }}</span>
      <slot name="aside" />
    </header>
    <div class="playground-card-content" :class="contentClass">
      <slot />
    </div>
  </section>
</template>

<script setup lang="ts">
defineProps<{
  title: string
  dataTest?: string
  contentClass?: string
}>()
</script>
