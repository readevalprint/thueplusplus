<template>
  <section class="resource-section" :data-test="`resource-section-${resource.name}`">
    <div class="resource-section-header">
      <code>{{ resource.name }}</code>
    </div>

    <div v-if="showInput" class="resource-field">
      <textarea
        :id="inputId"
        :class="inputAttentionClass"
        :value="input"
        :data-attention="attention === 'input' ? 'input' : undefined"
        :data-test="`resource-input-${resource.name}`"
        spellcheck="false"
        wrap="off"
        @input="$emit('update:input', ($event.target as HTMLTextAreaElement).value)"
      />
      <Button type="button" size="sm" :data-test="`resource-submit-${resource.name}`" :disabled="running || !canSubmit" @click="$emit('submit')">Submit</Button>
    </div>

    <div v-if="showOutput" class="resource-field">
      <textarea
        ref="outputTextarea"
        :id="outputId"
        :class="outputAttentionClass"
        :value="output"
        :data-attention="attention === 'output' ? 'output' : undefined"
        :data-test="`resource-output-${resource.name}`"
        readonly
        spellcheck="false"
        wrap="off"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'

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
const outputTextarea = ref<HTMLTextAreaElement | null>(null)
const inputAttentionClass = computed(() => props.attention === 'input' ? 'resource-textarea-attention-input' : undefined)
const outputAttentionClass = computed(() => props.attention === 'output' ? 'resource-textarea-attention-output' : undefined)

watch(() => props.output, async () => {
  await nextTick()
  if (outputTextarea.value) outputTextarea.value.scrollTop = outputTextarea.value.scrollHeight
})
</script>
