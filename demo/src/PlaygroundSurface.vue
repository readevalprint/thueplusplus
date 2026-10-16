<template>
  <div class="bg-void text-bone flex h-dvh flex-col overflow-hidden font-mono" data-test="playground-standalone" :data-chrome="props.chrome">
    <SiteHeader v-if="props.chrome === 'page'" />
    <div data-test="playground-toolbar" role="toolbar" aria-label="Playground" class="border-line relative z-20 flex shrink-0 flex-wrap items-center gap-1 border-b px-1.5 py-1.5 text-[13px] min-[720px]:gap-2 min-[720px]:px-3">
      <div class="relative shrink-0" data-test="playground-examples">
        <Button type="button" variant="outline" class="max-[719px]:h-8 max-[719px]:px-2" data-test="playground-examples-trigger" :aria-expanded="examplesOpen" @click="examplesOpen = !examplesOpen">examples</Button>
        <div v-show="examplesOpen" class="border-line bg-surface absolute top-full left-0 z-30 mt-1 max-h-[70vh] w-[min(100vw-2rem,22rem)] overflow-y-auto border">
          <TestCaseMenu :options="testCaseOptions" @select="selectTestCase" />
        </div>
      </div>
      <div class="relative shrink-0" data-test="playground-settings">
        <Button type="button" variant="outline" class="max-[719px]:h-8 max-[719px]:px-2" data-test="playground-settings-trigger" :aria-expanded="settingsOpen" @click="settingsOpen = !settingsOpen">limits</Button>
        <div v-show="settingsOpen" class="border-line bg-surface absolute top-full left-0 z-30 mt-1 max-h-[70vh] w-[min(100vw-2rem,22rem)] overflow-y-auto border">
          <PlaygroundSettings
            v-model:max-steps="maxSteps"
            v-model:max-evals="maxEvals"
            v-model:max-state-bytes="maxStateBytes"
            v-model:continue-speed="continueSpeed"
            :disabled="isBusy"
          />
        </div>
      </div>
      <Button type="button" variant="outline" data-test="playground-reset" :disabled="!canReset" title="Reset to first state" aria-label="Reset to first state" @click="resetToFirstState">reset</Button>
      <Button type="button" variant="outline" data-test="playground-undo" :disabled="!canUndo" title="Step back" aria-label="Step back" @click="undoStep">back</Button>
      <Button type="button" variant="outline" data-test="playground-pause" :disabled="!continuing" title="Pause" aria-label="Pause" @click="pauseProgram">pause</Button>
      <Button type="button" variant="outline" data-test="playground-continue" :disabled="!canRun" :title="continueTitle" aria-label="Play" @click="() => continueProgram()">play</Button>
      <Button type="button" variant="outline" data-test="playground-step" :disabled="!canRun" :title="stepTitle" aria-label="Step forward" @click="() => stepProgram()">step</Button>
      <Button type="button" variant="outline" data-test="playground-end" :disabled="!canRun" :title="endTitle" aria-label="End" @click="() => endProgram()">end</Button>
      <p v-if="selectedTestCase" data-test="playground-selected-case" class="text-dim min-w-0 text-[11px]">
        <span class="text-ash block truncate">{{ selectedTestCase.caseName }}</span>
        <span class="block truncate">{{ selectedTestCase.manifestPath }}</span>
      </p>
      <div class="flex-1" />
      <ThemeToggle v-if="props.chrome !== 'page'" class="max-[719px]:size-8" />
      <Button type="button" class="max-[719px]:h-8 max-[719px]:px-2" data-test="playground-share" @click="sharePlayground">share</Button>
      <Button v-if="props.showOpenFull" as="a" variant="ghost" :href="openFullHref" data-test="embed-open-full">open full</Button>
    </div>

    <div data-test="playground-workbench" class="flex min-h-0 flex-1 flex-col">
      <PlaygroundSplit :stacked="stacked">
        <template #editor>
          <div class="bg-surface flex h-full min-h-0 flex-col">
            <p v-if="loadError" class="border-signal bg-signal/10 text-destructive border-l-2 px-3 py-2 text-[12px]">{{ loadError }}</p>
            <p v-if="ruleErrors.length" data-test="playground-rule-error" class="border-signal bg-signal/10 text-destructive border-l-2 px-3 py-2 text-[12px] whitespace-pre-wrap">{{ ruleErrors.join('\n') }}</p>
            <RulesMonacoEditor v-model="rulesText" class="min-h-0 flex-1" :highlight-line="matchedRuleLine" :readonly="!props.editable" data-test="playground-rules" @paste="seedStateFromSource" />
          </div>
        </template>
        <template #output>
          <ResizablePanelGroup
            direction="vertical"
            auto-save-id="thuepp-playground-column"
            data-test="playground-column"
            class="h-full min-h-0"
          >
            <ResizablePanel id="resources" :order="1" :default-size="100 / 3" :min-size="8" class="flex min-h-0 flex-col">
              <section data-test="playground-panel-resources" class="bg-surface flex h-full min-h-0 flex-col">
                <h2 class="border-line bg-raised text-ash flex h-7 shrink-0 items-center border-b px-3 font-mono text-[13px] lowercase">resources</h2>
                <div data-test="resource-sections" class="min-h-0 flex-1 overflow-auto">
                  <div class="flex flex-col gap-4 p-4">
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
                  </div>
                </div>
              </section>
            </ResizablePanel>
            <ResizableHandle with-handle aria-label="Resize resources and state" data-test="playground-resize-resources" />
            <ResizablePanel id="state" :order="2" :default-size="100 / 3" :min-size="8" class="flex min-h-0 flex-col">
              <section data-test="playground-panel-state" class="bg-surface flex h-full min-h-0 flex-col">
                <h2 class="border-line bg-raised text-ash flex h-7 shrink-0 items-center border-b px-3 font-mono text-[13px] lowercase">state</h2>
                <div class="min-h-0 flex-1 overflow-hidden">
                  <Textarea v-model="stateText" class="border-line bg-surface field-sizing-fixed h-full min-h-0 resize-none rounded-none border-0 font-mono text-[13px] shadow-none focus-visible:ring-0" data-test="playground-state" :readonly="!props.editable" spellcheck="false" wrap="soft" @input="clearDiffs" />
                </div>
              </section>
            </ResizablePanel>
            <ResizableHandle with-handle aria-label="Resize state and trace" data-test="playground-resize-trace" />
            <ResizablePanel id="trace" :order="3" :default-size="100 / 3" :min-size="8" class="flex min-h-0 flex-col">
              <section data-test="playground-panel-trace" class="bg-surface flex h-full min-h-0 flex-col">
                <h2 class="border-line bg-raised text-ash flex h-7 shrink-0 items-center border-b px-3 font-mono text-[13px] lowercase">trace</h2>
                <div data-test="playground-trace" class="min-h-0 flex-1 overflow-auto">
                  <div class="p-2">
                    <StateDiffs :entries="stateDiffs" :selected-key="selectedHistoryKey" @select="selectHistoryEntry" />
                  </div>
                </div>
              </section>
            </ResizablePanel>
          </ResizablePanelGroup>
        </template>
      </PlaygroundSplit>
    </div>

    <footer class="border-line text-dim flex min-h-8 shrink-0 flex-wrap items-center gap-x-3 gap-y-0.5 border-t px-3 py-1.5 text-[11px]">
      <span data-test="playground-status">{{ statusText }}</span>
      <span aria-hidden="true">·</span>
      <span data-test="playground-applied-limits">steps {{ appliedSteps }}/{{ maxSteps }} · probes {{ probeCount }}/{{ maxEvals }} · state {{ stateBytes }}/{{ maxStateBytes }}</span>
      <span v-if="shareState" class="text-ash ml-auto">{{ shareState }}</span>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { useMediaQuery } from '@vueuse/core'
