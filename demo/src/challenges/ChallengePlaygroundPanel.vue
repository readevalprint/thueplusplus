<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <div class="challenge-playground-panel" data-test="challenge-playground-panel">
    <section class="challenge-playground-section" aria-labelledby="challenge-panel-title">
      <div class="challenge-tests-header">
        <h3 id="challenge-panel-title">{{ challenge.title }}</h3>
      </div>

      <Card v-if="allTestsPassed && attemptMetrics" class="challenge-pass-card" data-test="challenge-pass-card" aria-label="All tests passed">
        <CardHeader class="challenge-success-header">
          <CardTitle>Success, all tests passed.</CardTitle>
          <span class="challenge-success-place" data-test="challenge-success-place">{{ attemptPlaceText }}</span>
        </CardHeader>
        <CardContent class="challenge-success-card-content">
          <div class="challenge-leaderboard-label">Leader board</div>
          <div ref="leaderboardScroller" class="challenge-leaderboard-scroll" data-test="challenge-success-leaderboard">
            <ItemGroup>
              <Item
                v-for="entry in leaderboardEntries"
                :key="entry.kind === 'attempt' ? 'attempt' : entry.id"
                :as="entry.path ? 'a' : 'div'"
                :href="entry.path"
                :class="entry.kind === 'attempt' ? 'challenge-leaderboard-current' : 'challenge-leaderboard-link'"
                :data-test="entry.kind === 'attempt' ? 'challenge-leaderboard-current' : `challenge-leaderboard-solution-${entry.id}`"
                :data-current-solution="entry.kind === 'attempt' ? 'true' : undefined"
                :aria-label="entry.path ? `View ${entry.title} by ${entry.author}, ${entry.bytes} bytes` : undefined"
                :variant="entry.kind === 'attempt' ? 'outline' : 'default'"
                size="sm"
              >
                <ItemContent>
                  <ItemTitle>{{ entry.rank }}. {{ entry.title }}</ItemTitle>
                  <ItemDescription>{{ entry.byline }}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <span class="challenge-leaderboard-bytes">{{ entry.bytes }} bytes</span>
                </ItemActions>
              </Item>
            </ItemGroup>
          </div>
        </CardContent>
        <CardFooter class="challenge-success-actions">
          <Button as-child>
            <a :href="contributingLinks.solutions" rel="noreferrer" target="_blank" data-test="challenge-publish-cta">Publish your solution</a>
          </Button>
          <Button v-if="nextChallenge" as-child variant="outline">
            <a :href="nextChallenge.path" data-test="challenge-next-cta">Next Challenge</a>
          </Button>
        </CardFooter>
      </Card>

      <Card v-else data-test="challenge-tests-card" aria-label="Challenge tests">
        <CardContent class="challenge-tests-card-content">
          <div class="challenge-run-tests-row">
            <Button
              type="button"
              variant="default"
              size="lg"
              class="challenge-run-tests-cta"
              data-test="challenge-run-tests"
              :disabled="running"
              @click="emit('run')"
            >
              <span>{{ runTestsLabel }}</span>
              <kbd aria-label="Control or Command Enter">⌘↵</kbd>
            </Button>
          </div>

          <div class="challenge-tests-actions">
            <span class="challenge-tests-summary" data-test="challenge-results-summary">{{ summaryText }}</span>
            <label class="challenge-tests-auto-toggle">
              <input
                type="checkbox"
                :checked="auto"
                data-test="challenge-auto-tests"
                @change="emit('update:auto', ($event.target as HTMLInputElement).checked)"
              >
              auto
            </label>
          </div>

          <ItemGroup class="challenge-test-items" aria-label="Challenge test cases">
        <Item
          v-for="testCase in challenge.tests"
          :key="testCase.name"
          class="challenge-test-item"
          :data-test="`challenge-test-${slugId(testCase.name)}`"
          :data-status="statusFor(testCase.name)"
          :data-expanded="isExpanded(testCase.name) || undefined"
        >
          <ItemContent>
            <button
              type="button"
              class="challenge-test-row-header"
              :aria-expanded="isExpanded(testCase.name)"
              :data-test="`challenge-test-toggle-${slugId(testCase.name)}`"
              @click="toggleExpanded(testCase.name)"
            >
              <span class="challenge-test-title-wrap">
                <span class="challenge-test-chevron" aria-hidden="true">{{ isExpanded(testCase.name) ? '▾' : '▸' }}</span>
                <ItemTitle>{{ testCase.name }}</ItemTitle>
              </span>
              <span class="challenge-test-status" :data-status="statusFor(testCase.name)" :data-test="`challenge-test-status-${slugId(testCase.name)}`">
                {{ resultDescription(testCase.name) }}
              </span>
            </button>

            <div v-if="isExpanded(testCase.name)" class="challenge-test-details" :data-test="`challenge-test-details-${slugId(testCase.name)}`">
              <section v-if="hasFixtureDetails(testCase)" class="challenge-test-detail-section">
                <h4>fixture</h4>
                <div class="challenge-test-fixture-stack">
                  <div v-for="resource in testcaseResources(testCase)" :key="resource.name" class="challenge-test-resource-block">
                    <div v-if="typeof resource.buffer === 'string'" class="challenge-test-value-block">
                      <div class="challenge-test-value-label">{{ resource.name }} buffer</div>
                      <pre :data-test="`challenge-test-resource-input-${slugId(testCase.name)}-${slugId(resource.name)}`">{{ resource.buffer }}</pre>
                    </div>

                    <div v-if="resourceFailure(testCase.name, resource.name)" class="challenge-test-diff-block" :data-test="`challenge-test-resource-diff-${slugId(testCase.name)}-${slugId(resource.name)}`">
                      <div class="challenge-test-diff-title">{{ resource.name }} actual vs expected</div>
                      <div class="state-diff-lines challenge-resource-diff-lines">
                        <div class="state-diff-line removed" :data-test="`challenge-test-resource-actual-${slugId(testCase.name)}-${slugId(resource.name)}`"><span class="state-diff-sign">-</span>{{ resourceFailure(testCase.name, resource.name)?.actual }}</div>
                        <div class="state-diff-line added" :data-test="`challenge-test-resource-expected-${slugId(testCase.name)}-${slugId(resource.name)}`"><span class="state-diff-sign">+</span>{{ resourceFailure(testCase.name, resource.name)?.expected }}</div>
                      </div>
                    </div>
                    <div v-else-if="typeof resource.expected_output === 'string'" class="challenge-test-value-block">
                      <div class="challenge-test-value-label">{{ resource.name }} expected output</div>
                      <pre :data-test="`challenge-test-resource-fixture-expected-${slugId(testCase.name)}-${slugId(resource.name)}`">{{ resource.expected_output }}</pre>
                    </div>
                  </div>

                  <div class="challenge-test-value-block challenge-test-exit-code-block">
                    <div class="challenge-test-value-label">expected exit code</div>
                    <code :data-test="`challenge-test-exit-code-fixture-${slugId(testCase.name)}`">{{ testCase.exit_code }}</code>
                  </div>
                </div>
              </section>

              <section v-if="hasNonResourceFailure(testCase.name)" class="challenge-test-detail-section challenge-test-failure-details" :data-test="`challenge-test-failure-${slugId(testCase.name)}`">
                <h4>result</h4>
                <template v-if="resultFor(testCase.name)?.exitCode && !resultFor(testCase.name)?.exitCode.passed">
                  <div class="challenge-test-diff-block" :data-test="`challenge-test-exit-code-diff-${slugId(testCase.name)}`">
                    <div class="challenge-test-diff-title">exit code actual vs expected</div>
                    <div class="state-diff-lines challenge-resource-diff-lines">
                      <div class="state-diff-line removed" :data-test="`challenge-test-exit-code-actual-${slugId(testCase.name)}`"><span class="state-diff-sign">-</span>actual {{ resultFor(testCase.name)?.exitCode.actual ?? 'none' }}</div>
                      <div class="state-diff-line added" :data-test="`challenge-test-exit-code-expected-${slugId(testCase.name)}`"><span class="state-diff-sign">+</span>expected {{ resultFor(testCase.name)?.exitCode.expected }}</div>
                    </div>
                  </div>
                </template>
                <div v-if="resultFor(testCase.name)?.error" class="state-diff-error" :data-test="`challenge-test-error-${slugId(testCase.name)}`">
                  {{ resultFor(testCase.name)?.error }}
                </div>
              </section>
            </div>
          </ItemContent>
        </Item>
          </ItemGroup>
        </CardContent>
      </Card>


      <section class="challenge-readme-panel" aria-label="Challenge lesson" data-test="challenge-readme">
        <MarkdownDocument :markdown="challenge.readme" />
      </section>

      <section class="challenge-contribute-panel" aria-label="Challenge contribution links" data-test="challenge-contribute-links">
        <span>Suggest improvements:</span>
        <a :href="contributingLinks.challenges" rel="noreferrer" target="_blank">challenge</a>
        <span aria-hidden="true">·</span>
        <a :href="contributingLinks.testCases" rel="noreferrer" target="_blank">test cases</a>
        <span aria-hidden="true">·</span>
        <a :href="contributingLinks.solutions" rel="noreferrer" target="_blank">solutions</a>
      </section>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from '@/components/ui/item'
