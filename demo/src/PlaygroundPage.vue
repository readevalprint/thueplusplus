<template>
  <main class="playground-route">
    <header class="playground-route-header">
      <h1>THUE++ Playground</h1>
      <TestCaseCommand :options="testCaseOptions" @select="selectTestCase" />
    </header>

    <p v-if="loadError" class="error-text">{{ loadError }}</p>

    <div class="playground-layout">
      <PlaygroundCard title="program rules" class="playground-rules-pane">
        <template #aside>
          <div class="playground-rules-toolbar">
            <button type="button" data-test="playground-step" :disabled="running" @click="() => stepProgram()">Step</button>
            <label class="auto-step-toggle">
              <input v-model="autoStep" type="checkbox" data-test="playground-auto" :disabled="running" />
              auto
            </label>
          </div>
        </template>
        <RulesMonacoEditor v-model="rulesText" :highlight-line="matchedRuleLine" data-test="playground-rules" />
      </PlaygroundCard>

      <section class="playground-state-stack" data-test="playground-state-stack">
        <PlaygroundCard title="program state" class="playground-state-pane">
          <textarea v-model="stateText" class="state-editor" data-test="playground-state" spellcheck="false" wrap="soft" @input="clearDiffs" />
        </PlaygroundCard>

        <PlaygroundCard title="state history" class="playground-diffs-pane">
          <StateDiffs :entries="stateDiffs" />
        </PlaygroundCard>
      </section>

      <PlaygroundCard title="resources" class="playground-resources-pane" data-test="resource-sections" content-class="resource-list">
        <template #aside>
          <span class="run-status" data-test="playground-status">{{ statusText }}</span>
        </template>
        <ResourceSection
          v-for="resource in resourceSections"
          :key="resource.name"
          :resource="resource"
          :input="resourceInputs[resource.name] ?? ''"
          :output="resourceOutputText(resource.name)"
          :running="running"
          :show-input="showResourceInput(resource)"
          :show-output="showResourceOutput(resource)"
          @update:input="setResourceInput(resource.name, $event)"
          @submit="submitResource(resource.name)"
        />
      </PlaygroundCard>
    </div>
  </main>
</template>

<script setup lang="ts">
import { diffChars } from 'diff'
import { computed, nextTick, ref } from 'vue'
import PlaygroundCard from './PlaygroundCard.vue'
import ResourceSection from './ResourceSection.vue'
import RulesMonacoEditor from './RulesMonacoEditor.vue'
import StateDiffs from './StateDiffs.vue'
import TestCaseCommand from './TestCaseCommand.vue'
import { flattenTestManifests, type TestCaseOption } from './testCases'
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