import { diffChars } from 'diff'
import { computed, nextTick, ref } from 'vue'
import { Button } from '@/components/ui/button'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import { Textarea } from '@/components/ui/textarea'
import SiteHeader from '@/components/SiteHeader.vue'
import ThemeToggle from '@/components/ThemeToggle.vue'
import PlaygroundSettings from '@/playground/PlaygroundSettings.vue'
import PlaygroundSplit from '@/playground/PlaygroundSplit.vue'
import ResourceSection from './ResourceSection.vue'
import RulesMonacoEditor from './RulesMonacoEditor.vue'
import StateDiffs from './StateDiffs.vue'
import TestCaseMenu from './TestCaseMenu.vue'
import { flattenTestManifests, type TestCaseOption } from './testCases'
import { analyzeRules, type ResourceUsage } from './ruleResources'
import { splitProgramSource } from './thueSource'
import { runWithWorker, type DemoTraceEvent } from './wasm'

const props = withDefaults(defineProps<{
  file?: string
  test?: string
  caseName?: string
  chrome?: 'page' | 'embed'
  editable?: boolean
  showOpenFull?: boolean
  syncUrl?: boolean
}>(), {
  chrome: 'page',
  editable: true,
  showOpenFull: false,
  syncUrl: true,
})

const stacked = useMediaQuery('(max-width: 719px)')
const examplesOpen = ref(false)
const settingsOpen = ref(false)
const shareState = ref('')
const appliedSteps = ref(0)
const probeCount = ref(0)

