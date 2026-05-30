<template>
  <div class="koan-attempt" data-test="koan-attempt">
    <RulesMonacoEditor v-model="source" data-test="koan-attempt-editor" />

    <div class="koan-attempt-actions">
      <button type="button" data-test="koan-run-tests" :disabled="running" @click="runTests">
        {{ running ? 'Running…' : 'Run Tests' }}
      </button>
    </div>

    <section class="koan-test-list" aria-labelledby="koan-tests-heading">
      <h3 id="koan-tests-heading">Tests</h3>
      <ol>
        <li v-for="testCase in koan.tests" :key="testCase.name" :data-test="`koan-test-${slugId(testCase.name)}`">
          {{ testCase.name }}
        </li>
      </ol>
    </section>

    <section v-if="results" class="koan-test-results" aria-labelledby="koan-results-heading" data-test="koan-test-results">
      <h3 id="koan-results-heading">Results</h3>
      <p data-test="koan-results-summary">{{ passedCount }} / {{ results.length }} passing</p>
      <ol>
        <li
          v-for="result in results"
          :key="result.name"
          :data-test="`koan-result-${slugId(result.name)}`"
          :data-status="result.passed ? 'pass' : 'fail'"
        >
          <p>
            <strong>{{ result.passed ? '✓' : '✗' }} {{ result.name }}</strong>
          </p>
          <p v-if="result.error" class="koan-result-error" data-test="koan-result-error">{{ result.error }}</p>
          <div v-if="!result.exitCode.passed" class="koan-result-diff" data-test="koan-exit-code-diff">
            <h4>exit code</h4>
            <p>expected: <code>{{ result.exitCode.expected }}</code></p>
            <p>actual: <code>{{ result.exitCode.actual ?? 'none' }}</code></p>
          </div>
          <div
            v-for="resource in result.resources.filter(resource => !resource.passed)"
            :key="resource.name"
            class="koan-result-diff"
            :data-test="`koan-resource-diff-${resource.name}`"
          >
            <h4>{{ resource.name }}</h4>
            <p>expected</p>
            <pre>{{ printable(resource.expected) }}</pre>
            <p>actual</p>
            <pre>{{ printable(resource.actual) }}</pre>
          </div>
        </li>
      </ol>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import RulesMonacoEditor from '../RulesMonacoEditor.vue'
import type { KoanEntry } from './types'
import { runKoanTests, type KoanTestResult } from './runKoanTests'

const props = defineProps<{
  koan: KoanEntry
}>()

const source = ref('')
const running = ref(false)
const results = ref<KoanTestResult[] | null>(null)
const passedCount = computed(() => results.value?.filter(result => result.passed).length ?? 0)

async function runTests(): Promise<void> {
  running.value = true
  try {
    results.value = await runKoanTests(props.koan, source.value)
  } finally {
    running.value = false
  }
}

function slugId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function printable(value: string): string {
  return JSON.stringify(value)
}
</script>