const fileParam = ref(initialFile)
const sourcePath = ref(initialFile.replace(/^\.\//, ''))
const rulesText = ref('')
const stateText = ref('')
const resourceInputs = ref<Record<string, string>>({})
const resourceSubmittedInputs = ref<Record<string, string>>({})
const resourceLogs = ref<Record<string, { reads: string[]; writes: string[]; errors: string[]; remainingInputText?: string; outputText?: string }>>({})
const resourceOutputs = ref<Record<string, string>>({})
const loadError = ref('')
const running = ref(false)
const autoStep = ref(false)
const statusText = ref('idle')
const stateDiffs = ref<StateDiffEntry[]>([])
const matchedRuleLine = ref<number | undefined>()

const resourceSections = computed(() => extractResources(rulesText.value))

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

function splitProgram(source: string): { rules: string; state: string } {
  const rules: string[] = []
  const state: string[] = []
  let inState = false
  for (const line of source.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')) {
    if (!inState && line.trim() === '') continue
    if (!inState && isProgramHeaderLine(line)) {
      rules.push(line)
      continue
    }
    inState = true
    state.push(line)
  }
  while (state.length > 0 && state[state.length - 1] === '') state.pop()
  return { rules: rules.join('\n'), state: state.join('\n') }
}

function isProgramHeaderLine(line: string): boolean {
  const trimmed = line.trim()
  return trimmed === ''
    || trimmed.startsWith('#')
    || /^[A-Z][A-Z0-9_]*\s*<-/.test(trimmed)
    || /(^|[^\\])::[=<>!-]/.test(line)
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
  before: DiffPart[]
  after: DiffPart[]
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
    if (!line || line.startsWith('#')) continue
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
  const value = resourceInputs.value[name] ?? ''
  resourceSubmittedInputs.value = { ...resourceSubmittedInputs.value, [name]: value }
  if (statusText.value === `waiting for ${name}`) await stepProgram()
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
  loadError.value = ''
  const split = splitProgram(source)
  rulesText.value = split.rules
  stateText.value = split.state
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
  statusText.value = 'idle'
  resourceLogs.value = {}
  resourceOutputs.value = {}
  resourceSubmittedInputs.value = {}
  clearDiffs()
}

function clearDiffs(): void {
  stateDiffs.value = []
  matchedRuleLine.value = undefined
}

async function stepProgram(): Promise<void> {
  await executeProgram(autoStep.value ? { stepLimit: undefined, status: 'running', collectTrace: true } : { stepLimit: 1, status: 'stepping', collectTrace: true })
}

async function executeProgram(options: { stepLimit?: number; status: string; collectTrace?: boolean }): Promise<void> {
  if (running.value) return
  running.value = true
  statusText.value = options.status
  resourceLogs.value = {}
  try {
    const result = await runWithWorker({
      sourceText: rulesText.value,
      sourcePath: sourcePath.value,
      input: stateText.value,
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
    appendStateDiffs(result.trace ?? [])
    updateMatchedRuleLine(result.trace ?? [])
    const pendingResource = pendingInputResource(result)
    if (pendingResource) {
      statusText.value = `waiting for ${pendingResource}`
      await focusResourceInput(pendingResource)
    } else {
      statusText.value = result.exitCode && result.exitCode !== 0 ? `exited ${result.exitCode}` : (options.stepLimit === 1 ? 'stepped' : `exited ${result.exitCode ?? (stderr ? 1 : 0)}`)
    }
  } catch (error) {
    const stderr = error instanceof Error ? error.message : String(error)
    resourceOutputs.value = { ...resourceOutputs.value, stderr: `${resourceOutputs.value.stderr ?? ''}${stderr}` }
    statusText.value = 'errored'
  } finally {
    running.value = false
  }
}

function appendStateDiffs(trace: DemoTraceEvent[]): void {
  const entries = trace.flatMap((event, index) => stateDiffEntry(event, stateDiffs.value.length + index))
  if (entries.length === 0) return
  stateDiffs.value = [...entries.reverse(), ...stateDiffs.value]
}

function updateMatchedRuleLine(trace: DemoTraceEvent[]): void {
  const cleanSourcePath = sourcePath.value.replace(/^\.\//, '')
  const event = [...trace].reverse().find(item => item.sourcePath.replace(/^\.\//, '') === cleanSourcePath)
  matchedRuleLine.value = event?.lineNumber
}

function stateDiffEntry(event: DemoTraceEvent, index: number): StateDiffEntry[] {
  if (event.stateBefore === event.stateAfter) return []
  const { before, after } = compactCharDiff(event.stateBefore, event.stateAfter)
  return [{
    key: `${event.step}-${event.lineNumber}-${index}`,
    step: event.step,
    row: event.lineNumber,
    rule: ruleTextForEvent(event),
    before,
    after,
  }]
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
  const hasStdoutLog = logs.some(log => log.name === 'stdout' && (log.outputText !== undefined || (log.writes?.length ?? 0) > 0))
  const hasStderrLog = logs.some(log => log.name === 'stderr' && (log.outputText !== undefined || (log.writes?.length ?? 0) > 0))
  if (stdout && !hasStdoutLog) nextOutputs.stdout = `${nextOutputs.stdout ?? ''}${stdout}`
  if (stderr && !hasStderrLog) nextOutputs.stderr = `${nextOutputs.stderr ?? ''}${stderr}`
  resourceLogs.value = nextLogs
  resourceInputs.value = nextInputs
  resourceSubmittedInputs.value = nextSubmittedInputs
  resourceOutputs.value = nextOutputs
}

loadFile(fileParam.value)
</script>
