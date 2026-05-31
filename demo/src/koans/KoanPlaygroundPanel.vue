<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <div class="koan-playground-panel" data-test="koan-playground-panel">
    <section class="koan-playground-section" aria-labelledby="koan-panel-title">
      <header class="koan-playground-header">
        <div>
          <nav class="koan-title-nav" aria-label="Koan navigation" data-test="koan-title-nav">
            <Button
              v-if="previousKoan"
              as="a"
              variant="outline"
              size="sm"
              :href="previousKoan.path"
              :aria-label="`Previous koan: ${previousKoan.title}`"
              data-test="koan-previous"
            >
              ←
            </Button>
            <Button v-else type="button" variant="outline" size="sm" disabled data-test="koan-previous-disabled" aria-label="No previous koan">
              ←
            </Button>

            <Select :model-value="koan.slug" @update:model-value="selectKoan">
              <SelectTrigger id="koan-panel-title" class="koan-title-select" data-test="koan-title-select" aria-label="Select koan">
                {{ koan.title }}
              </SelectTrigger>
              <SelectContent>
                <SelectItem
                  v-for="option in koanOptions"
                  :key="option.slug"
                  :value="option.slug"
                  :data-test="`koan-title-option-${option.slug}`"
                >
                  {{ option.title }}
                </SelectItem>
              </SelectContent>
            </Select>

            <Button
              v-if="nextKoan"
              as="a"
              variant="outline"
              size="sm"
              :href="nextKoan.path"
              :aria-label="`Next koan: ${nextKoan.title}`"
              data-test="koan-next"
            >
              →
            </Button>
            <Button v-else type="button" variant="outline" size="sm" disabled data-test="koan-next-disabled" aria-label="No next koan">
              →
            </Button>
          </nav>
          <p data-test="koan-summary">{{ koan.summary }}</p>
        </div>
      </header>

      <div class="koan-tests-header">
        <h3>tests</h3>
        <span class="koan-tests-summary" data-test="koan-results-summary">{{ summaryText }}</span>
      </div>
      <div class="koan-tests-actions">
        <Button type="button" data-test="koan-run-tests" :disabled="running" @click="$emit('run')">
          {{ running ? 'Running…' : 'Run Tests' }}
        </Button>
        <label class="koan-tests-auto-toggle">
          <input
            type="checkbox"
            :checked="auto"
            data-test="koan-auto-tests"
            @change="$emit('update:auto', ($event.target as HTMLInputElement).checked)"
          >
          auto
        </label>
      </div>

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
                <div class="koan-test-fixture-stack">
                  <div v-if="initialState(testCase) !== ''" class="koan-test-value-block">
                    <div class="koan-test-value-label">initial state</div>
                    <pre :data-test="`koan-test-state-${slugId(testCase.name)}`">{{ initialState(testCase) }}</pre>
                  </div>

                  <div v-for="resource in testcaseResources(testCase)" :key="resource.name" class="koan-test-resource-block">
                    <div v-if="typeof resource.buffer === 'string'" class="koan-test-value-block">
                      <div class="koan-test-value-label">{{ resource.name }} buffer</div>
                      <pre :data-test="`koan-test-resource-input-${slugId(testCase.name)}-${slugId(resource.name)}`">{{ resource.buffer }}</pre>
                    </div>

                    <div v-if="resourceFailure(testCase.name, resource.name)" class="koan-test-diff-block" :data-test="`koan-test-resource-diff-${slugId(testCase.name)}-${slugId(resource.name)}`">
                      <div class="koan-test-diff-title">{{ resource.name }} actual vs expected</div>
                      <div class="state-diff-lines koan-resource-diff-lines">
                        <div class="state-diff-line removed" :data-test="`koan-test-resource-actual-${slugId(testCase.name)}-${slugId(resource.name)}`"><span class="state-diff-sign">-</span>{{ resourceFailure(testCase.name, resource.name)?.actual }}</div>
                        <div class="state-diff-line added" :data-test="`koan-test-resource-expected-${slugId(testCase.name)}-${slugId(resource.name)}`"><span class="state-diff-sign">+</span>{{ resourceFailure(testCase.name, resource.name)?.expected }}</div>
                      </div>
                    </div>
                    <div v-else-if="typeof resource.expected_output === 'string'" class="koan-test-value-block">
                      <div class="koan-test-value-label">{{ resource.name }} expected output</div>
                      <pre :data-test="`koan-test-resource-fixture-expected-${slugId(testCase.name)}-${slugId(resource.name)}`">{{ resource.expected_output }}</pre>
                    </div>
                  </div>

                  <div class="koan-test-value-block koan-test-exit-code-block">
                    <div class="koan-test-value-label">expected exit code</div>
                    <code :data-test="`koan-test-exit-code-fixture-${slugId(testCase.name)}`">{{ testCase.exit_code }}</code>
                  </div>
                </div>
              </section>

              <section v-if="hasNonResourceFailure(testCase.name)" class="koan-test-detail-section koan-test-failure-details" :data-test="`koan-test-failure-${slugId(testCase.name)}`">
                <h4>result</h4>
                <template v-if="resultFor(testCase.name)?.exitCode && !resultFor(testCase.name)?.exitCode.passed">
                  <div class="koan-test-diff-block" :data-test="`koan-test-exit-code-diff-${slugId(testCase.name)}`">
                    <div class="koan-test-diff-title">exit code actual vs expected</div>
                    <div class="state-diff-lines koan-resource-diff-lines">
                      <div class="state-diff-line removed" :data-test="`koan-test-exit-code-actual-${slugId(testCase.name)}`"><span class="state-diff-sign">-</span>actual {{ resultFor(testCase.name)?.exitCode.actual ?? 'none' }}</div>
                      <div class="state-diff-line added" :data-test="`koan-test-exit-code-expected-${slugId(testCase.name)}`"><span class="state-diff-sign">+</span>expected {{ resultFor(testCase.name)?.exitCode.expected }}</div>
                    </div>
                  </div>
                </template>
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
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Item, ItemContent, ItemGroup, ItemTitle } from '@/components/ui/item'
import type { KoanEntry, KoanTestCase, KoanTestResource } from './types'
import type { KoanResourceResult, KoanTestResult } from './runKoanTests'
import KoanSolutionsTable from './KoanSolutionsTable.vue'

