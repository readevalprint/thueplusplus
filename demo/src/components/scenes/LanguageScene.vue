<script setup lang="ts">
import { ref } from 'vue'
import SceneFrame from '@/components/SceneFrame.vue'
import { onControlKey } from '@/rex/useRex'

const operators = [
  { op: '::=', effect: 'rewrite' },
  { op: '::>', effect: 'write' },
  { op: '::<', effect: 'read' },
  { op: '::-', effect: 'stop' },
  { op: '::!', effect: 'call' },
]
const selected = ref(0)

function pick(index: number): void {
  selected.value = index
}
</script>

<template>
  <SceneFrame scene="language" label="Rex points at a rule operator" mode="offer" :x="120" :y="240" :scale="1.05">
    <g v-for="(item, index) in operators" :key="item.op">
      <rect :x="250 + (index % 3) * 120" :y="index < 3 ? 48 : 130" width="100" height="58" rx="3" :fill="selected === index ? '#ff5a36' : 'var(--surface)'" stroke="currentColor" stroke-width="2" />
      <text :x="300 + (index % 3) * 120" :y="index < 3 ? 84 : 166" text-anchor="middle" :fill="selected === index ? '#1a100c' : 'currentColor'" font-family="JetBrains Mono, ui-monospace, monospace" font-size="18">{{ item.op }}</text>
    </g>
    <text data-test="operator-effect" x="400" y="250" text-anchor="middle" fill="currentColor" font-family="JetBrains Mono, ui-monospace, monospace" font-size="16">{{ operators[selected].effect }}</text>
    <template #controls>
      <button
        v-for="(item, index) in operators"
        :key="item.op"
        type="button"
        class="rex-hit"
        :style="{ left: `${((250 + (index % 3) * 120) / 640) * 100}%`, top: index < 3 ? '16%' : '44%', width: '92px', height: '52px' }"
        :aria-label="item.op"
        :aria-pressed="selected === index"
        :data-test="`op-${item.effect}`"
        @click="pick(index)"
        @keydown="onControlKey($event, () => pick(index))"
      />
    </template>
  </SceneFrame>
</template>
