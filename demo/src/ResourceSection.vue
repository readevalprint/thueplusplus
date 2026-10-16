<template>
  <section class="flex flex-col gap-2" :data-test="`resource-section-${resource.name}`">
    <p class="font-mono text-sm font-medium">{{ resource.name }}</p>

    <div v-if="showInput" class="flex flex-col gap-2">
      <Textarea
        :id="inputId"
        :model-value="input"
        class="font-mono"
        :data-attention="attention === 'input' ? 'input' : undefined"
        :data-test="`resource-input-${resource.name}`"
        spellcheck="false"
        wrap="off"
        @update:model-value="$emit('update:input', String($event))"
      />
      <Button type="button" size="sm" class="self-start" :data-test="`resource-submit-${resource.name}`" :disabled="running || !canSubmit" @click="$emit('submit')">Submit</Button>
    </div>

    <div v-if="showOutput" class="flex flex-col gap-2">
      <Textarea
        :id="outputId"
        ref="outputTextarea"
        :model-value="output"
        class="font-mono"
        :data-attention="outputAttentionEffect ? 'output' : undefined"
        :data-test="`resource-output-${resource.name}`"
        readonly
        spellcheck="false"
        wrap="off"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

interface ResourceUsage {
  name: string
  reads: boolean
  writes: boolean
}

const props = defineProps<{
  resource: ResourceUsage
  input: string
  output: string
  running: boolean
  canSubmit: boolean
  showInput: boolean
  showOutput: boolean
  attention?: 'input' | 'output'
}>()

defineEmits<{
  'update:input': [value: string]
  submit: []
}>()

const safeName = computed(() => props.resource.name.replace(/[^A-Za-z0-9_-]/g, '-'))
const inputId = computed(() => `resource-input-${safeName.value}`)
const outputId = computed(() => `resource-output-${safeName.value}`)
const outputTextarea = ref<{ textarea?: HTMLTextAreaElement | null } | null>(null)
const outputAttentionEffect = ref(false)
let outputAttentionTimeout: ReturnType<typeof setTimeout> | undefined

function triggerOutputAttention(): void {
  outputAttentionEffect.value = true
  if (outputAttentionTimeout) clearTimeout(outputAttentionTimeout)
  outputAttentionTimeout = setTimeout(() => {
    outputAttentionEffect.value = false
    outputAttentionTimeout = undefined
  }, 1000)
}

watch(() => props.output, async () => {
  triggerOutputAttention()
  await nextTick()
  const element = outputTextarea.value?.textarea
  if (element) element.scrollTop = element.scrollHeight
})

onBeforeUnmount(() => {
  if (outputAttentionTimeout) clearTimeout(outputAttentionTimeout)
})
</script>
