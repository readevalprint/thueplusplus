<script setup lang="ts">
import { computed, ref } from 'vue'
import SceneFrame from '@/components/SceneFrame.vue'
import { onControlKey } from '@/rex/useRex'
import type { ProblemCase } from '@/catalog'

const props = defineProps<{
  problemId: string
  cases: ProblemCase[]
}>()

const index = ref(0)
const replay = ref(0)
const current = computed(() => {
  const item = props.cases[index.value]
  if (!item) throw new Error(`${props.problemId} has no fixed case`)
  return item
})

function clip(value: string): string {
  const one = value.replace(/\s+/g, ' ').trim()
  if (one.length === 0) return '—'
  return one.length > 32 ? `${one.slice(0, 31)}…` : one
}

const input = computed(() => {
  const lines = Object.values(current.value.reads)[0]
  return clip(lines ? lines.join(' ') : '')
})

const output = computed(() => clip(Object.values(current.value.writes)[0] ?? ''))
const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

function nextCase(): void {
  if (props.cases.length < 2) {
    replay.value += 1
    return
  }
  index.value = (index.value + 1) % props.cases.length
  replay.value += 1
}

function again(): void {
  replay.value += 1
}
</script>

<template>
  <SceneFrame scene="problem" :label="`Rex feeds ${current.name} into the rewrite machine`" mode="offer" :x="168" :y="236" :scale="1">
    <rect x="250" y="70" width="120" height="130" rx="4" fill="var(--surface)" stroke="currentColor" stroke-width="2" />
    <circle cx="310" cy="124" r="28" fill="var(--void)" stroke="currentColor" stroke-width="2" />
    <text x="310" y="130" text-anchor="middle" fill="#ff5a36" font-family="JetBrains Mono, ui-monospace, monospace" font-size="16">::=</text>
    <text data-test="scene-input" :key="`in-${replay}`" x="40" y="120" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="14">{{ input }}</text>
    <text data-test="scene-output" :key="`out-${replay}`" x="390" y="120" fill="#ff5a36" font-family="JetBrains Mono, ui-monospace, monospace" font-size="14">{{ output }}</text>
    <text x="40" y="96" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="11" opacity="0.7">in</text>
    <text x="390" y="96" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="11" opacity="0.7">out</text>
    <g v-if="problemId === 'rot-13'" data-test="rot-wheel" class="rot-wheel">
      <circle cx="520" cy="150" r="52" fill="none" stroke="currentColor" stroke-width="2" />
      <text
        v-for="(letter, letterIndex) in letters"
        :key="letter"
        :x="520 + Math.cos((letterIndex / letters.length) * Math.PI * 2 - Math.PI / 2) * 40"
        :y="150 + Math.sin((letterIndex / letters.length) * Math.PI * 2 - Math.PI / 2) * 40"
        text-anchor="middle"
        fill="currentColor"
        font-family="JetBrains Mono, ui-monospace, monospace"
        font-size="9"
      >{{ letter }}</text>
    </g>
    <template #controls>
      <button type="button" class="rex-hit" style="left: 6%; top: 28%; width: 28%; height: 36%" data-test="replay-case" aria-label="Replay this case" @click="again" @keydown="onControlKey($event, again)" />
      <button type="button" class="rex-hit" style="left: 62%; top: 70%; width: 30%; height: 18%" data-test="next-case" aria-label="Next fixed case" @click="nextCase" @keydown="onControlKey($event, nextCase)" />
    </template>
  </SceneFrame>
</template>