import type { ChallengeAttemptMetrics, ChallengeEntry, ChallengeTestCase, ChallengeTestResource } from './types'
import type { ChallengeResourceResult, ChallengeTestResult } from './runChallengeTests'
import MarkdownDocument from '../MarkdownDocument.vue'

const CONTRIBUTING_URL = 'https://gitlab.com/thuelang/thueplusplus/-/blob/develop/challenges/CONTRIBUTING.md'
const contributingLinks = {
  challenges: `${CONTRIBUTING_URL}#challenges`,
  testCases: `${CONTRIBUTING_URL}#test-cases`,
  solutions: `${CONTRIBUTING_URL}#solutions`,
} as const

const props = defineProps<{
  challenge: ChallengeEntry
  nextChallenge?: ChallengeEntry
  running: boolean
  auto: boolean
  results: ChallengeTestResult[] | null
}>()

const emit = defineEmits<{
  run: []
  'update:auto': [value: boolean]
}>()

const expandedOverrides = ref<Record<string, boolean>>({})
const leaderboardScroller = ref<HTMLElement | null>(null)
const resultByName = computed(() => new Map((props.results ?? []).map(result => [result.name, result])))
const passedCount = computed(() => props.results?.filter(result => result.passed).length ?? 0)
const failedCount = computed(() => props.results?.filter(result => !result.passed).length ?? 0)
const allTestsPassed = computed(() => Boolean(props.results?.length) && failedCount.value === 0)
const summaryText = computed(() => {
  if (!props.results) return `${props.challenge.tests.length} ${props.challenge.tests.length === 1 ? 'test' : 'tests'}`
  if (failedCount.value === 0) return `${passedCount.value} passing`
  return `${passedCount.value} passing · ${failedCount.value} failing`
})
const runTestsLabel = computed(() => {
  if (props.running) return 'Running…'
  if (!props.results) return 'Run Tests'
  return failedCount.value > 0 ? 'Run Tests Again' : 'Run Again'
})
const attemptMetrics = computed<ChallengeAttemptMetrics | undefined>(() => aggregateAttemptMetrics(props.results ?? []))
const attemptPlaceText = computed(() => {
  const attemptEntry = leaderboardEntries.value.find(entry => entry.kind === 'attempt')
  return attemptEntry ? ordinalPlace(attemptEntry.rank) : ''
})
const leaderboardEntries = computed<LeaderboardEntry[]>(() => {
  if (!attemptMetrics.value) return []
  return [
    ...props.challenge.solutions.map(solution => ({
      id: solution.id,
      title: solution.title,
      author: solution.author,
      byline: `by ${solution.author}`,
      bytes: solution.cumulativeStateBytes,
      path: solution.path,
      kind: 'solution' as const,
    })),
    {
      id: 'attempt',
      title: 'This solution',
      author: 'You',
      byline: 'by You',
      bytes: attemptMetrics.value.cumulativeStateBytes,
      kind: 'attempt' as const,
    },
  ]
    .sort((left, right) => left.bytes - right.bytes || (left.kind === 'attempt' ? 1 : 0) - (right.kind === 'attempt' ? 1 : 0) || left.title.localeCompare(right.title))
    .map((entry, index) => ({ ...entry, rank: index + 1 }))
})

