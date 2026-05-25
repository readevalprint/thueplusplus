<template>
  <main class="playground-route">
    <header class="playground-route-header">
      <h1>THUE++ Playground</h1>
      <TestCaseCommand :options="testCaseOptions" @select="selectTestCase" />
    </header>

    <p v-if="loadError" class="error-text">{{ loadError }}</p>

    <ResizablePanelGroup direction="horizontal" class="playground-layout" auto-save-id="playground-columns">
      <ResizablePanel :default-size="42" :min-size="24" class="playground-column playground-rules-column">
        <Card class="playground-rules-pane">
          <CardHeader>
            <CardTitle>program rules</CardTitle>
            <div class="playground-rules-toolbar">
              <Button type="button" variant="secondary" size="sm" data-test="playground-undo" :disabled="isBusy || !canUndo" title="Undo" @click="undoStep">
                <svg class="toolbar-icon" aria-hidden="true" viewBox="0 0 320 512">
                  <path d="M267.5 440.6c9.5 7.9 22.8 9.7 34.1 4.4s18.4-16.6 18.4-29l0-320c0-12.4-7.2-23.7-18.4-29s-24.5-3.6-34.1 4.4l-192 160L64 241 64 96c0-17.7-14.3-32-32-32S0 78.3 0 96L0 416c0 17.7 14.3 32 32 32s32-14.3 32-32l0-145 11.5 9.6 192 160z" />
                </svg>
                Undo
              </Button>
              <Button type="button" variant="secondary" size="sm" data-test="playground-step" :disabled="!canRun" :title="stepTitle" @click="() => stepProgram()">
                <svg class="toolbar-icon" aria-hidden="true" viewBox="0 0 320 512">
                  <path d="M52.5 440.6c-9.5 7.9-22.8 9.7-34.1 4.4S0 428.4 0 416L0 96C0 83.6 7.2 72.3 18.4 67s24.5-3.6 34.1 4.4l192 160L256 241l0-145c0-17.7 14.3-32 32-32s32 14.3 32 32l0 320c0 17.7-14.3 32-32 32s-32-14.3-32-32l0-145-11.5 9.6-192 160z" />
                </svg>
                Step
              </Button>
              <ButtonGroup class="continue-speed-group">
                <Button type="button" variant="secondary" size="sm" data-test="playground-continue" :disabled="!canRun" :title="continueTitle" @click="() => continueProgram()">
                  <svg class="toolbar-icon" aria-hidden="true" viewBox="0 0 384 512">
                    <path d="M73 39c-14.8-9.1-33.4-9.4-48.5-.9S0 62.6 0 80L0 432c0 17.4 9.4 33.4 24.5 41.9s33.7 8.1 48.5-.9L361 297c14.3-8.7 23-24.2 23-41s-8.7-32.2-23-41L73 39z" />
                  </svg>
                  Continue
                </Button>
                <Select v-model="continueSpeed" :disabled="isBusy">
                  <SelectTrigger class="continue-speed-trigger" data-test="playground-continue-speed" title="Continue speed" aria-label="Continue speed">
                    {{ continueSpeedLabel }}
                  </SelectTrigger>
                  <SelectContent class="continue-speed-content" align="end" :side-offset="4">
                    <SelectItem v-for="option in continueSpeedOptions" :key="option.value" :value="option.value">
                      {{ option.label }}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </ButtonGroup>
              <Button type="button" variant="secondary" size="sm" data-test="playground-pause" :disabled="!continuing" title="Pause" @click="pauseProgram">
                <svg class="toolbar-icon" aria-hidden="true" viewBox="0 0 320 512">
                  <path d="M48 64C21.5 64 0 85.5 0 112L0 400c0 26.5 21.5 48 48 48l32 0c26.5 0 48-21.5 48-48l0-288c0-26.5-21.5-48-48-48L48 64zm192 0c-26.5 0-48 21.5-48 48l0 288c0 26.5 21.5 48 48 48l32 0c26.5 0 48-21.5 48-48l0-288c0-26.5-21.5-48-48-48l-32 0z" />
                </svg>
                Pause
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <RulesMonacoEditor v-model="rulesText" :highlight-line="matchedRuleLine" data-test="playground-rules" />
          </CardContent>
        </Card>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel :default-size="29" :min-size="20" class="playground-column playground-state-column">
        <ResizablePanelGroup direction="vertical" class="playground-state-stack" data-test="playground-state-stack" auto-save-id="playground-state-rows">
          <ResizablePanel :default-size="58" :min-size="24" class="playground-row playground-state-row">
            <Card class="playground-state-pane">
              <CardHeader><CardTitle>program state</CardTitle></CardHeader>
              <CardContent>
                <Textarea v-model="stateText" class="state-editor" data-test="playground-state" spellcheck="false" wrap="soft" @input="clearDiffs" />
              </CardContent>
            </Card>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel :default-size="42" :min-size="18" class="playground-row playground-timeline-row">
            <Card class="playground-diffs-pane">
              <CardHeader><CardTitle>timeline</CardTitle></CardHeader>
              <CardContent>
                <StateDiffs :entries="stateDiffs" :selected-key="selectedHistoryKey" @select="selectHistoryEntry" />
              </CardContent>
            </Card>
          </ResizablePanel>
        </ResizablePanelGroup>
      </ResizablePanel>

      <ResizableHandle />

      <ResizablePanel :default-size="29" :min-size="20" class="playground-column playground-resources-column">
        <Card class="playground-resources-pane" data-test="resource-sections">
          <CardHeader>
            <CardTitle>resources</CardTitle>
            <span class="run-status" data-test="playground-status">{{ statusText }}</span>
          </CardHeader>
          <CardContent class="resource-list">
            <ResourceSection
              v-for="resource in resourceSections"
              :key="resource.name"
              :resource="resource"
              :input="resourceInputs[resource.name] ?? ''"
              :output="resourceOutputText(resource.name)"
              :attention="resourceAttention[resource.name]"
              :running="isBusy"
              :can-submit="requestedResourceName === resource.name"
              :show-input="showResourceInput(resource)"
              :show-output="showResourceOutput(resource)"
              @update:input="setResourceInput(resource.name, $event)"
              @submit="submitResource(resource.name)"
            />
          </CardContent>
        </Card>
      </ResizablePanel>
    </ResizablePanelGroup>
  </main>
