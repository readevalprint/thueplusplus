<template>
  <div class="test-case-command" data-test="test-case-command">
    <input
      v-model="search"
      class="test-case-command-input"
      data-test="test-case-command-input"
      type="search"
      placeholder="Search tests by path or case name..."
      @focus="open = true"
      @input="open = true"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter.prevent="selectActive"
      @keydown.esc="open = false"
    />
    <div v-if="open" class="test-case-command-list" data-test="test-case-command-list">
      <p v-if="filteredOptions.length === 0" class="test-case-command-empty" data-test="test-case-command-empty">No test cases found.</p>
      <button
        v-for="(option, index) in filteredOptions"
        :key="option.id"
        type="button"
        class="test-case-option"
        :class="{ active: index === activeIndex }"
        data-test="test-case-option"
        :data-test-case-id="option.id"
        @mousedown.prevent="select(option)"
      >
        <span class="test-case-option-path" data-test="test-case-option-path">{{ option.manifestLabel }}</span>
        <span class="test-case-option-line">
          <span class="test-case-option-name" data-test="test-case-option-name">{{ option.caseName }}</span>
          <code class="test-case-option-input" data-test="test-case-option-input-preview">{{ option.inputPreview }}</code>
        </span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { TestCaseOption } from './testCases'

const props = defineProps<{
  options: TestCaseOption[]
}>()

const emit = defineEmits<{
  select: [option: TestCaseOption]
}>()

const search = ref('')
const open = ref(false)
const activeIndex = ref(0)

const filteredOptions = computed(() => {
  const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const filtered = terms.length === 0
    ? props.options
    : props.options.filter(option => {
      const haystack = option.searchableText.toLowerCase()
      return terms.every(term => haystack.includes(term))
    })
  return filtered.slice(0, 80)
})

watch(filteredOptions, () => { activeIndex.value = 0 })

function move(delta: number): void {
  open.value = true
  if (filteredOptions.value.length === 0) return
  activeIndex.value = (activeIndex.value + delta + filteredOptions.value.length) % filteredOptions.value.length
}

function selectActive(): void {
  const option = filteredOptions.value[activeIndex.value]
  if (option) select(option)
}

function select(option: TestCaseOption): void {
  search.value = `${option.manifestLabel} — ${option.caseName}`
  open.value = false
  emit('select', option)
}
</script>
