<template>
  <div class="koan-playground-panel" data-test="koan-playground-panel">
    <section class="koan-playground-section" aria-labelledby="koan-panel-title">
      <header class="koan-playground-header">
        <div>
          <h3 id="koan-panel-title">{{ koan.title }}</h3>
          <p data-test="koan-summary">{{ koan.summary }}</p>
        </div>
      </header>

      <div class="koan-tests-header">
        <h3>tests</h3>
        <span class="koan-tests-summary" data-test="koan-results-summary">{{ summaryText }}</span>
      </div>
      <Button type="button" data-test="koan-run-tests" :disabled="running" @click="$emit('run')">
        {{ running ? 'Running…' : 'Run Tests' }}
      </Button>

      <ItemGroup class="koan-test-items" aria-label="Koan test cases">
        <Item
          v-for="testCase in koan.tests"
          :key="testCase.name"
          class="koan-test-item"
          :data-test="`koan-test-${slugId(testCase.name)}`"
          :data-status="statusFor(testCase.name)"
          :data-expanded="isExpanded(testCase.name) || undefined"
        >
          <ItemContent>
            <button
              type="button"
              class="koan-test-row-header"
              :aria-expanded="isExpanded(testCase.name)"
              :data-test="`koan-test-toggle-${slugId(testCase.name)}`"
              @click="toggleExpanded(testCase.name)"
            >
              <span class="koan-test-title-wrap">
                <span class="koan-test-chevron" aria-hidden="true">{{ isExpanded(testCase.name) ? '▾' : '▸' }}</span>
                <ItemTitle>{{ testCase.name }}</ItemTitle>
              </span>
              <span class="koan-test-status" :data-status="statusFor(testCase.name)" :data-test="`koan-test-status-${slugId(testCase.name)}`">
                {{ resultDescription(testCase.name) }}
              </span>
            </button>

            <div v-if="isExpanded(testCase.name)" class="koan-test-details" :data-test="`koan-test-details-${slugId(testCase.name)}`">
              <section v-if="hasFixtureDetails(testCase)" class="koan-test-detail-section">
                <h4>fixture</h4>
                <dl class="koan-test-fixture-list">
                  <template v-if="initialState(testCase) !== ''">
                    <dt>initial state</dt>
                    <dd><pre :data-test="`koan-test-state-${slugId(testCase.name)}`">{{ printable(initialState(testCase)) }}</pre></dd>
                  </template>
                  <template v-for="resource in inputResources(testCase)" :key="`input-${resource.name}`">
                    <dt>{{ resource.name }} buffer</dt>
                    <dd><pre :data-test="`koan-test-resource-input-${slugId(testCase.name)}-${slugId(resource.name)}`">{{ printable(resource.value) }}</pre></dd>
                  </template>
                  <template v-for="resource in expectedResources(testCase)" :key="`expected-${resource.name}`">
                    <dt>{{ resource.name }} expected output</dt>
                    <dd><pre :data-test="`koan-test-resource-fixture-expected-${slugId(testCase.name)}-${slugId(resource.name)}`">{{ printable(resource.value) }}</pre></dd>
                  </template>
                  <dt>expected exit code</dt>
                  <dd><code :data-test="`koan-test-exit-code-fixture-${slugId(testCase.name)}`">{{ testCase.exit_code }}</code></dd>
                </dl>
              </section>

              <section v-if="resultFor(testCase.name) && !resultFor(testCase.name)?.passed" class="koan-test-detail-section koan-test-failure-details" :data-test="`koan-test-failure-${slugId(testCase.name)}`">
                <h4>result</h4>
                <template v-if="resultFor(testCase.name)?.exitCode && !resultFor(testCase.name)?.exitCode.passed">
                  <div class="koan-test-diff-block" :data-test="`koan-test-exit-code-diff-${slugId(testCase.name)}`">
                    <div class="koan-test-diff-title">exit code differs</div>
                    <div class="state-diff-lines koan-resource-diff-lines">
                      <div class="state-diff-line removed" :data-test="`koan-test-exit-code-expected-${slugId(testCase.name)}`"><span class="state-diff-sign">-</span>expected {{ resultFor(testCase.name)?.exitCode.expected }}</div>
                      <div class="state-diff-line added" :data-test="`koan-test-exit-code-actual-${slugId(testCase.name)}`"><span class="state-diff-sign">+</span>actual {{ resultFor(testCase.name)?.exitCode.actual ?? 'none' }}</div>
                    </div>
                  </div>
                </template>
                <div
                  v-for="resource in failedResources(testCase.name)"
                  :key="resource.name"
                  class="koan-test-diff-block"
                  :data-test="`koan-test-resource-diff-${slugId(testCase.name)}-${slugId(resource.name)}`"
                >
                  <div class="koan-test-diff-title">{{ resource.name }} differs</div>
                  <div class="state-diff-lines koan-resource-diff-lines">
                    <div class="state-diff-line removed" :data-test="`koan-test-resource-expected-${slugId(testCase.name)}-${slugId(resource.name)}`"><span class="state-diff-sign">-</span>{{ printable(resource.expected) }}</div>
                    <div class="state-diff-line added" :data-test="`koan-test-resource-actual-${slugId(testCase.name)}-${slugId(resource.name)}`"><span class="state-diff-sign">+</span>{{ printable(resource.actual) }}</div>
                  </div>
                </div>
                <div v-if="resultFor(testCase.name)?.error" class="state-diff-error" :data-test="`koan-test-error-${slugId(testCase.name)}`">
                  {{ resultFor(testCase.name)?.error }}
                </div>
              </section>
            </div>
          </ItemContent>
        </Item>
      </ItemGroup>
    </section>

    <section class="koan-playground-section koan-solutions-panel" data-test="koan-solutions-panel" aria-labelledby="koan-solutions-title">
      <h3 id="koan-solutions-title">solutions</h3>
      <KoanSolutionsTable :solutions="koan.solutions" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Item, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import type { KoanEntry, KoanTestCase } from './types'
