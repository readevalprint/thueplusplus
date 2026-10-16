<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import { pageLinks, type PageLink } from '@/site'

const route = useRoute()
const links = computed(() => pageLinks(route.path))

function internal(link: PageLink): boolean {
  return link.href.startsWith('/')
}
</script>

<template>
  <nav class="px-4 py-4 font-mono text-[13px]" aria-label="On this page">
    <h2 class="text-dim mb-3 text-[11px] tracking-[0.08em] uppercase">On this page</h2>
    <ul class="flex flex-col">
      <li v-for="link in links" :key="link.href">
        <RouterLink v-if="internal(link)" :to="link.href" class="text-ash hover:text-bone block py-1.5 lowercase transition-colors duration-150">
          {{ link.title }}
        </RouterLink>
        <a v-else :href="link.href" class="text-ash hover:text-bone block py-1.5 lowercase transition-colors duration-150">
          {{ link.title }}
        </a>
      </li>
    </ul>
  </nav>
</template>
