<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Button } from '@/components/ui/button'
import HostsPillar from '@/components/landing/HostsPillar.vue'
import PortablePillar from '@/components/landing/PortablePillar.vue'
import SandboxPillar from '@/components/landing/SandboxPillar.vue'
import SandboxScene from '@/components/SandboxScene.vue'
import SiteFooter from '@/components/SiteFooter.vue'
import { registryHosts, soonLanguages } from '@/hosts'
import { beginRubble, type Rubble } from '@/sandbox/rubble'

const ready = registryHosts
const soon = soonLanguages
const rubble = ref<Rubble | null>(null)
const offer = ref(true)
const sandbox = ref<{ act: () => void } | null>(null)

function onOffer(value: boolean): void {
  offer.value = value
}

function onBreak(reduced: boolean): void {
  rubble.value?.restore(true)
  rubble.value = beginRubble(reduced)
}

function onRebuilt(): void {
  rubble.value?.restore(false)
}

onBeforeUnmount(() => {
  rubble.value?.restore(true)
  rubble.value = null
})
</script>

<template>
  <div class="overflow-x-clip">
  <div class="mx-auto w-full max-w-[1320px]">
    <div class="page-screen page-screen-bare">
      <section data-test="page-hero" class="page-hero px-4 sm:px-6 lg:px-14">
        <div class="rex-bleed" data-test="belt-bleed">
          <SandboxScene ref="sandbox" @break="onBreak" @rebuilt="onRebuilt" @offer="onOffer" />
        </div>
        <div class="pointer-events-none relative z-10 grid min-h-0 flex-1 items-start gap-4 pb-2 lg:grid-cols-[minmax(0,1fr)_minmax(280px,1fr)] lg:items-end lg:pb-16">
          <div class="hidden lg:block" aria-hidden="true" />
          <div class="hero-copy pointer-events-auto min-w-0 lg:justify-self-end">
            <div class="hero-veil" data-test="hero-veil" aria-hidden="true" />
            <h1 data-shard class="font-display text-[15px] font-semibold tracking-[-0.03em]">Thue++</h1>
            <p data-shard class="font-display mt-3 text-[clamp(32px,5vw,64px)] leading-[1.02] font-extrabold tracking-[-0.05em]">The safest, smallest, sandbox.</p>
            <p data-shard data-test="page-summary" class="text-ash mt-3 max-w-[640px] font-sans text-[15px] leading-snug">A program is rules and one string. The host decides what it can touch.</p>
            <p data-shard data-test="landing-languages" class="text-ash mt-3 max-w-[640px] font-sans text-[15px] leading-snug">
              Available in
              <template v-for="(language, index) in ready" :key="language.id">
                <span v-if="index > 0">, </span><RouterLink :to="language.href" class="text-bone hover:text-signal transition-colors duration-150">{{ language.landing }}</RouterLink>
              </template><template v-if="soon.length">, and soon {{ soon.join(', ') }}</template>
            </p>
            <div class="mt-4 flex flex-wrap gap-2">
              <Button
                v-if="offer"
                type="button"
                size="lg"
                data-shard
                data-test="your-turn"
                aria-label="Your turn. Take over the lever."
                @click="sandbox?.act()"
              >your turn</Button>
              <Button as-child size="lg" data-shard>
                <RouterLink to="/playground">playground</RouterLink>
              </Button>
              <Button as-child size="lg" variant="outline" data-shard>
                <RouterLink to="/docs/guides">guides</RouterLink>
              </Button>
            </div>
          </div>
        </div>
      </section>
      <div class="page-screen-gap" aria-hidden="true" />
    </div>

    <section data-test="page-details" class="page-details border-line bg-void grid max-w-none border-t lg:grid-cols-3">
      <PortablePillar />
      <SandboxPillar />
      <HostsPillar />
    </section>

    <SiteFooter data-shard class="px-4 sm:px-6 lg:px-14" />
  </div>
  </div>
</template>
