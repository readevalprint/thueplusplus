<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { mirrorUrl, repositoryUrl } from '@/hosts'
import OnThisPage from './OnThisPage.vue'
import SiteHeader from './SiteHeader.vue'

const route = useRoute()
const home = computed(() => route.path === '/')
const contentsOpen = ref(false)

watch(() => route.path, () => {
  contentsOpen.value = false
})
</script>

<template>
  <div data-test="app-shell" class="bg-void text-bone min-h-svh">
    <SiteHeader />
    <div v-if="home">
      <RouterView />
    </div>
    <div v-else class="mx-auto flex w-full max-w-[calc(65ch+13.5rem)] flex-col items-center px-4 sm:px-6 lg:flex-row lg:items-start lg:justify-center lg:gap-10">
      <div class="w-full max-w-[65ch] pt-4 lg:hidden">
        <button
          type="button"
          class="border-line bg-surface text-ash flex h-11 w-full items-center justify-between border px-4 font-mono text-[13px]"
          data-test="contents-toggle"
          :aria-expanded="contentsOpen"
          aria-controls="on-this-page"
          @click="contentsOpen = !contentsOpen"
        >
          <span>Contents</span>
          <span aria-hidden="true">{{ contentsOpen ? '▴' : '▾' }}</span>
        </button>
      </div>
      <aside
        data-test="page-sidebar"
        class="w-full max-w-[65ch] lg:sticky lg:top-[68px] lg:max-h-[calc(100svh-84px)] lg:w-44 lg:max-w-none lg:shrink-0 lg:self-start lg:overflow-auto lg:pt-10"
        :class="contentsOpen ? 'block' : 'hidden lg:block'"
      >
        <OnThisPage />
      </aside>
      <div class="w-full min-w-0 max-w-[65ch]">
        <RouterView />
      </div>
    </div>
    <footer v-if="!home" data-test="site-footer" class="border-line mx-auto flex w-full max-w-[calc(65ch+13.5rem)] flex-wrap gap-x-4 gap-y-2 border-t px-4 py-6 font-mono text-[13px] sm:px-6">
      <a class="text-ash hover:text-bone lowercase" :href="repositoryUrl" rel="noreferrer">github</a>
      <a class="text-ash hover:text-bone lowercase" :href="mirrorUrl" rel="noreferrer">gitlab</a>
    </footer>
  </div>
</template>
