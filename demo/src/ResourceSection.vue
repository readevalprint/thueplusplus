<template>
  <section class="resource-section" :data-test="`resource-section-${resource.name}`">
    <div class="resource-section-header">
      <code>{{ resource.name }}</code>
      <span class="resource-modes">
        <Badge v-if="resource.reads" variant="outline" class="resource-mode">read</Badge>
        <Badge v-if="resource.writes" variant="outline" class="resource-mode">write</Badge>
      </span>
    </div>

    <div v-if="showInput" class="resource-field">
      <label :for="inputId">input</label>
      <textarea
        :id="inputId"
        :value="input"
        :data-test="`resource-input-${resource.name}`"
        spellcheck="false"
        wrap="off"
        @input="$emit('update:input', ($event.target as HTMLTextAreaElement).value)"
      />
      <Button type="button" size="sm" :data-test="`resource-submit-${resource.name}`" :disabled="running" @click="$emit('submit')">Submit</Button>
    </div>

    <div v-if="showOutput" class="resource-field">
      <label :for="outputId">output</label>
      <textarea
        :id="outputId"
        :value="output"
        :data-test="`resource-output-${resource.name}`"
        readonly
        spellcheck="false"
        wrap="off"
      />
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
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
  showInput: boolean
  showOutput: boolean
}>()

defineEmits<{
  'update:input': [value: string]
  submit: []
}>()

const safeName = computed(() => props.resource.name.replace(/[^A-Za-z0-9_-]/g, '-'))
const inputId = computed(() => `resource-input-${safeName.value}`)
const outputId = computed(() => `resource-output-${safeName.value}`)
</script>