interface LeaderboardEntry {
  id: string
  title: string
  author: string
  byline: string
  bytes: number
  kind: 'solution' | 'attempt'
  rank: number
  path?: string
}

onMounted(() => {
  window.addEventListener('keydown', handleRunShortcut)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleRunShortcut)
})

watch(() => props.results, () => {
  expandedOverrides.value = {}
})

watch([allTestsPassed, leaderboardEntries], async () => {
  await nextTick()
  scrollCurrentSolutionIntoView()
}, { flush: 'post' })

function handleRunShortcut(event: KeyboardEvent): void {
  if (event.key !== 'Enter' || (!event.metaKey && !event.ctrlKey) || props.running) return
  event.preventDefault()
  emit('run')
}

function resultFor(name: string): ChallengeTestResult | undefined {
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

function testcaseResources(testCase: ChallengeTestCase): Array<{ name: string } & ChallengeTestResource> {
  return Object.entries(testCase.resources).map(([name, resource]) => ({ name, ...resource }))
}

function hasFixtureDetails(testCase: ChallengeTestCase): boolean {
  return testcaseResources(testCase).length > 0 || typeof testCase.exit_code === 'number'
}

function resourceFailure(testName: string, resourceName: string): ChallengeResourceResult | undefined {
  return resultFor(testName)?.resources.find(resource => resource.name === resourceName && !resource.passed)
}

function hasNonResourceFailure(name: string): boolean {
  const result = resultFor(name)
  return Boolean(result && (!result.exitCode.passed || result.error))
}

function aggregateAttemptMetrics(results: ChallengeTestResult[]): ChallengeAttemptMetrics | undefined {
  const metrics = results.map(result => result.metrics).filter((value): value is ChallengeAttemptMetrics => Boolean(value))
  if (metrics.length === 0) return undefined
  return {
    ruleCount: metrics.at(-1)?.ruleCount ?? 0,
    stepCount: metrics.reduce((total, metric) => total + metric.stepCount, 0),
    evalCheckCount: metrics.reduce((total, metric) => total + metric.evalCheckCount, 0),
    cumulativeStateBytes: metrics.reduce((total, metric) => total + metric.cumulativeStateBytes, 0),
  }
}

function ordinalPlace(rank: number): string {
  const mod100 = rank % 100
  if (mod100 >= 11 && mod100 <= 13) return `${rank}th place`
  switch (rank % 10) {
    case 1: return `${rank}st place`
    case 2: return `${rank}nd place`
    case 3: return `${rank}rd place`
    default: return `${rank}th place`
  }
}

function scrollCurrentSolutionIntoView(): void {
  if (!allTestsPassed.value) return
  const list = leaderboardScroller.value
  const current = list?.querySelector<HTMLElement>('[data-current-solution="true"]')
  if (!list || !current) return
  list.scrollTop = current.offsetTop - list.offsetTop - Math.max(0, (list.clientHeight - current.offsetHeight) / 2)
}

function slugId(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}
</script>
