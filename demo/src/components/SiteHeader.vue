<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { RouterLink, isNavigationFailure, useRoute, useRouter } from 'vue-router'
import { headerLinkCurrent, headerLinks } from '@/nav'
import { createNavProgress, type NavProgressSnapshot } from '@/navProgress'
import Mark from './Mark.vue'
import ThemeToggle from './ThemeToggle.vue'

const route = useRoute()
const router = useRouter()
const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const bar = createNavProgress(reduced)
const progress = ref<NavProgressSnapshot>(bar.snapshot())
let generation = 0
let frame = 0
let active = false

function stop(): void {
  cancelAnimationFrame(frame)
}

function pump(now: number): void {
  progress.value = bar.tick(now)
  if (progress.value.state !== 'idle') frame = requestAnimationFrame(pump)
}

function begin(): void {
  generation += 1
  active = true
  stop()
  progress.value = bar.start(performance.now())
  if (!reduced()) frame = requestAnimationFrame(pump)
}

function complete(): void {
  if (!active) return
  active = false
  const current = generation
  if (reduced()) {
    progress.value = bar.finish(performance.now())
    return
  }
  requestAnimationFrame(() => {
    if (current !== generation) return
    requestAnimationFrame(() => {
      if (current !== generation) return
      progress.value = bar.finish(performance.now())
      frame = requestAnimationFrame(pump)
    })
  })
}

function reset(): void {
  if (!active) return
  generation += 1
  active = false
  stop()
  progress.value = bar.fail()
}

const removeBefore = router.beforeEach((to, from) => {
  if (to.fullPath === from.fullPath) return
  begin()
})
const removeAfter = router.afterEach((_to, _from, failure) => {
  if (isNavigationFailure(failure)) {
    reset()
    return
  }
  complete()
})
const removeError = router.onError(() => {
  reset()
})

onBeforeUnmount(() => {
  removeBefore()
  removeAfter()
  removeError()
  stop()
})
</script>

<template>
  <header data-test="site-header" class="bg-void border-line sticky top-0 z-30 flex h-[52px] items-center gap-2 border-b px-3 font-mono text-[13px] sm:gap-3 sm:px-6">
    <RouterLink to="/" class="flex shrink-0 items-center gap-2 text-bone" :aria-current="route.path === '/' ? 'page' : undefined">
      <Mark />
      <span class="font-display font-semibold tracking-[-0.03em] max-[640px]:sr-only">Thue++</span>
    </RouterLink>
    <nav class="ml-1 flex min-w-0 items-center gap-x-2 sm:gap-x-3" data-test="site-nav" aria-label="Site">
      <RouterLink
        v-for="link in headerLinks"
        :key="link.to"
        :to="link.to"
        class="shrink-0 lowercase transition-colors duration-150"
        :class="headerLinkCurrent(route.path, link.to) ? 'text-bone' : 'text-ash hover:text-bone'"
        :aria-current="headerLinkCurrent(route.path, link.to) ? 'page' : undefined"
      >
        {{ link.title }}
      </RouterLink>
    </nav>
    <div class="flex-1" />
    <ThemeToggle />
    <div
      data-test="nav-progress"
      class="bg-primary pointer-events-none absolute inset-x-0 -bottom-px h-[2px] origin-left"
      role="progressbar"
      aria-label="Loading page"
      aria-valuemin="0"
      aria-valuemax="100"
      :aria-valuenow="Math.round(progress.scale * 100)"
      :aria-hidden="progress.state === 'idle' ? 'true' : undefined"
      :data-state="progress.state"
      :style="{
        transform: `scaleX(${progress.scale})`,
        opacity: progress.state === 'run' || progress.state === 'done' ? 1 : 0,
        transition: reduced() || progress.state === 'run' || progress.state === 'idle' ? 'none' : progress.state === 'done' ? 'transform 450ms linear' : 'opacity 200ms linear',
      }"
    />
  </header>
</template>