const props = defineProps<{
  koan: KoanEntry
  koans?: KoanEntry[]
  previousKoan?: KoanEntry
  nextKoan?: KoanEntry
  running: boolean
  auto: boolean
  results: KoanTestResult[] | null
}>()

defineEmits<{
  run: []
  'update:auto': [value: boolean]
}>()

const expandedOverrides = ref<Record<string, boolean>>({})
const koanOptions = computed(() => props.koans?.length ? props.koans : [props.koan])
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

function selectKoan(value: unknown): void {
  if (typeof value !== 'string' || value === props.koan.slug) return
  const selected = koanOptions.value.find(option => option.slug === value)
  window.location.href = selected?.path ?? `/koans/${encodeURIComponent(value)}/`
}

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

function testcaseResources(testCase: KoanTestCase): Array<{ name: string } & KoanTestResource> {
  return Object.entries(testCase.resources).map(([name, resource]) => ({ name, ...resource }))
}

function hasFixtureDetails(testCase: KoanTestCase): boolean {
  return initialState(testCase) !== '' || testcaseResources(testCase).length > 0 || typeof testCase.exit_code === 'number'
}

function resourceFailure(testName: string, resourceName: string): KoanResourceResult | undefined {
  return resultFor(testName)?.resources.find(resource => resource.name === resourceName && !resource.passed)
}

function hasNonResourceFailure(name: string): boolean {
  const result = resultFor(name)
  return Boolean(result && (!result.exitCode.passed || result.error))
}

function slugId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
</script>
