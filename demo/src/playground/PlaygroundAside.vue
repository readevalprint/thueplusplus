<script setup lang="ts">
import { useSidebar } from '@/components/ui/sidebar'
import PlaygroundSettings from '@/playground/PlaygroundSettings.vue'
import TestCaseMenu from '@/TestCaseMenu.vue'
import type { TestCaseOption } from '@/testCases'

defineProps<{
  options: TestCaseOption[]
  disabled: boolean
}>()

const maxSteps = defineModel<number>('maxSteps', { required: true })
const maxEvals = defineModel<number>('maxEvals', { required: true })
const maxStateBytes = defineModel<number>('maxStateBytes', { required: true })
const continueSpeed = defineModel<'1' | '10' | '100'>('continueSpeed', { required: true })

const emit = defineEmits<{
  select: [option: TestCaseOption]
}>()

const { setOpenMobile } = useSidebar()

function select(option: TestCaseOption): void {
  setOpenMobile(false)
  emit('select', option)
}
</script>

<template>
  <div data-test="playground-examples">
    <h2 class="px-4 pt-4 text-sm font-medium">Examples</h2>
    <TestCaseMenu :options="options" @select="select" />
  </div>
  <div data-test="playground-settings">
    <h2 class="px-4 pt-4 text-sm font-medium">Settings</h2>
    <PlaygroundSettings
      v-model:max-steps="maxSteps"
      v-model:max-evals="maxEvals"
      v-model:max-state-bytes="maxStateBytes"
      v-model:continue-speed="continueSpeed"
      :disabled="disabled"
    />
  </div>
</template>
