<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import PillarFrame from './PillarFrame.vue'
import { registryHosts } from '@/hosts'
import { proofFrames, visibleNewlines, type ProofFrame } from '@/pillars/playback'
import { portableInput, portableRequest, portableSource } from '@/pillars/programs'
import { runWithWorker, type DemoRunResult } from '@/wasm'
import { usePlayback } from '@/pillars/usePlayback'

const frames = ref<ProofFrame[]>([])
const failure = ref('')
let alive = true

const { frame, settled } = usePlayback(frames)
const settledAttr = computed(() => (failure.value || settled.value ? 'yes' : 'no'))
const okAttr = computed(() => {
  if (failure.value) return 'no'
  if (settled.value) return 'yes'
  return 'pending'
})
const stateText = computed(() => frame.value?.state ?? portableInput)
const stdoutText = computed(() => visibleNewlines(frame.value?.stdout ?? ''))

function fail(err: unknown): void {
  failure.value = err instanceof Error ? err.message : String(err)
}

function stdoutOf(result: DemoRunResult): string {
  const log = result.resourceLogs?.find(item => item.name === 'stdout')
  if (!log || typeof log.outputText !== 'string') throw new Error('portable run returned no stdout resource')
  if (typeof result.stdout === 'string' && result.stdout.length > 0 && result.stdout !== log.outputText) {
    throw new Error('portable run stdout and the stdout resource disagree')
  }
  return log.outputText
}

function show(result: DemoRunResult): void {
  if (result.exitCode !== 0) {
    throw new Error(result.error || result.stderr || `portable run exited ${result.exitCode}`)
  }
  frames.value = proofFrames(result.trace, stdoutOf(result), result.state ?? '')
}

async function run(): Promise<void> {
  try {
    const result = await runWithWorker(portableRequest())
    if (!alive) return
    show(result)
  } catch (err) {
    if (!alive) return
    fail(err)
  }
}

onMounted(() => {
  void run()
})

onBeforeUnmount(() => {
  alive = false
})
</script>

<template>
  <PillarFrame id="portable" title="portable" mode="offer" label="Rex holds out one ruleset" :settled="settledAttr" :ok="okAttr">
    <pre data-test="portable-ruleset" class="border-line bg-surface text-bone max-w-full min-w-0 overflow-x-auto p-3 font-mono text-[12px] leading-5">{{ portableSource }}</pre>
    <div class="flex items-baseline justify-between gap-3 font-mono text-[13px]">
      <span class="text-ash">state</span>
      <span data-test="portable-state" class="text-bone whitespace-pre">{{ visibleNewlines(stateText) }}</span>
    </div>
    <p v-if="failure" data-test="pillar-error" class="text-signal font-mono text-[12px]">{{ failure }}</p>
    <ul data-test="portable-hosts" class="flex flex-col">
      <li
        v-for="host in registryHosts"
        :key="host.id"
        data-test="portable-host"
        :data-host-id="host.id"
        class="border-line flex items-baseline justify-between gap-3 border-t py-1.5 font-mono text-[13px]"
      >
        <RouterLink :to="host.href" class="text-ash hover:text-signal shrink-0">{{ host.landing }}</RouterLink>
        <span data-test="host-stdout" class="min-w-0 text-right whitespace-pre" :class="stdoutText ? 'text-signal' : 'text-dim'">{{ stdoutText }}</span>
      </li>
    </ul>
  </PillarFrame>
</template>
