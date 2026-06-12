<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
<template>
  <main ref="surfaceRoot" class="playground-route playground-surface" :class="[`playground-chrome-${props.chrome}`, { 'playground-compact-layout': isCompactLayout }]" :data-mode="props.mode" :data-compact="isCompactLayout ? 'true' : 'false'">
    <header v-if="showHeader" class="playground-route-header" data-test="playground-header">
      <h1>{{ props.title }}</h1>
    </header>

    <p v-if="loadError" class="error-text">{{ loadError }}</p>

    <section v-if="showPicker" data-test="test-case-pane">
      <TestCaseMenu :options="testCaseOptions" @select="selectTestCase" />
    </section>

    <section v-if="isCompactLayout" class="playground-embed-layout" data-test="playground-compact-surface">
      <header class="playground-embed-topbar" data-test="embed-topbar">
        <div class="playground-embed-title">
          <strong>{{ sourcePath }}</strong>
          <Badge variant="secondary" class="run-status" data-test="playground-status">{{ statusText }}</Badge>
        </div>
        <div class="playground-embed-actions">
          <Button v-if="showRunButton" type="button" variant="secondary" data-test="embed-run" :disabled="!canRun" @click="() => runCompactProgram()">Run</Button>
          <Button v-if="showStepControls" type="button" variant="secondary" data-test="playground-step" :disabled="!canRun" :title="stepTitle" @click="() => stepProgram()">Step</Button>
          <Button v-if="showDebugControls && canRun" type="button" variant="secondary" data-test="playground-continue" :title="continueTitle" @click="() => continueProgram()">Play</Button>
          <Button v-else-if="showDebugControls" type="button" variant="secondary" data-test="playground-restart" :disabled="isBusy" title="Restart" @click="() => restartProgram()">Restart</Button>
          <Button v-if="showDebugControls" type="button" variant="secondary" data-test="playground-pause" :disabled="!continuing" title="Pause" @click="pauseProgram">Pause</Button>
          <Button v-if="showDebugControls" type="button" variant="secondary" data-test="playground-end" :disabled="!canRun" :title="endTitle" @click="() => endProgram()">End</Button>
          <Button v-if="showDebugControls" type="button" variant="secondary" data-test="playground-reset" :disabled="!canReset" title="Reset to first state" @click="resetToFirstState">Reset</Button>
          <Button v-if="showDebugControls" type="button" variant="secondary" data-test="playground-undo" :disabled="!canUndo" title="Step back" @click="undoStep">Back</Button>
          <Button v-if="props.showOpenFull" as="a" variant="ghost" :href="openFullHref" data-test="embed-open-full">Open full</Button>
        </div>
      </header>

      <ChallengePlaygroundPanel
        v-if="props.challenge"
        :challenge="props.challenge"
        :next-challenge="props.nextChallenge"
        :running="challengeTestsRunning"
        :auto="challengeTestsAuto"
        :results="challengeResults"
        @run="runCurrentChallengeTests"
        @update:auto="setChallengeTestsAuto"
      />

      <section class="playground-rules-pane playground-embed-source" data-test="embed-source-pane">
        <header class="playground-panel-header playground-rules-header">
          <div class="playground-rules-title-block">
            <div class="playground-panel-title">program rules</div>
            <p v-if="selectedCaseLabel" class="playground-selected-case" data-test="playground-selected-case">
              <span>{{ selectedCaseLabel }}</span>
              <small>{{ selectedCaseSource }}</small>
            </p>
          </div>
          <div v-if="showDebugControls" class="playground-rules-options-row">
            <div class="playground-option-group">
              <span>speed</span>
              <ButtonGroup class="playground-speed-links" aria-label="Step speed">
                <Button v-for="option in continueSpeedOptions" :key="option.value" type="button" :variant="continueSpeed === option.value ? 'secondary' : 'ghost'" size="sm" :data-selected="continueSpeed === option.value" :data-test="`playground-speed-${option.value}`" :disabled="isBusy" @click="continueSpeed = option.value">{{ option.label }}</Button>
              </ButtonGroup>
            </div>
            <div class="playground-option-group" data-test="playground-step-limit">
              <span>step limit</span>
              <ButtonGroup aria-label="Step limit">
                <Button v-for="option in stepLimitOptions" :key="option" type="button" :variant="stepLimit === option ? 'secondary' : 'ghost'" size="sm" :data-selected="stepLimit === option" :data-test="`playground-step-limit-${option}`" :disabled="isBusy" @click="stepLimit = option">{{ option }}</Button>
              </ButtonGroup>
            </div>
          </div>
        </header>
        <div class="playground-panel-content">
          <RulesMonacoEditor :model-value="rulesText" :highlight-line="matchedRuleLine" :readonly="!props.editable" :data-current-state="stateText" data-test="playground-rules" @ready="markEditorReady" @update:model-value="setRulesText" @paste="seedStateFromSource" />
        </div>
      </section>

      <nav class="playground-section-tabs" aria-label="playground sections" data-test="embed-section-tabs">
        <Button v-for="section in sectionTabs" :key="section.id" type="button" variant="secondary" :class="{ active: activeSection === section.id }" :data-section="section.id" @click="setActiveSection(section.id)">{{ section.label }}</Button>
      </nav>

      <section class="playground-section-panel" data-test="embed-section-panel">
        <header class="playground-panel-header">
          <div class="playground-panel-title">{{ activeSection }}</div>
          <div v-if="activeSection === 'output'" class="playground-output-tabs" data-test="embed-output-tabs">
            <Button type="button" size="sm" variant="secondary" :class="{ active: activeOutputTab === 'stdout' }" data-output-tab="stdout" @click="setActiveOutputTab('stdout')">stdout</Button>
            <Button type="button" size="sm" variant="secondary" :class="{ active: activeOutputTab === 'stderr' }" data-output-tab="stderr" @click="setActiveOutputTab('stderr')">stderr</Button>
          </div>
        </header>
        <div class="playground-panel-content">
          <template v-if="activeSection === 'output'">
            <Textarea v-if="activeOutputTab === 'stdout'" :model-value="resourceOutputText('stdout')" data-test="resource-output-stdout" readonly spellcheck="false" wrap="off" />
            <Textarea v-else :model-value="resourceOutputText('stderr')" data-test="resource-output-stderr" readonly spellcheck="false" wrap="off" />
          </template>
          <StateDiffs v-else-if="activeSection === 'trace'" :entries="stateDiffs" :selected-key="selectedHistoryKey" @select="selectHistoryEntry" />
          <template v-else-if="activeSection === 'state'">
            <Textarea :model-value="stateText" data-test="playground-current-state" readonly spellcheck="false" wrap="off" />
          </template>
          <div v-else-if="activeSection === 'resources'" class="resource-list compact-resource-list" data-test="resource-sections">
            <ResourceSection v-for="resource in resourceSections" :key="resource.name" :resource="resource" :input="resourceInputs[resource.name] ?? ''" :output="resourceOutputText(resource.name)" :attention="resourceAttention[resource.name]" :running="isBusy" :can-submit="requestedResourceName === resource.name" :show-input="showResourceInput(resource)" :show-output="showResourceOutput(resource)" :input-readonly="resourceInputReadonly(resource.name)" :input-help="resourceInputHelp(resource.name)" :countdown-seconds="countdownForResource(resource.name)" @update:input="setResourceInput(resource.name, $event)" @submit="submitResource(resource.name)" />
          </div>
          <Textarea v-else :model-value="fullSourceText" data-test="embed-source-text" readonly spellcheck="false" wrap="off" />
        </div>
      </section>
    </section>

    <ResizablePanelGroup v-else direction="horizontal" class="playground-layout" :auto-save-id="props.challenge ? 'playground-challenge-columns' : 'playground-columns'" data-test="playground-full-surface">
      <ResizablePanel v-if="props.challenge" :default-size="24" :min-size="16" class="playground-column playground-challenge-column">
        <ChallengePlaygroundPanel
          :challenge="props.challenge"
          :next-challenge="props.nextChallenge"
          :running="challengeTestsRunning"
          :auto="challengeTestsAuto"
          :results="challengeResults"
          @run="runCurrentChallengeTests"
          @update:auto="setChallengeTestsAuto"
        />
      </ResizablePanel>
      <ResizableHandle v-if="props.challenge" />
      <ResizablePanel :default-size="props.challenge ? 32 : 42" :min-size="24" class="playground-column playground-rules-column">
        <ResizablePanelGroup direction="vertical" class="playground-rules-state-layout" auto-save-id="playground-rules-state-split" data-test="playground-rules-state-split">
          <ResizablePanel :default-size="76" :min-size="45" class="playground-rules-stack-panel">
            <section class="playground-rules-pane">
              <header class="playground-panel-header playground-rules-header">
            <div class="playground-rules-title-block">
              <div class="playground-panel-title">program rules</div>
              <p v-if="selectedCaseLabel" class="playground-selected-case" data-test="playground-selected-case">
                <span>{{ selectedCaseLabel }}</span>
                <small>{{ selectedCaseSource }}</small>
              </p>
            </div>
            <div class="playground-rules-controls-row">
              <div class="playground-transport-controls">
                <Button type="button" variant="secondary" size="icon" data-test="playground-reset" :disabled="!canReset" title="Reset to first state" aria-label="Reset to first state" @click="resetToFirstState">
                  <svg class="toolbar-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M11 5v14l-9-7 9-7zm11 0v14l-9-7 9-7z" /></svg>
                </Button>
                <Button type="button" variant="secondary" size="icon" data-test="playground-undo" :disabled="!canUndo" title="Step back" aria-label="Step back" @click="undoStep">
                  <svg class="toolbar-icon" aria-hidden="true" viewBox="0 0 320 512"><path d="M267.5 440.6c9.5 7.9 22.8 9.7 34.1 4.4s18.4-16.6 18.4-29l0-320c0-12.4-7.2-23.7-18.4-29s-24.5-3.6-34.1 4.4l-192 160L64 241 64 96c0-17.7-14.3-32-32-32S0 78.3 0 96L0 416c0 17.7 14.3 32 32 32s32-14.3 32-32l0-145 11.5 9.6 192 160z" /></svg>
                </Button>
                <Button type="button" variant="secondary" size="icon" data-test="playground-pause" :disabled="!continuing" title="Pause" aria-label="Pause" @click="pauseProgram">
                  <svg class="toolbar-icon" aria-hidden="true" viewBox="0 0 320 512"><path d="M48 64C21.5 64 0 85.5 0 112L0 400c0 26.5 21.5 48 48 48l32 0c26.5 0 48-21.5 48-48l0-288c0-26.5-21.5-48-48-48L48 64zm192 0c-26.5 0-48 21.5-48 48l0 288c0 26.5 21.5 48 48 48l32 0c26.5 0 48-21.5 48-48l0-288c0-26.5-21.5-48-48-48l-32 0z" /></svg>
                </Button>
                <Button v-if="canRun" type="button" variant="secondary" size="icon" data-test="playground-continue" :title="continueTitle" aria-label="Play" @click="() => continueProgram()">
                  <svg class="toolbar-icon" aria-hidden="true" viewBox="0 0 384 512"><path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80L0 432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z" /></svg>
                </Button>
                <Button v-else type="button" variant="secondary" size="icon" data-test="playground-restart" :disabled="isBusy" title="Restart" aria-label="Restart" @click="() => restartProgram()">
                  <svg class="toolbar-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M12 5V2L7 7l5 5V8c2.76 0 5 2.24 5 5 0 .86-.22 1.67-.6 2.38l1.46 1.46A6.95 6.95 0 0 0 19 13c0-3.86-3.14-7-7-7zm-5 5.62A6.95 6.95 0 0 0 5 15c0 3.86 3.14 7 7 7v3l5-5-5-5v3c-2.76 0-5-2.24-5-5 0-.86.22-1.67.6-2.38L6.14 9.16A6.95 6.95 0 0 0 5 13z" /></svg>
                </Button>
                <Button type="button" variant="secondary" size="icon" data-test="playground-step" :disabled="!canRun" :title="stepTitle" aria-label="Step forward" @click="() => stepProgram()">
                  <svg class="toolbar-icon" aria-hidden="true" viewBox="0 0 320 512"><path d="M52.5 440.6c-9.5 7.9-22.8 9.7-34.1 4.4S0 428.4 0 416L0 96C0 83.6 7.2 72.3 18.4 67s24.5-3.6 34.1 4.4l192 160L256 241l0-145c0-17.7 14.3-32 32-32s32 14.3 32 32l0 320c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-145-11.5 9.6-192 160z" /></svg>
                </Button>
                <Button type="button" variant="secondary" size="icon" data-test="playground-end" :disabled="!canRun" :title="endTitle" aria-label="End" @click="() => endProgram()">
                  <svg class="toolbar-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M13 5v14l9-7-9-7zM2 5v14l9-7-9-7z" /></svg>
                </Button>
              </div>
              <Badge variant="secondary" class="run-status" data-test="playground-status">{{ statusText }}</Badge>
            </div>
            <div class="playground-rules-options-row">
              <div class="playground-option-group">
                <span>speed</span>
                <ButtonGroup class="playground-speed-links" aria-label="Step speed">
                  <Button v-for="option in continueSpeedOptions" :key="option.value" type="button" :variant="continueSpeed === option.value ? 'secondary' : 'ghost'" size="sm" :data-selected="continueSpeed === option.value" :data-test="`playground-speed-${option.value}`" :disabled="isBusy" @click="continueSpeed = option.value">{{ option.label }}</Button>
                </ButtonGroup>
              </div>
              <div class="playground-option-group" data-test="playground-step-limit">
                <span>step limit</span>
                <ButtonGroup aria-label="Step limit"><Button v-for="option in stepLimitOptions" :key="option" type="button" :variant="stepLimit === option ? 'secondary' : 'ghost'" size="sm" :data-selected="stepLimit === option" :data-test="`playground-step-limit-${option}`" :disabled="isBusy" @click="stepLimit = option">{{ option }}</Button></ButtonGroup>
              </div>
            </div>
              </header>
              <div class="playground-panel-content">
                <RulesMonacoEditor :model-value="rulesText" :highlight-line="matchedRuleLine" :readonly="!props.editable" :data-current-state="stateText" data-test="playground-rules" @ready="markEditorReady" @update:model-value="setRulesText" @paste="seedStateFromSource" />
              </div>
            </section>
          </ResizablePanel>
          <ResizableHandle data-test="playground-rules-state-handle" />
          <ResizablePanel :default-size="24" :min-size="16" class="playground-state-stack-panel">
            <section class="playground-source-state-pane" data-test="playground-initial-state-pane">
              <header class="playground-panel-header">
                <div class="playground-panel-title">initial state</div>
              </header>
              <div class="playground-panel-content playground-source-state-content">
                <Textarea
                  :model-value="initialStateText"
                  :readonly="!props.editable || isBusy"
                  data-test="playground-initial-state"
                  spellcheck="false"
                  wrap="off"
                  @update:model-value="setInitialStateText(String($event))"
                />
              </div>
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel :default-size="props.challenge ? 22 : 29" :min-size="20" class="playground-column playground-resources-column">
        <section class="playground-resources-pane" data-test="resource-sections">
          <header class="playground-panel-header">
            <div class="playground-panel-title">resources</div>
          </header>
          <div class="playground-panel-content resource-list">
            <ResourceSection v-for="resource in resourceSections" :key="resource.name" :resource="resource" :input="resourceInputs[resource.name] ?? ''" :output="resourceOutputText(resource.name)" :attention="resourceAttention[resource.name]" :running="isBusy" :can-submit="requestedResourceName === resource.name" :show-input="showResourceInput(resource)" :show-output="showResourceOutput(resource)" :input-readonly="resourceInputReadonly(resource.name)" :input-help="resourceInputHelp(resource.name)" :countdown-seconds="countdownForResource(resource.name)" @update:input="setResourceInput(resource.name, $event)" @submit="submitResource(resource.name)" />
          </div>
        </section>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel :default-size="props.challenge ? 22 : 29" :min-size="20" class="playground-column playground-state-column">
        <ResizablePanelGroup direction="vertical" class="playground-current-history-layout" auto-save-id="playground-current-history-split" data-test="playground-current-history-split">
          <ResizablePanel :default-size="32" :min-size="18" class="playground-current-state-stack-panel">
            <section class="playground-current-state-pane" data-test="playground-current-state-pane">
              <header class="playground-panel-header playground-current-state-header">
                <div class="playground-panel-title">current state</div>
                <Button type="button" variant="ghost" size="sm" data-test="copy-current-state" title="Copy current state" aria-label="Copy current state" @click="copyCurrentState">copy</Button>
              </header>
              <div class="playground-panel-content playground-current-state-content">
                <Textarea :model-value="stateText" data-test="playground-current-state" readonly spellcheck="false" wrap="off" />
              </div>
            </section>
          </ResizablePanel>
          <ResizableHandle data-test="playground-current-history-handle" />
          <ResizablePanel :default-size="68" :min-size="25" class="playground-history-stack-panel">
            <section class="playground-diffs-pane">
              <header class="playground-panel-header">
                <div class="playground-panel-title">state history</div>
              </header>
              <div class="playground-panel-content">
                <StateDiffs :entries="stateDiffs" :selected-key="selectedHistoryKey" @select="selectHistoryEntry" />
              </div>
            </section>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>
    </ResizablePanelGroup>
  </main>