</template>

<script setup lang="ts">
import { diffChars } from 'diff'
import { computed, nextTick, ref } from 'vue'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ButtonGroup } from '@/components/ui/button-group'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import ResourceSection from './ResourceSection.vue'
import RulesMonacoEditor from './RulesMonacoEditor.vue'
import StateDiffs from './StateDiffs.vue'
import TestCaseCommand from './TestCaseCommand.vue'
import { flattenTestManifests, type TestCaseOption } from './testCases'
import { splitProgramSource } from './thueSource'
import { runWithWorker, type DemoTraceEvent } from './wasm'

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
const initialFile = normalizeFileParam(new URLSearchParams(window.location.search).get('file'))

type ContinueSpeed = 'slow' | 'medium' | 'fast'

const continueSpeedOptions: Array<{ value: ContinueSpeed; label: string; delayMs: number }> = [
  { value: 'slow', label: 'slow · 1/s', delayMs: 1000 },
  { value: 'medium', label: 'medium · 10/s', delayMs: 100 },
  { value: 'fast', label: 'fast · no pause', delayMs: 0 },
]

const fileParam = ref(initialFile)
const sourcePath = ref(initialFile.replace(/^\.\//, ''))
const rulesText = ref('')
const stateText = ref('')
const resourceInputs = ref<Record<string, string>>({})
const resourceSubmittedInputs = ref<Record<string, string>>({})
const resourceLogs = ref<Record<string, { reads: string[]; writes: string[]; errors: string[]; remainingInputText?: string; outputText?: string }>>({})
const resourceOutputs = ref<Record<string, string>>({})
const resourceAttention = ref<Record<string, 'input' | 'output'>>({})
const loadError = ref('')
const running = ref(false)
const continuing = ref(false)
const pauseRequested = ref(false)
const statusText = ref('idle')
const stateDiffs = ref<StateDiffEntry[]>([])
const selectedHistoryKey = ref<string | undefined>()
const baseState = ref('')
const lastRunMode = ref<'step' | 'continue'>('step')
const continueSpeed = ref<ContinueSpeed>('medium')
const exitedState = ref<string | undefined>()
const matchedRuleLine = ref<number | undefined>()

const resourceSections = computed(() => extractResources(rulesText.value))
const canUndo = computed(() => stateDiffs.value.length > 0 && selectedHistoryKey.value !== '__base__')
const isBusy = computed(() => running.value || continuing.value)
const hasExitedCurrentState = computed(() => exitedState.value === stateText.value)
const canRun = computed(() => !isBusy.value && !hasExitedCurrentState.value)
const requestedResourceName = computed(() => statusText.value.match(/^waiting for ([A-Za-z_][A-Za-z0-9_-]*)$/)?.[1])
const stepTitle = computed(() => hasExitedCurrentState.value ? 'Program exited. Change state or select an earlier timeline row to step.' : 'Step')
const continueTitle = computed(() => hasExitedCurrentState.value ? 'Program exited. Change state or select an earlier timeline row to continue.' : 'Continue')
const continueSpeedLabel = computed(() => continueSpeedOptions.find(option => option.value === continueSpeed.value)?.label ?? 'medium · 10/s')
const continueDelayMs = computed(() => continueSpeedOptions.find(option => option.value === continueSpeed.value)?.delayMs ?? 100)

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
    const read = rawLine.match(/::\s*<\s+\S+\s+([A-Za-z_][A-Za-z0-9_-]*)\b/)
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

function setResourceInput(name: string, value: string): void {
  resourceInputs.value = { ...resourceInputs.value, [name]: value }
  const { [name]: _removed, ...remainingSubmitted } = resourceSubmittedInputs.value
  resourceSubmittedInputs.value = remainingSubmitted
}

async function submitResource(name: string): Promise<void> {
  if (requestedResourceName.value !== name) return
  const value = resourceInputs.value[name] ?? ''
  resourceSubmittedInputs.value = { ...resourceSubmittedInputs.value, [name]: value }
  if (lastRunMode.value === 'continue') await continueProgram()
  else await stepProgram()
}

function isResourceReady(name: string): boolean {
  return (resourceSubmittedInputs.value[name] ?? '').length > 0
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

function resourceOutputText(name: string): string {
  return resourceOutputs.value[name] ?? ''
}

function resourceConfigs() {
  return resourceSections.value.map(resource => ({
    name: resource.name,
    inputText: isResourceReady(resource.name) ? (resourceSubmittedInputs.value[resource.name] ?? '') : '',
    readError: undefined,
  }))
}

function loadFile(file: string): void {
  const normalized = normalizeFileParam(file)
  const source = examplesByPublicPath[normalized]
  fileParam.value = normalized
  sourcePath.value = normalized.replace(/^\.\//, '')
  if (!source) {
    loadError.value = `No bundled example found for ${normalized}`
    rulesText.value = ''
    stateText.value = ''
    return
  }
  const split = splitProgramSource(source)
  rulesText.value = split.rules
  stateText.value = split.state
  loadError.value = split.error
  clearRun()
  resourceInputs.value = {}
  const url = new URL(window.location.href)
  url.searchParams.set('file', normalized)
  window.history.replaceState({}, '', url)
}

function selectTestCase(testCase: TestCaseOption): void {
  const file = `./${testCase.programPath}`
  loadFile(file)
  stateText.value = testCase.input
  resourceInputs.value = { ...resourceInputs.value, stdin: testCase.stdin ?? '' }
  const url = new URL(window.location.href)
  url.searchParams.set('test', `./${testCase.manifestPath}`)
  url.searchParams.set('case', testCase.id.split('::').at(-1) ?? testCase.caseName)
  window.history.replaceState({}, '', url)
}

function clearRun(): void {
  running.value = false
  continuing.value = false
  pauseRequested.value = false
  statusText.value = 'idle'
  resourceLogs.value = {}
  resourceOutputs.value = {}
  resourceAttention.value = {}
  resourceSubmittedInputs.value = {}
  clearDiffs()
}

function clearDiffs(): void {
  stateDiffs.value = []
  selectedHistoryKey.value = undefined
  baseState.value = stateText.value
  exitedState.value = undefined
  matchedRuleLine.value = undefined
}

async function stepProgram(): Promise<void> {
  if (!canRun.value) return
  pauseRequested.value = false
  lastRunMode.value = 'step'
  await executeProgram({ stepLimit: 1, status: 'stepping', collectTrace: true })
}

async function continueProgram(): Promise<void> {
  if (!canRun.value) return
  lastRunMode.value = 'continue'
  pauseRequested.value = false
  continuing.value = true
  try {
    while (!hasExitedCurrentState.value && !pauseRequested.value) {
      const status = await executeProgram({ stepLimit: 1, status: 'running', collectTrace: true })
      if (status !== 'stepped') break
      if (pauseRequested.value) break
      await waitForContinueDelay()
    }
  } finally {
    continuing.value = false
    if (pauseRequested.value && !hasExitedCurrentState.value) statusText.value = 'paused'
  }
}

function pauseProgram(): void {
  if (!continuing.value) return
  pauseRequested.value = true
  statusText.value = 'pausing'
}

type RunStatus = 'stepped' | 'exited' | 'waiting' | 'errored'

async function executeProgram(options: { stepLimit?: number; status: string; collectTrace?: boolean }): Promise<RunStatus | undefined> {
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
      sourceText: rulesText.value,
      sourcePath: sourcePath.value,
      input: runState,
      maxEvals: 10_000,
      maxStateBytes: 1_000_000,
      coverage: false,
      resources: resourceConfigs(),
      trace: options.collectTrace ?? options.stepLimit !== undefined,
      stepLimit: options.stepLimit,
    })
    const stderr = [...new Set([result.stderr, result.error, result.errors].filter(Boolean))].join('\n')
    applyResourceLogs(result.resourceLogs ?? [], result.stdout ?? '', stderr)
    const nextState = result.state ?? result.trace?.at(-1)?.stateAfter
    if (nextState !== undefined) stateText.value = nextState
    const trace = result.trace ?? []
    appendStateDiffs(trace)
    const pendingResource = pendingInputResource(result)
    if (trace.length === 0 && stderr && !pendingResource) appendStepErrorDiff(stderr, runState)
    updateMatchedRuleLine(trace)
    if (pendingResource) {
      statusText.value = `waiting for ${pendingResource}`
      await focusResourceInput(pendingResource)
      return 'waiting'
    } else {
      const stepped = options.stepLimit === 1 && trace.length > 0 && !result.exitCode && !stderr && !trace.some(event => event.exitCode !== undefined)
      if (stepped) {
        statusText.value = 'stepped'
        return 'stepped'
      }
      statusText.value = `exited ${result.exitCode ?? (stderr ? 1 : 0)}`
      exitedState.value = stateText.value
      return 'exited'
    }
  } catch (error) {
    const stderr = error instanceof Error ? error.message : String(error)
    const nextStderr = `${resourceOutputs.value.stderr ?? ''}${stderr}`
    resourceAttention.value = nextStderr !== (resourceOutputs.value.stderr ?? '') ? { stderr: 'output' } : {}
    resourceOutputs.value = { ...resourceOutputs.value, stderr: nextStderr }
    statusText.value = 'errored'
    exitedState.value = stateText.value
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
  }]
  selectedHistoryKey.value = 'initial-0'
}

