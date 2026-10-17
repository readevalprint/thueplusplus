<script setup lang="ts">
import { computed, ref } from 'vue'
import SceneFrame from '@/components/SceneFrame.vue'
import { siteHosts } from '@/hosts'
import { installPage } from '@/install'
import { onControlKey } from '@/rex/useRex'

const props = defineProps<{ hostId?: string }>()
const selected = ref(props.hostId ?? siteHosts[0].id)
const command = computed(() => {
  const host = siteHosts.find(item => item.id === selected.value)
  if (!host) throw new Error(`no host ${selected.value}`)
  return installPage(host.href).install.split('\n')[0]
})

function pick(id: string): void {
  selected.value = id
}

function socketX(index: number): number {
  const count = siteHosts.length
  const left = 250
  const right = 604
  if (count <= 1) return right
  return left + index * ((right - left) / (count - 1))
}
</script>

<template>
  <SceneFrame :scene="`install-${selected}`" label="Rex unpacks the thuelang crate and plugs a host cable" mode="offer" :x="168" :y="236">
    <rect x="36" y="150" width="92" height="70" rx="3" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
    <path d="M36 150 H128 L116 132 H48 Z" fill="var(--raised)" stroke="currentColor" stroke-width="2" />
    <text x="82" y="190" text-anchor="middle" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="11">thuelang</text>
    <path :d="`M128 176 C 220 176, 260 120, ${socketX(siteHosts.findIndex(item => item.id === selected))} 118`" fill="none" stroke="#ff5a36" stroke-width="3" stroke-linecap="round" />
    <g v-for="(host, index) in siteHosts" :key="host.id">
      <rect :x="socketX(index) - 18" y="96" width="36" height="28" rx="3" :fill="selected === host.id ? '#ff5a36' : 'var(--surface)'" stroke="currentColor" stroke-width="2" />
      <text :x="socketX(index)" y="146" text-anchor="middle" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="11">{{ host.landing }}</text>
    </g>
    <template #controls>
      <button
        v-for="(host, index) in siteHosts"
        :key="host.id"
        type="button"
        class="rex-hit"
        :style="{ left: `${((socketX(index) - 22) / 640) * 100}%`, top: '30%', width: '48px', height: '48px' }"
        :aria-label="`${host.title} socket`"
        :aria-pressed="selected === host.id"
        :data-test="`socket-${host.landing}`"
        @click="pick(host.id)"
        @keydown="onControlKey($event, () => pick(host.id))"
      />
      <p data-test="install-command" class="bg-surface/90 absolute inset-x-3 bottom-2 truncate px-2 py-1 font-mono text-[11px]" aria-live="polite">{{ command }}</p>
    </template>
  </SceneFrame>
</template>