</template>

<script setup lang="ts">
import { diffChars } from 'diff'
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Textarea } from '@/components/ui/textarea'
import ResourceSection from './ResourceSection.vue'
import RulesMonacoEditor from './RulesMonacoEditor.vue'
import StateDiffs from './StateDiffs.vue'
import TestCaseMenu from './TestCaseMenu.vue'
import ChallengePlaygroundPanel from './challenges/ChallengePlaygroundPanel.vue'
import { flattenTestManifests, type TestCaseOption } from './testCases'
import { setProgramSourceState, splitProgramSource } from './thueSource'
import { runWithWorker, type DemoTraceEvent } from './wasm'
import { expectedResources, type ChallengeTestResult } from './challenges/runChallengeTests'
import type { ChallengeAttemptMetrics, ChallengeEntry, ChallengeTestCase } from './challenges/types'

export type PlaygroundSection = 'output' | 'state' | 'input' | 'trace' | 'resources' | 'source'
export type PlaygroundMode = 'auto' | 'full' | 'compact' | 'mini' | 'debug'
export type PlaygroundControls = 'run' | 'step' | 'debug' | 'none'
export type PlaygroundChrome = 'page' | 'embed' | 'bare'
type OutputTab = 'stdout' | 'stderr'

const props = withDefaults(defineProps<{
  file?: string
  test?: string
  caseName?: string
  section?: PlaygroundSection
  tab?: string
  mode?: PlaygroundMode
  chrome?: PlaygroundChrome
  editable?: boolean
  controls?: PlaygroundControls
  header?: boolean
  picker?: boolean
  showTestSelector?: boolean
  showOpenFull?: boolean
  syncUrl?: boolean
  title?: string
  challenge?: ChallengeEntry
  challenges?: ChallengeEntry[]
  previousChallenge?: ChallengeEntry
  nextChallenge?: ChallengeEntry
}>(), {
  mode: 'auto',
  chrome: 'page',
  editable: true,
  controls: 'debug',
  header: true,
  picker: true,
  showTestSelector: true,
  showOpenFull: false,
  syncUrl: true,
  title: 'THUE++ Playground',
})

