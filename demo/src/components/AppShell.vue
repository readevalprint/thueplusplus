<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import OnThisPage from './OnThisPage.vue'
import SiteFooter from './SiteFooter.vue'
import SiteHeader from './SiteHeader.vue'

const route = useRoute()
const home = computed(() => route.path === '/')
const wide = computed(() => route.path === '/problems' || route.path === '/metrics' || route.path.startsWith('/problems/') || route.path.startsWith('/rulesets/'))
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
    <div v-else class="mx-auto flex w-full flex-col items-center px-4 sm:px-6 lg:flex-row lg:items-start lg:justify-center lg:gap-10" :class="wide ? 'max-w-[1180px]' : 'max-w-[calc(65ch+13.5rem)]'">
      <div class="w-full pt-4 lg:hidden" :class="wide ? 'max-w-none' : 'max-w-[65ch]'">
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
        class="w-full lg:sticky lg:top-[68px] lg:max-h-[calc(100svh-84px)] lg:w-44 lg:shrink-0 lg:self-start lg:overflow-auto lg:pt-10"
        :class="[contentsOpen ? 'block' : 'hidden lg:block', wide ? 'max-w-none' : 'max-w-[65ch] lg:max-w-none']"
      >
        <OnThisPage />
      </aside>
      <div class="w-full min-w-0" :class="wide ? 'max-w-none' : 'max-w-[65ch]'">
        <RouterView />
      </div>
    </div>
    <SiteFooter v-if="!home" class="mx-auto w-full px-4 sm:px-6" :class="wide ? 'max-w-[1180px]' : 'max-w-[calc(65ch+13.5rem)]'" />
  </div>
</template>