import type { KoanTestResult } from './runKoanTests'
import KoanSolutionsTable from './KoanSolutionsTable.vue'

const props = defineProps<{
  koan: KoanEntry
  running: boolean
  results: KoanTestResult[] | null
}>()

defineEmits<{
  run: []
}>()

const expandedOverrides = ref<Record<string, boolean>>({})
const resultByName = computed(() => new Map((props.results ?? []).map(result => [result.name, result])))
const passedCount = computed(() => props.results?.filter(result => result.passed).length ?? 0)
const failedCount = computed(() => props.results?.filter(result => !result.passed).length ?? 0)
const summaryText = computed(() => {
  if (!props.results) return `${props.koan.tests.length} ${props.koan.tests.length === 1 ? 'test' : 'tests'}`
  if (failedCount.value === 0) return `${passedCount.value} passing`
  return `${passedCount.value} passing · ${failedCount.value} failing`
})

watch(() => props.results, () => {
  expandedOverrides.value = {}
})

function resultFor(name: string): KoanTestResult | undefined {
  return resultByName.value.get(name)
}

function statusFor(name: string): string {
  const result = resultFor(name)
  if (!result) return 'idle'
  return result.passed ? 'pass' : 'fail'
}

function resultDescription(name: string): string {
  const result = resultFor(name)
  if (!result) return 'not run'
  return result.passed ? 'passed' : 'failed'
}

function isExpanded(name: string): boolean {
  if (Object.prototype.hasOwnProperty.call(expandedOverrides.value, name)) return expandedOverrides.value[name]
  return statusFor(name) === 'fail'
}

function toggleExpanded(name: string): void {
  expandedOverrides.value = {
    ...expandedOverrides.value,
    [name]: !isExpanded(name),
  }
}

function initialState(testCase: KoanTestCase): string {
  return testCase.state ?? ''
}

function inputResources(testCase: KoanTestCase): Array<{ name: string; value: string }> {
  return Object.entries(testCase.resources)
    .filter((entry): entry is [string, { buffer: string }] => typeof entry[1].buffer === 'string')
    .map(([name, resource]) => ({ name, value: resource.buffer }))
}

function expectedResources(testCase: KoanTestCase): Array<{ name: string; value: string }> {
  return Object.entries(testCase.resources)
    .filter((entry): entry is [string, { expected_output: string }] => typeof entry[1].expected_output === 'string')
    .map(([name, resource]) => ({ name, value: resource.expected_output }))
}

function hasFixtureDetails(testCase: KoanTestCase): boolean {
  return initialState(testCase) !== '' || inputResources(testCase).length > 0 || expectedResources(testCase).length > 0 || typeof testCase.exit_code === 'number'
}

function failedResources(name: string) {
  return resultFor(name)?.resources.filter(resource => !resource.passed) ?? []
}

function printable(value: string): string {
  return JSON.stringify(value)
}

function slugId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
</script>