function appendStateDiffs(trace: DemoTraceEvent[]): void {
  const entries = trace.flatMap((event, index) => stateDiffEntry(event, stateDiffs.value.length + index))
  if (entries.length === 0) return
  stateDiffs.value = [...stateDiffs.value, ...entries]
  selectedHistoryKey.value = entries.at(-1)?.key
}

function appendStepErrorDiff(error: string, state: string): void {
  const row = lineNumberFromError(error) ?? 1
  const rule = rulesText.value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')[row - 1]?.trim() || '(no matching rule trace)'
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
    error,
  }
  stateDiffs.value = [...stateDiffs.value, entry]
  selectedHistoryKey.value = entry.key
}

function selectedHistoryIndex(): number {
  return stateDiffs.value.findIndex(entry => entry.key === selectedHistoryKey.value)
}

function pruneFutureHistory(): void {
  if (selectedHistoryKey.value === '__base__') {
    stateDiffs.value = []
    selectedHistoryKey.value = undefined
    return
  }
  const index = selectedHistoryIndex()
  if (index >= 0 && index < stateDiffs.value.length - 1) {
    stateDiffs.value = stateDiffs.value.slice(0, index + 1)
  }
}

function selectHistoryEntry(key: string): void {
  const entry = stateDiffs.value.find(item => item.key === key)
  if (!entry) return
  selectedHistoryKey.value = entry.key
  stateText.value = entry.stateAfter
  matchedRuleLine.value = entry.row > 0 ? entry.row : undefined
  exitedState.value = undefined
  statusText.value = entry.step === 0 ? 'checkpoint initial' : `checkpoint #${entry.step}`
}