const routeSearchParams = new URLSearchParams(window.location.search)

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

type ContinueSpeed = '1' | '10' | '100'

const continueSpeedOptions: Array<{ value: ContinueSpeed; label: string; delayMs: number }> = [
  { value: '1', label: '1/s', delayMs: 1000 },
  { value: '10', label: '10/s', delayMs: 100 },
  { value: '100', label: '100/s', delayMs: 10 },
]

const fileParam = ref(initialFile)
const sourcePath = ref(initialFile.replace(/^\.\//, ''))
const rulesText = ref('')
const stateText = ref('')
const resourceInputs = ref<Record<string, string>>({})
const resourceSubmittedInputs = ref<Record<string, string>>({})
const resourceLogs = ref<Record<string, { reads: string[]; writes: string[]; errors: string[]; remainingInputText?: string; outputText?: string }>>({})
const resourceOutputs = ref<Record<string, string>>({})
const resourceAttention = ref<Record<string, 'input'>>({})
const loadError = ref('')
const running = ref(false)
const continuing = ref(false)
const pauseRequested = ref(false)
const statusText = ref('idle')
const stateDiffs = ref<StateDiffEntry[]>([])
const selectedHistoryKey = ref<string | undefined>()
const baseState = ref('')
const lastRunMode = ref<'step' | 'continue' | 'end'>('step')
const continueSpeed = ref<ContinueSpeed>('10')
const maxSteps = ref(1_000_000)
const maxEvals = ref(1_000_000)
const maxStateBytes = ref(8_388_608)
const matchedRuleLine = ref<number | undefined>()
const selectedTestCase = ref<TestCaseOption | undefined>()

const ruleAnalysis = computed(() => analyzeRules(rulesText.value))
const resourceSections = computed(() => ruleAnalysis.value.resources)
const ruleErrors = computed(() => ruleAnalysis.value.errors)
const selectedHistoryCursor = computed(() => stateDiffs.value.findIndex(entry => entry.key === selectedHistoryKey.value))
const isBusy = computed(() => running.value || continuing.value)
const canReset = computed(() => !isBusy.value && selectedHistoryCursor.value > 0)
const canUndo = computed(() => !isBusy.value && selectedHistoryCursor.value > 0)
const canRun = computed(() => !isBusy.value)
const requestedResourceName = computed(() => statusText.value.match(/^waiting for ([A-Za-z_][A-Za-z0-9_-]*)$/)?.[1])
const stepTitle = computed(() => 'Step forward')
const continueTitle = computed(() => 'Play')
const endTitle = computed(() => `End without rendering intermediate states (max ${maxSteps.value} steps)`)
const continueDelayMs = computed(() => continueSpeedOptions.find(option => option.value === continueSpeed.value)?.delayMs ?? 100)
const openFullHref = computed(() => {
  const url = new URL('/playground', window.location.href)
  url.searchParams.set('file', fileParam.value)
  return `${url.pathname}${url.search}`
})
const stateBytes = computed(() => new TextEncoder().encode(stateText.value).length)

async function sharePlayground(): Promise<void> {
  const url = window.location.href
  try {
    await navigator.clipboard.writeText(url)
    shareState.value = 'copied'
  } catch {
    shareState.value = 'copy failed'
  }
}

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

function setResourceInput(name: string, value: string): void {
  resourceInputs.value = { ...resourceInputs.value, [name]: value }
  const { [name]: _removed, ...remainingSubmitted } = resourceSubmittedInputs.value
  resourceSubmittedInputs.value = remainingSubmitted
}

async function submitResource(name: string): Promise<void> {
  if (requestedResourceName.value !== name) return
  const value = resourceInputs.value[name] ?? ''
  resourceSubmittedInputs.value = { ...resourceSubmittedInputs.value, [name]: value }
  if (lastRunMode.value === 'end') await endProgram()
  else if (lastRunMode.value === 'continue') await continueProgram()
  else await stepProgram()
}

function isResourceReady(name: string): boolean {
  return (resourceSubmittedInputs.value[name] ?? '').length > 0
}

async function focusResourceInput(name: string): Promise<void> {
  await nextTick()
  const input = document.querySelector(`[data-test="resource-input-${name}"]`) as HTMLTextAreaElement | null
  input?.scrollIntoView({ block: 'nearest' })
  input?.focus()
}

function showResourceInput(resource: ResourceUsage): boolean {
  return resource.reads
}

function showResourceOutput(resource: ResourceUsage): boolean {
  return resource.writes
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
  selectedTestCase.value = undefined
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
  stateText.value = ''
  if (stateText.value === '') stateText.value = split.state
  loadError.value = split.error
  clearRun()
  resourceInputs.value = {}
  if (props.syncUrl) {
    const url = new URL(window.location.href)
    url.searchParams.set('file', normalized)
    window.history.replaceState({}, '', url)
  }
}

function seedStateFromSource(source = rulesText.value): void {
  stateText.value = ''
  const split = splitProgramSource(source)
  loadError.value = split.error
  rulesText.value = split.rules
  if (stateText.value === '') stateText.value = split.state
  clearRun()
}

function selectTestCase(testCase: TestCaseOption): void {
  const file = `./${testCase.programPath}`
  loadFile(file)
  selectedTestCase.value = testCase
  if (testCase.hasInput) stateText.value = testCase.input
  resourceInputs.value = { ...resourceInputs.value, stdin: testCase.stdin ?? '' }
  if (props.syncUrl) {
    const url = new URL(window.location.href)
    url.searchParams.set('test', `./${testCase.manifestPath}`)
    url.searchParams.set('case', testCase.id.split('::').at(-1) ?? testCase.caseName)
    window.history.replaceState({}, '', url)
  }
}

function clearRun(): void {
  running.value = false
  continuing.value = false
  pauseRequested.value = false
  statusText.value = 'idle'
  appliedSteps.value = 0
  probeCount.value = 0
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
  matchedRuleLine.value = undefined
}

async function stepProgram(): Promise<void> {
  if (!canRun.value) return
  pauseRequested.value = false
  lastRunMode.value = 'step'
  await executeProgram({ maxSteps: 1, status: 'stepping', collectTrace: true })
}

async function continueProgram(): Promise<void> {
  if (!canRun.value) return
  lastRunMode.value = 'continue'
  pauseRequested.value = false
  continuing.value = true
  try {
    let steps = 0
    while (!pauseRequested.value && steps < maxSteps.value) {
      const status = await executeProgram({ maxSteps: 1, status: 'running', collectTrace: true })
      if (status !== 'stepped') break
      steps += 1
      if (pauseRequested.value) break
      await waitForContinueDelay()
    }
    if (steps >= maxSteps.value && !pauseRequested.value) statusText.value = `paused at max steps ${maxSteps.value}`
  } finally {
    continuing.value = false
    if (pauseRequested.value) statusText.value = 'paused'
  }
}

async function endProgram(): Promise<void> {
  if (!canRun.value) return
  lastRunMode.value = 'end'
  pauseRequested.value = false
  await executeProgram({ maxSteps: maxSteps.value, status: 'ending', collectTrace: false, collapsedHistory: true })
}

function pauseProgram(): void {
  if (!continuing.value) return
  pauseRequested.value = true
  statusText.value = 'pausing'
}

type RunStatus = 'stepped' | 'exited' | 'waiting' | 'errored'

async function executeProgram(options: { maxSteps?: number; status: string; collectTrace?: boolean; collapsedHistory?: boolean }): Promise<RunStatus | undefined> {
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
      maxEvals: maxEvals.value,
      maxStateBytes: maxStateBytes.value,
      coverage: false,
      resources: resourceConfigs(),
      trace: options.collectTrace ?? options.maxSteps !== undefined,
      maxSteps: options.maxSteps,
    })
    const deliberateStep = options.maxSteps === 1 && result.limit === 'steps'
    const stderr = deliberateStep
      ? (result.stderr ?? '')
      : [...new Set([result.stderr, result.error, result.errors].filter(Boolean))].join('\n')
    applyResourceLogs(result.resourceLogs ?? [], result.stdout ?? '', stderr)
    const nextState = result.state ?? result.trace?.at(-1)?.stateAfter
    if (nextState !== undefined) stateText.value = nextState
    const trace = result.trace ?? []
    if (typeof result.evalCount === 'number') probeCount.value += result.evalCount
    if (trace.length > 0) appliedSteps.value += trace.length
    else if (typeof result.appliedSteps === 'number') appliedSteps.value = result.appliedSteps
    appendStateDiffs(trace)
    if (options.collapsedHistory) appendCollapsedEndDiff(runState, nextState ?? runState, result.evalCount)
    const pendingResource = pendingInputResource(result)
    if (trace.length === 0 && stderr && !pendingResource) appendStepErrorDiff(stderr, runState)
    updateMatchedRuleLine(trace)
    if (pendingResource) {
      statusText.value = `waiting for ${pendingResource}`
      await focusResourceInput(pendingResource)
      return 'waiting'
    }
    const stepped = options.maxSteps === 1 && trace.length > 0 && !trace.some(event => event.exitCode !== undefined) && (deliberateStep || (!result.exitCode && !stderr))
    if (stepped) {
      statusText.value = 'stepped'
      return 'stepped'
    }
    statusText.value = `exited ${result.exitCode ?? (stderr ? 1 : 0)}`
    return 'exited'
  } catch (error) {
    const stderr = error instanceof Error ? error.message : String(error)
    const nextStderr = `${resourceOutputs.value.stderr ?? ''}${stderr}`
    resourceAttention.value = {}
    resourceOutputs.value = { ...resourceOutputs.value, stderr: nextStderr }
    statusText.value = 'errored'
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

function appendCollapsedEndDiff(stateBefore: string, stateAfter: string, evalCount?: number): void {
  const previousStep = Math.max(0, ...stateDiffs.value.map(entry => entry.step))
  const step = Math.max(previousStep + 1, evalCount ?? previousStep + 1)
  const { before, after } = compactCharDiff(stateBefore, stateAfter)
  const entry = {
    key: `end-${step}`,
    step,
    row: 0,
    rule: 'end: skipped intermediate states',
    stateBefore,
    stateAfter,
    before,
    after,
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

function pruneFutureHistory(): void {
  const index = selectedHistoryCursor.value
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
  statusText.value = entry.step === 0 ? 'checkpoint initial' : `checkpoint #${entry.step}`
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
  resourceAttention.value = changedResourceInputs(resourceInputs.value, nextInputs)
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

function appendErrorTranscript(current: string, next: string): string {
  if (!current) return next
  if (current.endsWith('\n') || next.startsWith('\n')) return `${current}${next}`
  return `${current}\n${next}`
}

function loadInitialSelection(): void {
  const testParam = props.test ?? routeSearchParams.get('test')
  const caseParam = props.caseName ?? routeSearchParams.get('case')
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
