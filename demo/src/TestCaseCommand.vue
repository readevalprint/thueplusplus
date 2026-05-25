<template>
  <div class="test-case-command" data-test="test-case-command">
    <button type="button" class="test-case-command-trigger" data-test="test-case-command-trigger" @click="openPalette">
      <span>{{ selected ? selected.caseName : 'Search tests by path or case name...' }}</span>
      <kbd>⌘K</kbd>
    </button>
    <p v-if="selected" class="test-case-command-current" data-test="test-case-command-current">
      current: <span>{{ selected.manifestPath }}</span> · <span>{{ selected.caseName }}</span>
    </p>

    <div v-if="paletteOpen" class="test-case-command-overlay" data-test="test-case-command-overlay" @pointerdown.self="closePalette">
      <ComboboxRoot
        v-model="selectedId"
        v-model:open="comboboxOpen"
        class="test-case-command-panel"
        ignore-filter
        open-on-click
        open-on-focus
        :reset-search-term-on-blur="false"
        :reset-search-term-on-select="false"
        @update:model-value="selectById"
      >
        <ComboboxAnchor class="test-case-command-anchor">
          <ComboboxInput
            v-model="search"
            class="test-case-command-input"
            data-test="test-case-command-input"
            type="search"
            placeholder="Search tests by path or case name..."
            @keydown.esc.prevent="closePalette"
          />
        </ComboboxAnchor>
        <ComboboxContent class="test-case-command-list" data-test="test-case-command-list" position="inline" @escape-key-down.prevent="closePalette">
          <p v-if="matchedOptions.length === 0" class="test-case-command-empty" data-test="test-case-command-empty">No test cases found.</p>
          <ComboboxViewport v-else>
            <ComboboxItem
              v-for="option in filteredOptions"
              :key="option.id"
              :value="option.id"
              :text-value="option.searchableText"
              class="test-case-option"
              data-test="test-case-option"
              :data-test-case-id="option.id"
            >
              <span class="test-case-option-path" data-test="test-case-option-path">{{ option.manifestPath }}</span>
              <span class="test-case-option-line">
                <span class="test-case-option-name" data-test="test-case-option-name">{{ option.caseName }}</span>
                <code class="test-case-option-input" data-test="test-case-option-input-preview">{{ option.inputPreview }}</code>
              </span>
            </ComboboxItem>
          </ComboboxViewport>
          <p v-if="matchedOptions.length > filteredOptions.length" class="test-case-command-footer" data-test="test-case-command-footer">
            Showing first {{ filteredOptions.length }} of {{ matchedOptions.length }} matches. Keep typing to narrow.
          </p>
        </ComboboxContent>
      </ComboboxRoot>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { ComboboxAnchor, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxRoot, ComboboxViewport } from 'reka-ui'
import type { TestCaseOption } from './testCases'

const MAX_VISIBLE_OPTIONS = 80

const props = defineProps<{
  options: TestCaseOption[]
}>()

const emit = defineEmits<{
  select: [option: TestCaseOption]
}>()

const search = ref('')
const paletteOpen = ref(false)
const comboboxOpen = ref(false)
const selected = ref<TestCaseOption | undefined>()
const selectedId = ref<string | undefined>()

const matchedOptions = computed(() => {
  const terms = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  return terms.length === 0
    ? props.options
    : props.options.filter(option => {
      const haystack = option.searchableText.toLowerCase()
      return terms.every(term => haystack.includes(term))
    })
})

const filteredOptions = computed(() => matchedOptions.value.slice(0, MAX_VISIBLE_OPTIONS))

onMounted(() => {
  document.addEventListener('keydown', focusOnShortcut)
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', focusOnShortcut)
})

function selectById(value: string | undefined): void {
  const option = props.options.find(item => item.id === value)
  if (!option) return
  selected.value = option
  selectedId.value = option.id
  search.value = ''
  closePalette()
  emit('select', option)
}

function openPalette(): void {
  paletteOpen.value = true
  comboboxOpen.value = true
  void nextTick(() => {
    const input = document.querySelector('[data-test="test-case-command-input"]') as HTMLInputElement | null
    input?.focus()
  })
}

function closePalette(): void {
  paletteOpen.value = false
  comboboxOpen.value = false
  search.value = ''
}

function focusOnShortcut(event: KeyboardEvent): void {
  const target = event.target as HTMLElement | null
  const isEditable = target?.matches('input, textarea, select, [contenteditable="true"]')
  if (isEditable) return
  if (event.key === '/' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k')) {
    event.preventDefault()
    openPalette()
  }
}
</script>