function undoStep(): void {
  if (!canUndo.value) return
  const index = selectedHistoryIndex() >= 0 ? selectedHistoryIndex() : stateDiffs.value.length - 1
  const previous = index - 1
  if (previous >= 0) {
    selectHistoryEntry(stateDiffs.value[previous].key)
    return
  }
  selectedHistoryKey.value = '__base__'
  stateText.value = baseState.value
  matchedRuleLine.value = undefined
  exitedState.value = undefined
  statusText.value = 'checkpoint initial'
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

function stateDiffEntry(event: DemoTraceEvent, index: number): StateDiffEntry[] {
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
  const match = text.match(/pending_input:([A-Za-z_][A-Za-z0-9_-]*)/)
  return match?.[1] ?? ''
}

function applyResourceLogs(logs: Array<{ name: string; reads?: string[]; writes?: string[]; errors?: string[]; remainingInputText?: string; outputText?: string }>, stdout: string, stderr: string): void {
  const nextLogs: Record<string, { reads: string[]; writes: string[]; errors: string[]; remainingInputText?: string; outputText?: string }> = {}
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
    if (log.remainingInputText !== undefined && (nextSubmittedInputs[log.name] ?? '').length > 0) {
      nextInputs[log.name] = log.remainingInputText
      nextSubmittedInputs[log.name] = log.remainingInputText
    }
    const outputText = log.outputText ?? (normalized.writes.length > 0 ? normalized.writes.join('') : undefined)
    if (outputText !== undefined) nextOutputs[log.name] = `${nextOutputs[log.name] ?? ''}${outputText}`
  }
  const hasStdoutLog = logs.some(log => log.name === 'stdout' && (Boolean(log.outputText) || (log.writes?.length ?? 0) > 0))
  const hasStderrLog = logs.some(log => log.name === 'stderr' && (Boolean(log.outputText) || (log.writes?.length ?? 0) > 0))
  if (stdout && !hasStdoutLog) nextOutputs.stdout = `${nextOutputs.stdout ?? ''}${stdout}`
  if (stderr && !hasStderrLog) nextOutputs.stderr = appendErrorTranscript(nextOutputs.stderr ?? '', stderr)
  resourceAttention.value = changedResourceTextareas(resourceInputs.value, nextInputs, resourceOutputs.value, nextOutputs)
  resourceLogs.value = nextLogs
  resourceInputs.value = nextInputs
  resourceSubmittedInputs.value = nextSubmittedInputs
  resourceOutputs.value = nextOutputs
}

function changedResourceTextareas(
  previousInputs: Record<string, string>,
  nextInputs: Record<string, string>,
  previousOutputs: Record<string, string>,
  nextOutputs: Record<string, string>,
): Record<string, 'input' | 'output'> {
  const attention: Record<string, 'input' | 'output'> = {}
  for (const [name, next] of Object.entries(nextInputs)) {
    if ((previousInputs[name] ?? '') !== next) attention[name] = 'input'
  }
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

loadFile(fileParam.value)
</script>
