<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import PillarFrame from './PillarFrame.vue'
import { meterWidth, proofFrames, refusedResources, visibleNewlines, type ProofFrame, type TraceStep } from '@/pillars/playback'
import { sandboxInput, sandboxLimits, sandboxRequest } from '@/pillars/programs'
import { usePlayback } from '@/pillars/usePlayback'
import { runWithWorker, type DemoResourceLog, type DemoRunResult } from '@/wasm'
import type { PoseMode } from '@/rex/motion'

const frames = ref<ProofFrame[]>([])
const failure = ref('')
const limit = ref('')
const message = ref('')
const exitCode = ref<number | null>(null)
const steps = ref(0)
const probes = ref(0)
const bytes = ref(0)
const logs = ref<DemoResourceLog[]>([])
const refused = ref<string[]>([])
let alive = true

const { frame, settled } = usePlayback(frames)
const settledAttr = computed(() => (failure.value || settled.value ? 'yes' : 'no'))
const okAttr = computed(() => {
  if (failure.value) return 'no'
  if (settled.value) return 'yes'
  return 'pending'
})
const mode = computed<PoseMode>(() => (settled.value && limit.value === 'steps' ? 'duck' : 'read'))
const stateText = computed(() => frame.value?.state ?? sandboxInput)

function count(name: string, value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error(`sandbox run returned no ${name}`)
  }
  return value
}

function show(result: DemoRunResult): void {
  if (typeof result.state !== 'string') throw new Error('sandbox run returned no state')
  if (typeof result.exitCode !== 'number') throw new Error('sandbox run returned no exit code')
  if (!result.limit) throw new Error(`sandbox run ended at exit ${result.exitCode} without a limit`)
  if (!result.error) throw new Error('sandbox run returned no limit message')
  if (!result.trace || result.trace.length === 0) throw new Error('sandbox run returned no trace')
  const peak = result.metrics?.state_peak
  if (typeof peak !== 'number') throw new Error('sandbox run returned no state peak')
  if (!result.resourceLogs || result.resourceLogs.length === 0) throw new Error('sandbox run returned no resources')
  const trace = result.trace as TraceStep[]
  const bound = result.resourceLogs.map(log => log.name)
  limit.value = result.limit
  message.value = result.error
  exitCode.value = result.exitCode
  steps.value = count('applied steps', result.appliedSteps)
  probes.value = count('probe count', result.evalCount)
  bytes.value = count('state peak', peak)
  logs.value = result.resourceLogs
  refused.value = refusedResources(trace, bound)
  frames.value = proofFrames(trace, result.stdout ?? '', result.state)
}

async function run(): Promise<void> {
  try {
    const result = await runWithWorker(sandboxRequest())
    if (!alive) return
    show(result)
  } catch (err) {
    if (!alive) return
    failure.value = err instanceof Error ? err.message : String(err)
  }
}

onMounted(() => {
  void run()
})

onBeforeUnmount(() => {
  alive = false
})

function width(used: number, cap: number): string {
  return `${meterWidth(used, cap)}%`
}
</script>

<template>
  <PillarFrame
    id="secure-sandbox"
    title="secure sandbox"
    :mode="mode"
    :label="mode === 'duck' ? 'Rex ducks as the step limit stops the run' : 'Rex reads the state'"
    :settled="settledAttr"
    :ok="okAttr"
    :limit="limit || undefined"
  >
    <div class="border-2 p-3" :class="limit === 'steps' ? 'border-signal' : 'border-bone'">
      <pre data-test="sandbox-state" class="text-bone font-mono text-[18px] whitespace-pre">{{ stateText }}</pre>
      <div v-if="settled && !failure" data-test="sandbox-meters" class="mt-3 flex flex-col gap-2">
        <div class="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 font-mono text-[12px]">
          <span class="text-ash">steps</span>
          <div class="bg-line h-1.5" data-test="steps-meter" :data-full="limit === 'steps' ? 'yes' : 'no'">
            <div class="h-full" :class="limit === 'steps' ? 'bg-signal' : 'bg-bone'" :style="{ width: width(steps, sandboxLimits.maxSteps) }" />
          </div>
          <span data-test="limit-steps">{{ steps }}/{{ sandboxLimits.maxSteps }}</span>
        </div>
        <div class="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 font-mono text-[12px]">
          <span class="text-ash">probes</span>
          <div class="bg-line h-1.5" data-test="probes-meter" :data-full="limit === 'evals' ? 'yes' : 'no'">
            <div class="h-full" :class="limit === 'evals' ? 'bg-signal' : 'bg-bone'" :style="{ width: width(probes, sandboxLimits.maxEvals) }" />
          </div>
          <span data-test="limit-probes">{{ probes }}/{{ sandboxLimits.maxEvals }}</span>
        </div>
        <div class="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 font-mono text-[12px]">
          <span class="text-ash">bytes</span>
          <div class="bg-line h-1.5" data-test="bytes-meter" :data-full="limit === 'state' ? 'yes' : 'no'">
            <div class="h-full" :class="limit === 'state' ? 'bg-signal' : 'bg-bone'" :style="{ width: width(bytes, sandboxLimits.maxStateBytes) }" />
          </div>
          <span data-test="limit-bytes">{{ bytes }}/{{ sandboxLimits.maxStateBytes }}</span>
        </div>
      </div>
    </div>
    <p v-if="failure" data-test="pillar-error" class="text-signal font-mono text-[12px]">{{ failure }}</p>
    <div v-if="settled && !failure" class="flex flex-col gap-2">
      <p data-test="limit-message" class="text-signal font-mono text-[12px]">{{ message }}</p>
      <p data-test="sandbox-exit" class="text-ash font-mono text-[12px]">exit {{ exitCode }}</p>
      <ul class="flex flex-col gap-1 font-mono text-[13px]">
        <li v-for="log in logs" :key="log.name" data-test="bound-resource" :data-resource="log.name" data-bound="yes" class="flex items-baseline justify-between gap-3">
          <span class="text-ash">{{ log.name }}</span>
          <span class="text-bone whitespace-pre">{{ visibleNewlines(log.outputText ?? '') }}</span>
        </li>
        <li v-for="name in refused" :key="name" data-test="unbound-resource" :data-resource="name" data-bound="no" class="flex items-baseline justify-between gap-3">
          <span class="text-ash line-through">{{ name }}</span>
          <span class="text-signal">ERR:resource:{{ name }}</span>
        </li>
      </ul>
    </div>
  </PillarFrame>
</template>
