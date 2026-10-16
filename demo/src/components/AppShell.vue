<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import DocsContents from './DocsContents.vue'
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
    <div v-else class="mx-auto w-full max-w-[1320px] lg:grid lg:grid-cols-[260px_minmax(0,1fr)_220px]">
      <aside data-test="site-nav" class="border-line lg:border-r max-lg:px-4 max-lg:pt-4">
        <div class="border-line bg-surface max-lg:border lg:bg-transparent">
          <button
            type="button"
            class="text-ash flex h-11 w-full items-center justify-between px-4 font-mono text-[13px] lowercase lg:hidden"
            data-test="contents-toggle"
            :aria-expanded="contentsOpen"
            @click="contentsOpen = !contentsOpen"
          >
            <span>contents</span>
            <span aria-hidden="true">{{ contentsOpen ? '▴' : '▾' }}</span>
          </button>
          <div :class="contentsOpen ? 'border-line block border-t lg:border-0' : 'hidden lg:block'">
            <DocsContents />
          </div>
        </div>
      </aside>
      <div class="min-w-0">
        <RouterView />
      </div>
      <aside data-test="page-sidebar" class="border-line hidden lg:block lg:border-l">
        <OnThisPage />
      </aside>
    </div>
  </div>
</template>