const emit = defineEmits<{
  ready: []
}>()

const routeSearchParams = new URLSearchParams(window.location.search)
const surfaceRoot = ref<HTMLElement | null>(null)
const measuredWidth = ref(window.innerWidth)
const activeSection = ref<PlaygroundSection>(normalizeSection(props.section ?? routeSearchParams.get('section')))
const activeOutputTab = ref<OutputTab>(normalizeOutputTab(props.tab ?? routeSearchParams.get('tab')))
let surfaceResizeObserver: ResizeObserver | undefined

const showHeader = computed(() => props.header && props.chrome !== 'bare')
const showPicker = computed(() => props.picker && props.showTestSelector)
const isCompactLayout = computed(() => {
  if (props.mode === 'full') return false
  if (props.mode === 'compact' || props.mode === 'mini' || props.mode === 'debug') return true
  if (props.chrome === 'embed' || props.chrome === 'bare') return true
  return measuredWidth.value < 760
})
const compactControls = computed<PlaygroundControls>(() => props.controls)
const showRunButton = computed(() => compactControls.value === 'run' || compactControls.value === 'step' || compactControls.value === 'debug')
const showStepControls = computed(() => compactControls.value === 'step' || compactControls.value === 'debug')
const showDebugControls = computed(() => compactControls.value === 'debug')
const openFullHref = computed(() => {
  const url = new URL('/playground', window.location.href)
  url.searchParams.set('file', fileParam.value)
  if (activeSection.value) url.searchParams.set('section', activeSection.value)
  if (activeOutputTab.value) url.searchParams.set('tab', activeOutputTab.value)
  return `${url.pathname}${url.search}`
})
const sectionTabs: Array<{ id: PlaygroundSection; label: string }> = [
  { id: 'output', label: 'Output' },
  { id: 'state', label: 'State' },
  { id: 'trace', label: 'Trace' },
  { id: 'resources', label: 'Resources' },
  { id: 'source', label: 'Source' },
]

function normalizeSection(value?: string | null): PlaygroundSection {
  const allowed = new Set(['output', 'state', 'trace', 'resources', 'source'])
  return allowed.has(value ?? '') ? value as PlaygroundSection : 'output'
}

function normalizeOutputTab(value?: string | null): OutputTab {
  return value === 'stderr' ? 'stderr' : 'stdout'
}

function setActiveSection(section: PlaygroundSection): void {
  activeSection.value = section
  syncSelectionUrl()
}

function setActiveOutputTab(tab: OutputTab): void {
  activeOutputTab.value = tab
  syncSelectionUrl()
}

function syncSelectionUrl(): void {
  if (!props.syncUrl) return
  const url = new URL(window.location.href)
  url.searchParams.set('section', activeSection.value)
  url.searchParams.set('tab', activeOutputTab.value)
  window.history.replaceState({}, '', url)
}

function markEditorReady(): void {
  emit('ready')
}

onMounted(() => {
  if (!surfaceRoot.value) return
  if (typeof ResizeObserver === 'undefined') {
    measuredWidth.value = surfaceRoot.value.getBoundingClientRect().width || window.innerWidth
    return
  }
  surfaceResizeObserver = new ResizeObserver(entries => {
    measuredWidth.value = entries[0]?.contentRect.width ?? window.innerWidth
  })
  surfaceResizeObserver.observe(surfaceRoot.value)
})

onBeforeUnmount(() => {
  surfaceResizeObserver?.disconnect()
  stopPendingCountdown()
  cancelPendingChallengeTestDebounce()
  abortChallengeTestRun()
})


