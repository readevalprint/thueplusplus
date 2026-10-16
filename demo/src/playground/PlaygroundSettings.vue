<script setup lang="ts">
import { Button } from '@/components/ui/button'

const maxSteps = defineModel<number>('maxSteps', { required: true })
const maxEvals = defineModel<number>('maxEvals', { required: true })
const maxStateBytes = defineModel<number>('maxStateBytes', { required: true })
const continueSpeed = defineModel<'1' | '10' | '100'>('continueSpeed', { required: true })

defineProps<{
  disabled: boolean
}>()

const stepOptions = [1000, 10000, 100000, 1000000]
const probeOptions = [1000, 10000, 100000, 1000000]
const stateOptions = [1024, 1_000_000, 8_388_608]
const speedOptions: Array<{ value: '1' | '10' | '100'; label: string }> = [
  { value: '1', label: '1/s' },
  { value: '10', label: '10/s' },
  { value: '100', label: '100/s' },
]
</script>

<template>
  <div class="flex flex-col gap-6 p-4">
    <div class="flex flex-col gap-2" data-test="playground-max-steps">
      <h2 class="text-sm font-medium">Step limit</h2>
      <p class="text-muted-foreground text-sm leading-6">Applied rewrites. The Nth rewrite exits 10.</p>
      <div class="flex flex-wrap gap-2">
        <Button
          v-for="option in stepOptions"
          :key="option"
          type="button"
          size="sm"
          :variant="maxSteps === option ? 'secondary' : 'outline'"
          :data-selected="maxSteps === option"
          :data-test="`playground-max-steps-${option}`"
          :disabled="disabled"
          @click="maxSteps = option"
        >
          {{ option }}
        </Button>
      </div>
    </div>
    <div class="flex flex-col gap-2" data-test="playground-max-probes">
      <h2 class="text-sm font-medium">Probe limit</h2>
      <p class="text-muted-foreground text-sm leading-6">Rule probes, including misses. Past the limit exits 11.</p>
      <div class="flex flex-wrap gap-2">
        <Button
          v-for="option in probeOptions"
          :key="option"
          type="button"
          size="sm"
          :variant="maxEvals === option ? 'secondary' : 'outline'"
          :data-selected="maxEvals === option"
          :data-test="`playground-max-probes-${option}`"
          :disabled="disabled"
          @click="maxEvals = option"
        >
          {{ option }}
        </Button>
      </div>
    </div>
    <div class="flex flex-col gap-2" data-test="playground-max-state">
      <h2 class="text-sm font-medium">State limit</h2>
      <p class="text-muted-foreground text-sm leading-6">UTF-8 bytes after a replacement. Past the limit exits 12.</p>
      <div class="flex flex-wrap gap-2">
        <Button
          v-for="option in stateOptions"
          :key="option"
          type="button"
          size="sm"
          :variant="maxStateBytes === option ? 'secondary' : 'outline'"
          :data-selected="maxStateBytes === option"
          :data-test="`playground-max-state-${option}`"
          :disabled="disabled"
          @click="maxStateBytes = option"
        >
          {{ option }}
        </Button>
      </div>
    </div>
    <div class="flex flex-col gap-2">
      <h2 class="text-sm font-medium">Play speed</h2>
      <div class="flex flex-wrap gap-2" aria-label="Step speed">
        <Button
          v-for="option in speedOptions"
          :key="option.value"
          type="button"
          size="sm"
          :variant="continueSpeed === option.value ? 'secondary' : 'outline'"
          :data-selected="continueSpeed === option.value"
          :data-test="`playground-speed-${option.value}`"
          :disabled="disabled"
          @click="continueSpeed = option.value"
        >
          {{ option.label }}
        </Button>
      </div>
    </div>
  </div>
</template>
