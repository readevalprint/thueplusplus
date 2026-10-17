<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { mirrorUrl, repositoryUrl } from '@/hosts'
import { footerLinks } from '@/nav'

defineProps<{
  class?: string
}>()
</script>

<template>
  <footer data-test="site-footer" class="border-line flex flex-wrap items-center gap-x-4 gap-y-2 border-t py-6 font-mono text-[13px]" :class="$props.class">
    <nav class="flex flex-wrap gap-x-4 gap-y-2" aria-label="More">
      <RouterLink v-for="link in footerLinks" :key="link.to" :to="link.to" class="text-ash hover:text-bone lowercase">{{ link.title }}</RouterLink>
    </nav>
    <a class="text-ash hover:text-bone lowercase" data-test="github-link" :href="repositoryUrl" rel="noreferrer">github</a>
    <a class="text-ash hover:text-bone lowercase" data-test="gitlab-link" :href="mirrorUrl" rel="noreferrer">gitlab</a>
  </footer>
</template>
