<script setup lang="ts">
import DocPage from '@/components/DocPage.vue'
import SearchScene from '@/components/scenes/SearchScene.vue'
</script>

<template>
  <DocPage kicker="Missing" title="This page is not here." summary="Rex is still looking.">
    <template #scene>
      <SearchScene />
    </template>
    <p data-test="not-found" class="leading-7">No page matches this address.</p>
  </DocPage>
</template>
