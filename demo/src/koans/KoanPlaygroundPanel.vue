<template>
  <div class="koan-playground-panel" data-test="koan-playground-panel">
    <section class="koan-playground-section" aria-labelledby="koan-panel-title">
      <header class="koan-playground-header">
        <div>
          <h3 id="koan-panel-title">{{ koan.title }}</h3>
          <p data-test="koan-summary">{{ koan.summary }}</p>
        </div>
        <Badge variant="secondary" data-test="koan-results-summary">{{ summaryText }}</Badge>
      </header>
      <Button type="button" data-test="koan-run-tests" :disabled="running" @click="$emit('run')">
        {{ running ? 'Running…' : 'Run Tests' }}
      </Button>

      <ItemGroup aria-label="Koan test cases">
        <Collapsible v-for="testCase in koan.tests" :key="testCase.name">
          <Item :data-test="`koan-test-${slugId(testCase.name)}`" :data-status="statusFor(testCase.name)">
            <ItemContent>
              <CollapsibleTrigger as-child>
                <Button type="button" variant="ghost" class="justify-start" :data-test="`koan-test-toggle-${slugId(testCase.name)}`">
                  <ItemTitle>{{ testCase.name }}</ItemTitle>
                </Button>
              </CollapsibleTrigger>
              <ItemDescription>{{ resultDescription(testCase.name) }}</ItemDescription>
              <CollapsibleContent>
                <dl>
                  <template v-if="initialState(testCase) !== ''">
                    <dt>initial state</dt>
                    <dd><pre>{{ printable(initialState(testCase)) }}</pre></dd>
                  </template>
                  <template v-for="resource in inputResources(testCase)" :key="`input-${resource.name}`">
                    <dt>{{ resource.name }} input</dt>
                    <dd><pre>{{ printable(resource.value) }}</pre></dd>
                  </template>
                  <template v-for="resource in expectedResources(testCase)" :key="`expected-${resource.name}`">
                    <dt>{{ resource.name }} expected</dt>
                    <dd><pre>{{ printable(resource.value) }}</pre></dd>
                  </template>
                  <dt>expected exit code</dt>
                  <dd><code>{{ testCase.exit_code }}</code></dd>
                  <template v-if="resultFor(testCase.name)?.exitCode && !resultFor(testCase.name)?.exitCode.passed">
                    <dt>actual exit code</dt>
                    <dd><code>{{ resultFor(testCase.name)?.exitCode.actual ?? 'none' }}</code></dd>
                  </template>
                  <template v-for="resource in failedResources(testCase.name)" :key="`actual-${resource.name}`">
                    <dt>{{ resource.name }} actual</dt>
                    <dd><pre>{{ printable(resource.actual) }}</pre></dd>
                  </template>
                  <template v-if="resultFor(testCase.name)?.error">
                    <dt>error</dt>
                    <dd><pre>{{ resultFor(testCase.name)?.error }}</pre></dd>
                  </template>
                </dl>
              </CollapsibleContent>
            </ItemContent>
            <ItemActions>
              <Button type="button" variant="secondary" size="sm" :data-test="`koan-debug-${slugId(testCase.name)}`" @click="$emit('debug', testCase)">
                Debug
              </Button>
            </ItemActions>
          </Item>
        </Collapsible>
      </ItemGroup>
    </section>

    <section class="koan-playground-section koan-solutions-panel" data-test="koan-solutions-panel" aria-labelledby="koan-solutions-title">
      <h3 id="koan-solutions-title">solutions</h3>
      <KoanSolutionsTable :solutions="koan.solutions" />
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
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
  debug: [testCase: KoanTestCase]
}>()

const resultByName = computed(() => new Map((props.results ?? []).map(result => [result.name, result])))
const passedCount = computed(() => props.results?.filter(result => result.passed).length ?? 0)
const summaryText = computed(() => props.results ? `${passedCount.value} / ${props.results.length} passing` : `${props.koan.tests.length} tests`)

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
  return result.passed ? 'passing' : 'failing'
}

function initialState(testCase: KoanTestCase): string {
  return testCase.state ?? ''
}

function inputResources(testCase: KoanTestCase): Array<{ name: string; value: string }> {
  return Object.entries(testCase.resources)
    .filter(([, resource]) => typeof resource.buffer === 'string')
    .map(([name, resource]) => ({ name, value: resource.buffer ?? '' }))
}

function expectedResources(testCase: KoanTestCase): Array<{ name: string; value: string }> {
  return Object.entries(testCase.resources)
    .filter(([, resource]) => typeof resource.expected_output === 'string')
    .map(([name, resource]) => ({ name, value: resource.expected_output ?? '' }))
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