const exampleModules = import.meta.glob('../../examples/**/*.tpp', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const manifestModules = import.meta.glob('../../examples/**/tests/*.toml', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

const examplesByPublicPath = Object.fromEntries(Object.entries(exampleModules).map(([key, value]) => [toPublicExamplePath(key), value]))
const repoFiles = Object.fromEntries([
  ...Object.entries(exampleModules),
  ...Object.entries(manifestModules),
].map(([key, value]) => [key.replace(/^\.\.\/\.\.\//, ''), value]))
const testCaseOptions = flattenTestManifests(Object.fromEntries(Object.entries(manifestModules).map(([key, value]) => [toPublicExamplePath(key), value])))
const initialFile = normalizeFileParam(props.file ?? routeSearchParams.get('file'))
const CHALLENGE_TESTS_AUTO_STORAGE_KEY = 'thuepp.challengeTestsAuto'
const CHALLENGE_ATTEMPT_STORAGE_PREFIX = 'thuepp.challengeAttempt.'

interface StoredChallengeAttempt {
  rules: string
  initialState: string
}

function initialChallengeTestsAuto(): boolean {
  try {
    return window.localStorage.getItem(CHALLENGE_TESTS_AUTO_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

function persistChallengeTestsAuto(value: boolean): void {
  try {
    window.localStorage.setItem(CHALLENGE_TESTS_AUTO_STORAGE_KEY, value ? 'true' : 'false')
  } catch {
    // Ignore storage failures; auto mode still works for the current session.
  }
}

function challengeAttemptStorageKey(): string | undefined {
  const slug = props.challenge?.slug
  return slug ? `${CHALLENGE_ATTEMPT_STORAGE_PREFIX}${slug}` : undefined
}

function loadStoredChallengeAttempt(): StoredChallengeAttempt | undefined {
  const key = challengeAttemptStorageKey()
  if (!key) return undefined
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return undefined
    const parsed = JSON.parse(raw) as Partial<StoredChallengeAttempt>
    if (typeof parsed.rules !== 'string' || parsed.rules.trim() === '') return undefined
    return {
      rules: parsed.rules,
      initialState: typeof parsed.initialState === 'string' ? parsed.initialState : '',
    }
  } catch {
    return undefined
  }
}

function persistChallengeAttempt(): void {
  const key = challengeAttemptStorageKey()
  if (!key) return
  try {
    if (rulesText.value.trim() === '') {
      window.localStorage.removeItem(key)
      return
    }
    window.localStorage.setItem(key, JSON.stringify({
      rules: rulesText.value,
      initialState: initialStateText.value,
    } satisfies StoredChallengeAttempt))
  } catch {
    // Ignore storage failures; challenge editing still works for the current session.
  }
}

type ContinueSpeed = '1' | '10' | '100'

const continueSpeedOptions: Array<{ value: ContinueSpeed; label: string; delayMs: number }> = [
  { value: '1', label: '1/s', delayMs: 1000 },
  { value: '10', label: '10/s', delayMs: 100 },
  { value: '100', label: '100/s', delayMs: 10 },
]
const stepLimitOptions = [1000, 10000, 100000]

const fileParam = ref(initialFile)
const sourcePath = ref(initialFile.replace(/^\.\//, ''))
const rulesText = ref('')
const initialStateText = ref('')
const stateText = ref('')
const resourceInputs = ref<Record<string, string>>({})
const resourceSubmittedInputs = ref<Record<string, string>>({})
const resourceLogs = ref<Record<string, ResourceLogSnapshot>>({})
const resourceOutputs = ref<Record<string, string>>({})
const resourceAttention = ref<Record<string, 'input' | 'output'>>({})
const pendingResourceName = ref('')
const pendingResourceTimeoutSeconds = ref<number | undefined>()
const pendingResourceCountdownSeconds = ref<number | undefined>()
const pendingResourceDeadlineMs = ref<number | undefined>()
let pendingResourceTimer: ReturnType<typeof window.setInterval> | undefined
const loadError = ref('')
const running = ref(false)
const continuing = ref(false)
const pauseRequested = ref(false)
const statusText = ref('idle')
const stateDiffs = ref<StateDiffEntry[]>([])
const selectedHistoryKey = ref<string | undefined>()
const terminalHistoryKey = ref<string | undefined>()
const baseState = ref('')
const lastRunMode = ref<'step' | 'continue' | 'end'>('step')
const lastRunExitCode = ref<number | undefined>()
const lastRunError = ref<string | undefined>()
const continueSpeed = ref<ContinueSpeed>('10')
const stepLimit = ref(10000)
const matchedRuleLine = ref<number | undefined>()
const selectedTestCase = ref<TestCaseOption | undefined>()
const challengeResults = ref<ChallengeTestResult[] | null>(null)
const challengeTestsRunning = ref(false)
const challengeTestsAuto = ref(initialChallengeTestsAuto())
const currentChallengeTestMetrics = ref<Omit<ChallengeAttemptMetrics, 'ruleCount'>>({ stepCount: 0, evalCheckCount: 0, cumulativeStateBytes: 0 })
let challengeTestRunId = 0
let challengeTestAbortController: AbortController | undefined
let challengeTestDebounceTimer: ReturnType<typeof window.setTimeout> | undefined

const runnableRulesText = computed(() => rulesText.value)
const fullSourceText = computed(() => setProgramSourceState(rulesText.value, initialStateText.value))
const ruleCount = computed(() => runnableRulesText.value.split(/\r?\n/).filter(row => /::=|::!|::<|::>|::-/.test(row)).length)
const evalLimit = computed(() => stepLimit.value * Math.max(1, ruleCount.value))
const resourceSections = computed(() => mergeResourceSections(extractResources(runnableRulesText.value), []))
const selectedCaseLabel = computed(() => selectedTestCase.value?.caseName ?? '')
const selectedCaseSource = computed(() => selectedTestCase.value?.manifestPath ?? '')
const selectedHistoryCursor = computed(() => stateDiffs.value.findIndex(entry => entry.key === selectedHistoryKey.value))
const isBusy = computed(() => running.value || continuing.value)
const atTerminalHistoryEntry = computed(() => selectedHistoryKey.value !== undefined && selectedHistoryKey.value === terminalHistoryKey.value)
const canReset = computed(() => !isBusy.value && selectedHistoryCursor.value > 0)
const canUndo = computed(() => !isBusy.value && selectedHistoryCursor.value > 0)
const canRun = computed(() => !isBusy.value && !atTerminalHistoryEntry.value)
const requestedResourceName = computed(() => pendingResourceName.value)
const stepTitle = computed(() => 'Step forward')
const continueTitle = computed(() => 'Play')
const endTitle = computed(() => `End without rendering intermediate steps (limit ${stepLimit.value} steps)`)
const continueDelayMs = computed(() => continueSpeedOptions.find(option => option.value === continueSpeed.value)?.delayMs ?? 100)

watch(runnableRulesText, () => {
  scheduleChallengeTestRun()
})

function toPublicExamplePath(globPath: string): string {
  return `./${globPath.replace(/^\.\.\/\.\.\//, '')}`
}

function normalizeFileParam(value: string | null): string {
  const fallback = './examples/hello/hello.tpp'
  if (!value) return fallback
  if (value.startsWith('./examples/')) return value
  if (value.startsWith('examples/')) return `./${value}`
  return fallback
}

interface ResourceUsage {
  name: string
  reads: boolean
  writes: boolean
}

interface ResourceLogSnapshot {
  reads: string[]
  writes: string[]
  errors: string[]
  remainingInputText?: string
  outputText?: string
}

interface ResourceSnapshot {
  inputs: Record<string, string>
  submittedInputs: Record<string, string>
  logs: Record<string, ResourceLogSnapshot>
  outputs: Record<string, string>
}

interface DiffPart {
  key: string
  text: string
  changed: boolean
  ellipsis?: boolean
}

interface StateDiffEntry {
  key: string
  step: number
  row: number
  rule: string
  stateBefore: string
  stateAfter: string
  before: DiffPart[]
  after: DiffPart[]
  resources: ResourceSnapshot
  error?: string
  note?: string
}

interface ChangedRange {
  start: number
  end: number
}

function extractResources(rules: string): ResourceUsage[] {
  const byName = new Map<string, ResourceUsage>()
  markResource(byName, 'stdin', 'read')
  markResource(byName, 'stdout', 'write')
  markResource(byName, 'stderr', 'write')
  for (const rawLine of rules.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    const line = rawLine.trim()
    if (!line) continue
    const read = rawLine.match(/::\s*<\s+\S+\s+\S+\s+(?:bytes|lines)\s+([A-Za-z_][A-Za-z0-9_-]*)\b/)
    if (read) markResource(byName, read[1], 'read')
    const write = rawLine.match(/::\s*>\s+([A-Za-z_][A-Za-z0-9_-]*)\b/)
    if (write) markResource(byName, write[1], 'write')
  }
  const stdioOrder = new Map([['stdout', 0], ['stdin', 1], ['stderr', 2]])
  return [...byName.values()].sort((a, b) => {
    const left = stdioOrder.get(a.name)
    const right = stdioOrder.get(b.name)
    if (left !== undefined || right !== undefined) return (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER)
    return 0
  })
}

function markResource(resources: Map<string, ResourceUsage>, name: string, mode: 'read' | 'write'): void {
  const current = resources.get(name) ?? { name, reads: false, writes: false }
  if (mode === 'read') current.reads = true
  else current.writes = true
  resources.set(name, current)
}

function mergeResourceSections(base: ResourceUsage[], loadedNames: string[]): ResourceUsage[] {
  const byName = new Map(base.map(resource => [resource.name, { ...resource }]))
  for (const name of loadedNames) {
    const current = byName.get(name) ?? { name, reads: false, writes: false }
    if (name === 'stdout' || name === 'stderr') current.writes = true
    else current.reads = true
    byName.set(name, current)
  }
  const stdioOrder = new Map([['stdout', 0], ['stdin', 1], ['stderr', 2]])
  return [...byName.values()].sort((a, b) => {
    const left = stdioOrder.get(a.name)
    const right = stdioOrder.get(b.name)
    if (left !== undefined || right !== undefined) return (left ?? Number.MAX_SAFE_INTEGER) - (right ?? Number.MAX_SAFE_INTEGER)
    return a.name.localeCompare(b.name)
  })
}

function setResourceInput(name: string, value: string): void {
  if ((resourceInputs.value[name] ?? '') === value) return
  resourceInputs.value = { ...resourceInputs.value, [name]: value }
  stateText.value = initialRuntimeState()
  clearRun()
  statusText.value = 'resource input edited; reset to initial state'
}

function initialRuntimeState(): string {
  if (selectedTestCase.value?.hasInput) return selectedTestCase.value.input
  return initialStateText.value
}

async function submitResource(name: string): Promise<void> {
  if (requestedResourceName.value !== name) return
  stopPendingCountdown()
  const value = resourceInputs.value[name] ?? ''
  resourceSubmittedInputs.value = { ...resourceSubmittedInputs.value, [name]: value === '' ? '\n' : value }
  if (lastRunMode.value === 'end') await endProgram()
  else if (lastRunMode.value === 'continue') await continueProgram()
  else await stepProgram()
}

function isResourceReady(name: string): boolean {
  return Object.prototype.hasOwnProperty.call(resourceSubmittedInputs.value, name)
}

async function focusResourceInput(name: string): Promise<void> {
  await nextTick()
  const input = document.querySelector(`[data-test="resource-input-${name}"]`) as HTMLTextAreaElement | null
  input?.focus()
}

function showResourceInput(resource: ResourceUsage): boolean {
  return resource.name === 'stdin' || resource.reads
}

function showResourceOutput(resource: ResourceUsage): boolean {
  return resource.name === 'stdout' || resource.name === 'stderr' || resource.writes
}

function resourceInputReadonly(_name: string): boolean {
  return isBusy.value
}

function resourceInputHelp(name: string): string {
  if (isBusy.value) return 'running; input is locked until the next pause'
  if (requestedResourceName.value === name) return 'program is waiting; submit one response'
  return 'preload input for the next run'
}

function resourceOutputText(name: string): string {
  return resourceOutputs.value[name] ?? ''
}

function resourceConfigs() {
  return resourceSections.value.map(resource => ({
    name: resource.name,
    inputText: resourceInputTextForRun(resource.name),
    lineMode: true,
    readError: undefined,
  }))
}

function resourceInputTextForRun(name: string): string {
  if (isResourceReady(name)) return submittedResourceInputText(name)
  return resourceInputs.value[name] ?? ''
}

function submittedResourceInputText(name: string): string {
  return resourceSubmittedInputs.value[name] ?? ''
}

function setRulesText(source: string): void {
  const split = splitProgramSource(source)
  rulesText.value = split.rules
  if (split.rules !== source || split.state !== '') initialStateText.value = split.state
  stateText.value = initialRuntimeState()
  loadError.value = split.error
  clearRun()
  persistChallengeAttempt()
  scheduleChallengeTestRun()
}

function setInitialStateText(state: string): void {
  initialStateText.value = state
  stateText.value = initialRuntimeState()
  loadError.value = ''
  clearRun()
  persistChallengeAttempt()
  scheduleChallengeTestRun()
}

function loadSource(source: string): void {
  const split = splitProgramSource(source)
  rulesText.value = split.rules
  initialStateText.value = split.state
  stateText.value = split.state
  loadError.value = split.error
  clearRun()
}

function loadFile(file: string): void {
  const normalized = normalizeFileParam(file)
  const source = examplesByPublicPath[normalized]
  selectedTestCase.value = undefined
  fileParam.value = normalized
  sourcePath.value = normalized.replace(/^\.\//, '')
  if (!source) {
    loadError.value = `No bundled example found for ${normalized}`
    rulesText.value = ''
    initialStateText.value = ''
    stateText.value = ''
    return
  }
  loadSource(source)
  resourceInputs.value = {}
  if (props.syncUrl) {
    const url = new URL(window.location.href)
    url.searchParams.set('file', normalized)
    window.history.replaceState({}, '', url)
  }
}

function seedStateFromSource(source = fullSourceText.value): void {
  setRulesText(source)
}

async function copyCurrentState(): Promise<void> {
  await navigator.clipboard?.writeText(stateText.value)
}

function selectTestCase(testCase: TestCaseOption): void {
  const file = `./${testCase.programPath}`
  loadFile(file)
  selectedTestCase.value = testCase
  if (testCase.hasInput) {
    initialStateText.value = testCase.input
    stateText.value = testCase.input
    clearRun()
  }
  resourceInputs.value = { ...resourceInputs.value, stdin: testCase.stdin ?? '' }
  if (props.syncUrl) {
    const url = new URL(window.location.href)
    url.searchParams.set('test', `./${testCase.manifestPath}`)
    url.searchParams.set('case', testCase.id.split('::').at(-1) ?? testCase.caseName)
    window.history.replaceState({}, '', url)
  }
}

async function runCurrentChallengeTests(): Promise<void> {
  await startVisibleChallengeTestRun()
}

function setChallengeTestsAuto(value: boolean): void {
  challengeTestsAuto.value = value
  persistChallengeTestsAuto(value)
  if (value) scheduleChallengeTestRun()
  else cancelPendingChallengeTestDebounce()
}

function scheduleChallengeTestRun(): void {
  if (!props.challenge || !challengeTestsAuto.value) return
  cancelPendingChallengeTestDebounce()
  challengeTestDebounceTimer = window.setTimeout(() => {
    challengeTestDebounceTimer = undefined
    void startVisibleChallengeTestRun()
  }, 300)
}

async function startVisibleChallengeTestRun(): Promise<void> {
  if (!props.challenge) return
  cancelPendingChallengeTestDebounce()
  abortChallengeTestRun()
  const runId = ++challengeTestRunId
  const controller = new AbortController()
  challengeTestAbortController = controller
  challengeTestsRunning.value = true
  challengeResults.value = []
  const results: ChallengeTestResult[] = []
  const fallbackState = initialStateText.value
  try {
    for (const testCase of props.challenge.tests) {
      if (controller.signal.aborted) throw abortError()
      const result = await runVisibleChallengeTest(testCase, fallbackState, controller.signal)
      if (runId !== challengeTestRunId || controller.signal.aborted) throw abortError()
      results.push(result)
      challengeResults.value = [...results]
      if (!result.passed) break
    }
  } catch (error) {
    if (!isAbortError(error)) throw error
  } finally {
    if (runId === challengeTestRunId) {
      challengeTestsRunning.value = false
      challengeTestAbortController = undefined
    }
  }
}

async function runVisibleChallengeTest(testCase: ChallengeTestCase, fallbackState: string, signal?: AbortSignal): Promise<ChallengeTestResult> {
  clearRun()
  currentChallengeTestMetrics.value = { stepCount: 0, evalCheckCount: 0, cumulativeStateBytes: 0 }
  sourcePath.value = `challenges/${props.challenge?.slug ?? 'current'}/attempt.tpp`
  stateText.value = testCase.resources.stdin?.buffer ?? fallbackState
  resourceInputs.value = Object.fromEntries(
    Object.entries(testCase.resources)
      .filter((entry): entry is [string, { buffer: string }] => typeof entry[1].buffer === 'string')
      .map(([name, resource]) => [name, resource.buffer]),
  )
  await nextTick()
  await continueProgram({ signal })
  if (signal?.aborted) throw abortError()
  return visibleChallengeTestResult(testCase)
}

function visibleChallengeTestResult(testCase: ChallengeTestCase): ChallengeTestResult {
  const actualExitCode = lastRunExitCode.value
  const missingExitCodeError = actualExitCode === undefined ? 'worker did not return exitCode' : undefined
  const exitCode = {
    expected: testCase.exit_code,
    actual: actualExitCode,
    passed: actualExitCode === testCase.exit_code,
  }
  const resources = expectedResources(testCase).map(({ name, expected }) => {
    const actual = resourceOutputText(name)
    return {
      name,
      expected,
      actual,
      passed: actual === expected,
    }
  })
  return {
    name: testCase.name,
    passed: exitCode.passed && resources.every(resource => resource.passed) && !lastRunError.value && !missingExitCodeError,
    exitCode,
    resources,
    metrics: {
      ruleCount: ruleCount.value,
      ...currentChallengeTestMetrics.value,
    },
    error: lastRunError.value ?? missingExitCodeError,
  }
}

function cancelPendingChallengeTestDebounce(): void {
  if (challengeTestDebounceTimer === undefined) return
  window.clearTimeout(challengeTestDebounceTimer)
  challengeTestDebounceTimer = undefined
}

function abortChallengeTestRun(): void {
  challengeTestAbortController?.abort()
  challengeTestAbortController = undefined
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

function abortError(): DOMException {
  return new DOMException('Challenge test run aborted', 'AbortError')
}
function initializeChallengeAttempt(): void {
  if (!props.challenge) return
  fileParam.value = `./challenges/${props.challenge.slug}/attempt.tpp`
  sourcePath.value = `challenges/${props.challenge.slug}/attempt.tpp`
  const storedAttempt = loadStoredChallengeAttempt()
  if (storedAttempt) {
    rulesText.value = storedAttempt.rules
    initialStateText.value = storedAttempt.initialState
    stateText.value = storedAttempt.initialState
  } else {
    rulesText.value = ''
    initialStateText.value = ''
    stateText.value = ''
  }
  loadError.value = ''
  clearRun()
  loadChallengeHintIfEditorEmpty()
}

function loadChallengeHintIfEditorEmpty(): void {
  if (!props.challenge?.hintSource) return
  if (rulesText.value.trim() !== '') return
  const split = splitProgramSource(props.challenge.hintSource)
  rulesText.value = split.rules
  initialStateText.value = split.state
  stateText.value = split.state
  loadError.value = split.error
  selectedTestCase.value = undefined
  resourceInputs.value = {}
  clearRun()
}

function clearRun(): void {
  stopPendingCountdown()
  running.value = false
  continuing.value = false
  pauseRequested.value = false
  statusText.value = 'idle'
  lastRunExitCode.value = undefined
  lastRunError.value = undefined
  resourceLogs.value = {}
  resourceOutputs.value = {}
  resourceAttention.value = {}
  resourceSubmittedInputs.value = {}
  clearDiffs()
}

function clearDiffs(): void {
  stopPendingCountdown()
  stateDiffs.value = []
  selectedHistoryKey.value = undefined
  terminalHistoryKey.value = undefined
  baseState.value = stateText.value
  matchedRuleLine.value = undefined
}

function cloneResourceLog(log: ResourceLogSnapshot): ResourceLogSnapshot {
  return {
    reads: [...log.reads],
    writes: [...log.writes],
    errors: [...log.errors],
    remainingInputText: log.remainingInputText,
    outputText: log.outputText,
  }
}

function cloneRecord(value: Record<string, string>): Record<string, string> {
  return { ...value }
}

function resourceSnapshot(): ResourceSnapshot {
  return {
    inputs: cloneRecord(resourceInputs.value),
    submittedInputs: cloneRecord(resourceSubmittedInputs.value),
    logs: Object.fromEntries(Object.entries(resourceLogs.value).map(([name, log]) => [name, cloneResourceLog(log)])),
    outputs: cloneRecord(resourceOutputs.value),
  }
}

function restoreResourceSnapshot(snapshot: ResourceSnapshot): void {
  resourceInputs.value = cloneRecord(snapshot.inputs)
  resourceSubmittedInputs.value = cloneRecord(snapshot.submittedInputs)
  resourceLogs.value = Object.fromEntries(Object.entries(snapshot.logs).map(([name, log]) => [name, cloneResourceLog(log)]))
  resourceOutputs.value = cloneRecord(snapshot.outputs)
  resourceAttention.value = {}
  stopPendingCountdown()
}

async function stepProgram(): Promise<void> {
  if (!canRun.value) return
  pauseRequested.value = false
  lastRunMode.value = 'step'
  await executeProgram({ stepLimit: 1, status: 'stepping', collectTrace: true })
}

async function continueProgram(options: { signal?: AbortSignal } = {}): Promise<void> {
  if (!canRun.value) return
  lastRunMode.value = 'continue'
  pauseRequested.value = false
  continuing.value = true
  try {
    let steps = 0
    while (!pauseRequested.value && steps < stepLimit.value) {
      if (options.signal?.aborted) throw abortError()
      const status = await executeProgram({ stepLimit: 1, status: 'running', collectTrace: true, signal: options.signal })
      if (status !== 'stepped') break
      steps += 1
      if (pauseRequested.value) break
      await waitForContinueDelay()
    }
    if (steps >= stepLimit.value && !pauseRequested.value) statusText.value = `paused at step limit ${stepLimit.value}`
  } finally {
    continuing.value = false
    if (pauseRequested.value) statusText.value = 'paused'
  }
}

async function endProgram(): Promise<void> {
  if (!canRun.value) return
  lastRunMode.value = 'end'
  pauseRequested.value = false
  await executeProgram({ stepLimit: stepLimit.value, status: 'ending', collectTrace: false, collapsedHistory: true })
}

function pauseProgram(): void {
  if (!continuing.value) return
  pauseRequested.value = true
  statusText.value = 'pausing'
}

async function restartProgram(): Promise<void> {
  if (isBusy.value) return
  if (stateDiffs.value.length > 0) selectHistoryEntry(stateDiffs.value[0].key)
  terminalHistoryKey.value = undefined
  await continueProgram()
}

type RunStatus = 'stepped' | 'exited' | 'waiting' | 'errored'

async function executeProgram(options: { stepLimit?: number; status: string; collectTrace?: boolean; collapsedHistory?: boolean; signal?: AbortSignal }): Promise<RunStatus | undefined> {
  if (running.value) return undefined
  if (stateDiffs.value.length === 0) {
    baseState.value = stateText.value
    appendInitialStateDiff(stateText.value)
  }
  pruneFutureHistory()
  running.value = true
  statusText.value = options.status
  resourceLogs.value = {}
  resourceAttention.value = {}
  const runState = stateText.value
  try {
    const result = await runWithWorker({
      sourceText: runnableRulesText.value,
      sourcePath: sourcePath.value,
      input: runState,
      evalLimit: evalLimit.value,
      maxStateBytes: 1_000_000,
      coverage: false,
      resources: resourceConfigs(),
      trace: options.collectTrace ?? options.stepLimit !== undefined,
      stepLimit: options.stepLimit,
      signal: options.signal,
    })
    const stderr = [...new Set([result.stderr, result.error, result.errors].filter(Boolean))].join('\n')
    lastRunExitCode.value = result.exitCode ?? (stderr ? 1 : undefined)
    lastRunError.value = stderr || undefined
    applyResourceLogs(result.resourceLogs ?? [], result.stdout ?? '', stderr)
    const resourcesAfterRun = resourceSnapshot()
    const nextState = result.state ?? result.trace?.at(-1)?.stateAfter
    if (nextState !== undefined) stateText.value = nextState
    const trace = result.trace ?? []
    currentChallengeTestMetrics.value = {
      stepCount: currentChallengeTestMetrics.value.stepCount + trace.length,
      evalCheckCount: currentChallengeTestMetrics.value.evalCheckCount + (result.evalCheckCount ?? 0),
      cumulativeStateBytes: currentChallengeTestMetrics.value.cumulativeStateBytes + (result.cumulativeStateBytes ?? traceStateBytes(trace)),
    }
    appendStateDiffs(trace, resourcesAfterRun)
    if (options.collapsedHistory) appendCollapsedEndDiff(runState, nextState ?? runState, resourcesAfterRun)
    const pendingResource = pendingInputResource(result)
    if (trace.length === 0 && stderr && !pendingResource) appendStepErrorDiff(stderr, runState, resourcesAfterRun)
    updateMatchedRuleLine(trace)
    if (pendingResource) {
      statusText.value = `waiting for ${pendingResource}`
      startPendingCountdown(pendingResource, pendingInputTimeoutSeconds(trace, pendingResource))
      activeSection.value = 'resources'
      await focusResourceInput(pendingResource)
      return 'waiting'
    } else {
      stopPendingCountdown()
      const stepped = options.stepLimit === 1 && trace.length > 0 && !result.exitCode && !stderr && !trace.some(event => event.exitCode !== undefined)
      if (stepped) {
        statusText.value = 'stepped'
        return 'stepped'
      }
      statusText.value = `exited ${result.exitCode ?? (stderr ? 1 : 0)}`
      terminalHistoryKey.value = selectedHistoryKey.value
      if (stderr) {
        activeSection.value = 'output'
        activeOutputTab.value = 'stderr'
      }
      return 'exited'
    }
  } catch (error) {
    if (isAbortError(error)) return undefined
    stopPendingCountdown()
    const stderr = error instanceof Error ? error.message : String(error)
    lastRunExitCode.value = undefined
    lastRunError.value = stderr
    const nextStderr = `${resourceOutputs.value.stderr ?? ''}${stderr}`
    resourceAttention.value = {}
    resourceOutputs.value = { ...resourceOutputs.value, stderr: nextStderr }
    statusText.value = 'errored'
    activeSection.value = 'output'
    activeOutputTab.value = 'stderr'
    return 'errored'
  } finally {
    running.value = false
  }
}

function waitForContinueDelay(): Promise<void> {
  const delayMs = continueDelayMs.value
  if (delayMs <= 0 || pauseRequested.value) return Promise.resolve()
  const end = Date.now() + delayMs
  return new Promise(resolve => {
    const tick = () => {
      if (pauseRequested.value || Date.now() >= end) resolve()
      else window.setTimeout(tick, 25)
    }
    tick()
  })
}

function traceStateBytes(trace: DemoTraceEvent[]): number {
  return trace.reduce((total, event) => total + escapedUtf8Bytes(event.stateBefore) + escapedUtf8Bytes(event.stateAfter), 0)
}

function escapedUtf8Bytes(value: string): number {
  return new TextEncoder().encode(value.replace(/\n/g, '\\n')).length
}

function appendCollapsedEndDiff(stateBefore: string, stateAfter: string, resources: ResourceSnapshot): void {
  const previousStep = Math.max(0, ...stateDiffs.value.map(entry => entry.step))
  const step = previousStep + 1
  const { before, after } = compactCharDiff(stateBefore, stateAfter)
  const entry = {
    key: `end-${step}`,
    step,
    row: 0,
    rule: 'end: skipped intermediate steps',
    stateBefore,
    stateAfter,
    before,
    after,
    resources,
    note: stateBefore === stateAfter ? 'no state change' : undefined,
  }
  stateDiffs.value = [...stateDiffs.value, entry]
  selectedHistoryKey.value = entry.key
}

function appendInitialStateDiff(state: string): void {
  const { before, after } = compactCharDiff('', state)
  stateDiffs.value = [{
    key: 'initial-0',
    step: 0,
    row: 0,
    rule: 'initial state',
    stateBefore: '',
    stateAfter: state,
    before,
    after,
    resources: resourceSnapshot(),
  }]
  selectedHistoryKey.value = 'initial-0'
}

function appendStateDiffs(trace: DemoTraceEvent[], resources: ResourceSnapshot): void {
  if (trace.length > 1) {
    appendMultiTraceCollapsedDiff(trace, resources)
    return
  }
  const entries = trace.flatMap((event, index) => stateDiffEntry(event, stateDiffs.value.length + index, resources))
  if (entries.length === 0) return
  stateDiffs.value = [...stateDiffs.value, ...entries]
  selectedHistoryKey.value = entries.at(-1)?.key
}

function appendMultiTraceCollapsedDiff(trace: DemoTraceEvent[], resources: ResourceSnapshot): void {
  const first = trace[0]
  const last = trace.at(-1)
  if (!first || !last) return
  const { before, after } = compactCharDiff(first.stateBefore, last.stateAfter)
  const entry = {
    key: `trace-${first.step}-${last.step}-${stateDiffs.value.length}`,
    step: last.step,
    row: last.lineNumber,
    rule: `${trace.length} traced steps collapsed`,
    stateBefore: first.stateBefore,
    stateAfter: last.stateAfter,
    before,
    after,
    resources,
    note: 'resource snapshot captured after the worker batch',
  }
  stateDiffs.value = [...stateDiffs.value, entry]
  selectedHistoryKey.value = entry.key
}

function appendStepErrorDiff(error: string, state: string, resources: ResourceSnapshot): void {
  const row = lineNumberFromError(error) ?? 1
  const rule = runnableRulesText.value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')[row - 1]?.trim() || '(no matching rule trace)'
  const step = stateDiffs.value.length
  const entry = {
    key: `error-${step}-${row}`,
    step,
    row,
    rule,
    stateBefore: state,
    stateAfter: state,
    before: [{ key: 'b-0', text: state, changed: false }],
    after: [{ key: 'a-0', text: state, changed: false }],
    resources,
    error,
  }
  stateDiffs.value = [...stateDiffs.value, entry]
  selectedHistoryKey.value = entry.key
}

function pruneFutureHistory(): void {
  const index = selectedHistoryCursor.value
  if (index >= 0 && index < stateDiffs.value.length - 1) {
    const kept = stateDiffs.value.slice(0, index + 1)
    stateDiffs.value = kept
    if (terminalHistoryKey.value && !kept.some(entry => entry.key === terminalHistoryKey.value)) {
      terminalHistoryKey.value = undefined
    }
  }
}

function selectHistoryEntry(key: string): void {
  const entry = stateDiffs.value.find(item => item.key === key)
  if (!entry) return
  selectedHistoryKey.value = entry.key
  stateText.value = entry.stateAfter
  restoreResourceSnapshot(entry.resources)
  matchedRuleLine.value = entry.row > 0 ? entry.row : undefined
}

function resetToFirstState(): void {
  if (!canReset.value) return
  selectHistoryEntry(stateDiffs.value[0].key)
}

function undoStep(): void {
  if (!canUndo.value) return
  selectHistoryEntry(stateDiffs.value[selectedHistoryCursor.value - 1].key)
}

function lineNumberFromError(error: string): number | undefined {
  const match = error.match(/(?:^|\n)Line (\d+):/)
  if (!match) return undefined
  const row = Number.parseInt(match[1], 10)
  return Number.isFinite(row) && row > 0 ? row : undefined
}

function updateMatchedRuleLine(trace: DemoTraceEvent[]): void {
  const cleanSourcePath = sourcePath.value.replace(/^\.\//, '')
  const event = [...trace].reverse().find(item => item.sourcePath.replace(/^\.\//, '') === cleanSourcePath)
  matchedRuleLine.value = event?.lineNumber
}

function stateDiffEntry(event: DemoTraceEvent, index: number, resources: ResourceSnapshot): StateDiffEntry[] {
  const error = event.error
  const note = !error && event.stateBefore === event.stateAfter ? stateHistoryNote(event) : undefined
  const { before, after } = compactCharDiff(event.stateBefore, event.stateAfter)
  return [{
    key: `${event.step}-${event.lineNumber}-${index}`,
    step: event.step,
    row: event.lineNumber,
    rule: ruleTextForEvent(event),
    stateBefore: event.stateBefore,
    stateAfter: event.stateAfter,
    before,
    after,
    resources,
    error,
    note,
  }]
}

function stateHistoryNote(event: DemoTraceEvent): string | undefined {
  if (event.exitCode !== undefined) return `exit ${event.exitCode}`
  return 'matched without state change'
}

function ruleTextForEvent(event: DemoTraceEvent): string {
  const source = sourceTextForTraceEvent(event)
  const line = source?.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')[event.lineNumber - 1]?.trim()
  if (line) return line
  return `${event.lhs} ${event.operator} ${event.replacement}`.trim()
}

function sourceTextForTraceEvent(event: DemoTraceEvent): string | undefined {
  const cleanEventPath = event.sourcePath.replace(/^\.\//, '')
  const cleanSourcePath = sourcePath.value.replace(/^\.\//, '')
  if (cleanEventPath === cleanSourcePath) return rulesText.value
  return repoFiles[cleanEventPath]
}

function compactCharDiff(before: string, after: string): { before: DiffPart[]; after: DiffPart[] } {
  const ranges = changedRanges(before, after)
  const compactBefore = compactAroundRange(before, ranges.before)
  const compactAfter = compactAroundRange(after, ranges.after)
  const parts = diffChars(compactBefore.text, compactAfter.text)
  return {
    before: parts
      .filter(part => !part.added)
      .flatMap((part, index) => splitEllipsisPart(part.value, Boolean(part.removed), `b-${index}`)),
    after: parts
      .filter(part => !part.removed)
      .flatMap((part, index) => splitEllipsisPart(part.value, Boolean(part.added), `a-${index}`)),
  }
}

function changedRanges(before: string, after: string): { before: ChangedRange; after: ChangedRange } {
  const parts = diffChars(before, after)
  let beforeCursor = 0
  let afterCursor = 0
  let beforeStart = before.length
  let beforeEnd = 0
  let afterStart = after.length
  let afterEnd = 0
  for (const part of parts) {
    const length = [...part.value].length
    if (part.removed) {
      beforeStart = Math.min(beforeStart, beforeCursor)
      beforeEnd = Math.max(beforeEnd, beforeCursor + length)
      afterStart = Math.min(afterStart, afterCursor)
      afterEnd = Math.max(afterEnd, afterCursor)
      beforeCursor += length
    } else if (part.added) {
      beforeStart = Math.min(beforeStart, beforeCursor)
      beforeEnd = Math.max(beforeEnd, beforeCursor)
      afterStart = Math.min(afterStart, afterCursor)
      afterEnd = Math.max(afterEnd, afterCursor + length)
      afterCursor += length
    } else {
      beforeCursor += length
      afterCursor += length
    }
  }
  return {
    before: normalizeRange(beforeStart, beforeEnd, before.length),
    after: normalizeRange(afterStart, afterEnd, after.length),
  }
}

function normalizeRange(start: number, end: number, length: number): ChangedRange {
  if (start <= end && start <= length) return { start, end }
  return { start: 0, end: length }
}

function compactAroundRange(value: string, range: ChangedRange): { text: string } {
  const chars = [...value]
  const context = 48
  const maxLength = context * 2 + Math.max(1, range.end - range.start) + 2
  if (chars.length <= maxLength) return { text: value }
  const start = Math.max(0, range.start - context)
  const end = Math.min(chars.length, range.end + context)
  return { text: `${start > 0 ? '…' : ''}${chars.slice(start, end).join('')}${end < chars.length ? '…' : ''}` }
}

function splitEllipsisPart(text: string, changed: boolean, keyPrefix: string): DiffPart[] {
  const chunks = text.split(/(…)/u).filter(chunk => chunk.length > 0)
  return chunks.map((chunk, index) => ({
    key: `${keyPrefix}-${index}`,
    text: chunk,
    changed: changed && chunk !== '…',
    ellipsis: chunk === '…',
  }))
}

function pendingInputResource(result?: { error?: string; errors?: string }): string {
  const text = [result?.error ?? '', result?.errors ?? '', ...Object.values(resourceLogs.value).flatMap(log => log.errors)].join('\n')
  const match = text.match(/WAIT:resource:([A-Za-z_][A-Za-z0-9_-]*):pending_input|pending_input:([A-Za-z_][A-Za-z0-9_-]*)/)
  return match?.[1] ?? match?.[2] ?? ''
}

function pendingInputTimeoutSeconds(trace: DemoTraceEvent[], resourceName: string): number | undefined {
  const event = [...trace].reverse().find(item => item.error?.includes(`WAIT:resource:${resourceName}:pending_input`) || item.error?.includes(`pending_input:${resourceName}`))
  if (!event) return undefined
  const rule = ruleTextForEvent(event)
  const escapedName = resourceName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const match = rule.match(new RegExp(`::<\\s+([1-9][0-9]*(?:ms|s|m))\\s+\\S+\\s+(?:bytes|lines)\\s+${escapedName}\\b`))
  if (!match) return undefined
  return durationSeconds(match[1])
}

function durationSeconds(token: string): number | undefined {
  const match = token.match(/^([1-9][0-9]*)(ms|s|m)$/)
  if (!match) return undefined
  const amount = Number.parseInt(match[1], 10)
  if (!Number.isFinite(amount) || amount <= 0) return undefined
  if (match[2] === 'ms') return amount / 1000
  if (match[2] === 's') return amount
  if (match[2] === 'm') return amount * 60
  return undefined
}

function countdownForResource(name: string): number | undefined {
  return pendingResourceName.value === name ? pendingResourceCountdownSeconds.value : undefined
}

function startPendingCountdown(name: string, timeoutSeconds?: number): void {
  stopPendingCountdown()
  pendingResourceName.value = name
  pendingResourceTimeoutSeconds.value = timeoutSeconds
  if (timeoutSeconds === undefined) return
  const deadline = Date.now() + Math.ceil(timeoutSeconds * 1000)
  pendingResourceDeadlineMs.value = deadline
  pendingResourceCountdownSeconds.value = Math.max(0, Math.ceil((deadline - Date.now()) / 1000))
  pendingResourceTimer = window.setInterval(() => {
    updatePendingCountdown()
  }, 250)
}

function updatePendingCountdown(): void {
  if (!pendingResourceName.value || pendingResourceTimeoutSeconds.value === undefined || pendingResourceDeadlineMs.value === undefined) return
  const end = pendingResourceDeadlineMs.value
  const remaining = Math.max(0, Math.ceil((end - Date.now()) / 1000))
  pendingResourceCountdownSeconds.value = remaining
  if (remaining > 0) return
  const name = pendingResourceName.value
  void submitResource(name)
}

function stopPendingCountdown(): void {
  if (pendingResourceTimer) {
    window.clearInterval(pendingResourceTimer)
    pendingResourceTimer = undefined
  }
  pendingResourceName.value = ''
  pendingResourceTimeoutSeconds.value = undefined
  pendingResourceCountdownSeconds.value = undefined
  pendingResourceDeadlineMs.value = undefined
}

function applyResourceLogs(logs: Array<{ name: string; reads?: string[]; writes?: string[]; errors?: string[]; remainingInputText?: string; outputText?: string }>, stdout: string, stderr: string): void {
  const nextLogs: Record<string, ResourceLogSnapshot> = {}
  const nextInputs = { ...resourceInputs.value }
  const nextSubmittedInputs = { ...resourceSubmittedInputs.value }
  const nextOutputs: Record<string, string> = { ...resourceOutputs.value }
  for (const log of logs) {
    const normalized = {
      reads: log.reads ?? [],
      writes: log.writes ?? [],
      errors: log.errors ?? [],
      remainingInputText: log.remainingInputText,
      outputText: log.outputText,
    }
    nextLogs[log.name] = normalized
    if (log.remainingInputText !== undefined && (Object.prototype.hasOwnProperty.call(nextSubmittedInputs, log.name) || normalized.reads.length > 0)) {
      nextSubmittedInputs[log.name] = log.remainingInputText
    }
    const outputText = log.outputText ?? (normalized.writes.length > 0 ? normalized.writes.join('') : undefined)
    if (outputText !== undefined) nextOutputs[log.name] = `${nextOutputs[log.name] ?? ''}${outputText}`
  }
  const hasStdoutLog = logs.some(log => log.name === 'stdout' && (Boolean(log.outputText) || (log.writes?.length ?? 0) > 0))
  const hasStderrLog = logs.some(log => log.name === 'stderr' && (Boolean(log.outputText) || (log.writes?.length ?? 0) > 0))
  if (stdout && !hasStdoutLog) nextOutputs.stdout = `${nextOutputs.stdout ?? ''}${stdout}`
  if (stderr && !hasStderrLog) nextOutputs.stderr = appendErrorTranscript(nextOutputs.stderr ?? '', stderr)
  const inputAttention = changedResourceInputs(resourceInputs.value, nextInputs)
  const outputAttention = changedResourceOutputs(resourceOutputs.value, nextOutputs)
  resourceAttention.value = { ...inputAttention, ...outputAttention }
  resourceLogs.value = nextLogs
  resourceInputs.value = nextInputs
  resourceSubmittedInputs.value = nextSubmittedInputs
  resourceOutputs.value = nextOutputs
}

function changedResourceInputs(
  previousInputs: Record<string, string>,
  nextInputs: Record<string, string>,
): Record<string, 'input'> {
  const attention: Record<string, 'input'> = {}
  for (const [name, next] of Object.entries(nextInputs)) {
    if ((previousInputs[name] ?? '') !== next) attention[name] = 'input'
  }
  return attention
}

function changedResourceOutputs(
  previousOutputs: Record<string, string>,
  nextOutputs: Record<string, string>,
): Record<string, 'output'> {
  const attention: Record<string, 'output'> = {}
  for (const [name, next] of Object.entries(nextOutputs)) {
    if ((previousOutputs[name] ?? '') !== next) attention[name] = 'output'
  }
  return attention
}

function appendErrorTranscript(current: string, next: string): string {
  if (!current) return next
  if (current.endsWith('\n') || next.startsWith('\n')) return `${current}${next}`
  return `${current}\n${next}`
}


async function runCompactProgram(): Promise<void> {
  if (compactControls.value === 'run') await endProgram()
  else await continueProgram()
}

function loadInitialSelection(): void {
  const testParam = props.test ?? routeSearchParams.get('test')
  const caseParam = props.caseName ?? routeSearchParams.get('case')
  if (props.challenge) {
    initializeChallengeAttempt()
    return
  }
  loadFile(fileParam.value)
  if (!testParam && !caseParam) return
  const cleanTest = testParam?.replace(/^\.\//, '')
  const match = testCaseOptions.find(option => {
    const manifestMatches = cleanTest ? option.manifestPath === cleanTest : true
    const caseMatches = caseParam ? option.caseName === caseParam || option.id.endsWith(`::${caseParam}`) : true
    return manifestMatches && caseMatches
  })
  if (match) selectTestCase(match)
}

loadInitialSelection()

</script>
