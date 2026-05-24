<template>
  <main class="playground-route">
    <header class="playground-route-header">
      <div>
        <p class="kicker">browser playground</p>
        <h1>Playground</h1>
      </div>
      <div class="playground-route-actions">
        <TestCaseCommand :options="testCaseOptions" @select="selectTestCase" />
        <select v-model="fileParam" aria-label="example file" @change="loadFile(fileParam)">
          <option v-for="file in availableFiles" :key="file" :value="file">{{ file }}</option>
        </select>
        <button type="button" data-test="playground-run" :disabled="running" @click="runProgram">{{ running ? 'Running…' : 'Run' }}</button>
      </div>
    </header>

    <p v-if="loadError" class="error-text">{{ loadError }}</p>

    <ResizablePanelGroup direction="horizontal" class="playground-resizable">
      <ResizablePanel :default-size="34" :min-size="20">
        <section class="playground-pane">
          <div class="panel-heading compact-heading">
            <div>
              <span class="panel-label">rules</span>
            </div>
          </div>
          <textarea v-model="rulesText" data-test="playground-rules" spellcheck="false" wrap="off" />
        </section>
      </ResizablePanel>

      <ResizableHandle with-handle />

      <ResizablePanel :default-size="22" :min-size="16">
        <section class="playground-pane">
          <div class="panel-heading compact-heading">
            <div>
              <span class="panel-label">initial state</span>
            </div>
          </div>
          <textarea v-model="stateText" data-test="playground-state" spellcheck="false" wrap="off" />
        </section>
      </ResizablePanel>

      <ResizableHandle with-handle />

      <ResizablePanel :default-size="44" :min-size="26">
        <section class="playground-pane resource-pane" data-test="resource-sections">
          <div class="panel-heading compact-heading">
            <div>
              <span class="panel-label">resources</span>
            </div>
            <span class="run-status" data-test="playground-status">{{ statusText }}</span>
          </div>
          <div class="resource-list">
            <section v-for="resource in resourceSections" :key="resource.name" class="resource-section" :data-test="`resource-section-${resource.name}`">
              <div class="resource-section-header">
                <code>{{ resource.name }}</code>
                <span class="resource-modes">
                  <span v-if="resource.reads" class="resource-mode">read</span>
                  <span v-if="resource.writes" class="resource-mode">write</span>
                </span>
              </div>
              <label v-if="showResourceInput(resource)" class="resource-field">
                <span>input</span>
                <textarea
                  :value="resourceInputs[resource.name] ?? ''"
                  :data-test="`resource-input-${resource.name}`"
                  spellcheck="false"
                  wrap="off"
                  @input="setResourceInput(resource.name, ($event.target as HTMLTextAreaElement).value)"
                />
              </label>
              <label v-if="showResourceOutput(resource)" class="resource-field">
                <span>output</span>
                <textarea
                  :value="resourceOutputText(resource.name)"
                  :data-test="`resource-output-${resource.name}`"
                  readonly
                  spellcheck="false"
                  wrap="off"
                />
              </label>
            </section>
          </div>
        </section>
      </ResizablePanel>
    </ResizablePanelGroup>
  </main>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable'
import TestCaseCommand from './TestCaseCommand.vue'
import { flattenTestManifests, type TestCaseOption } from './testCases'
import { runWithWorker } from './wasm'

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
const availableFiles = Object.keys(examplesByPublicPath).sort()
const testCaseOptions = flattenTestManifests(Object.fromEntries(Object.entries(manifestModules).map(([key, value]) => [toPublicExamplePath(key), value])))
const initialFile = normalizeFileParam(new URLSearchParams(window.location.search).get('file'))

const fileParam = ref(initialFile)
const sourcePath = ref(initialFile.replace(/^\.\//, ''))
const rulesText = ref('')
const stateText = ref('')
const resourceInputs = ref<Record<string, string>>({})
const resourceLogs = ref<Record<string, { reads: string[]; writes: string[]; errors: string[]; remainingInputText?: string; outputText?: string }>>({})
const resourceOutputs = ref<Record<string, string>>({})
const loadError = ref('')
const running = ref(false)
const statusText = ref('idle')
const stdoutText = ref('')
const stderrText = ref('')

const composedSource = computed(() => composeSource(rulesText.value, stateText.value))
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
    || trimmed.startsWith('@include ')
    || /^[A-Z][A-Z0-9_]*\s*<-/.test(trimmed)
    || /(^|[^\\])::[=<>!%-]/.test(line)
}

function composeSource(rules: string, state: string): string {
  const left = rules.replace(/\s+$/g, '')
  const right = state.replace(/^\s+|\s+$/g, '')
  if (!left) return right
  if (!right) return `${left}\n`
  return `${left}\n\n${right}\n`
}

function includeMapFor(programPath: string): Record<string, string> {
  const normalized = programPath.replace(/^\.\//, '')
  const dir = normalized.includes('/') ? normalized.slice(0, normalized.lastIndexOf('/')) : ''
  const include: Record<string, string> = {}
  for (const [path, content] of Object.entries(repoFiles)) {
    const clean = path.replace(/^\.\//, '').replace(/^\/+/, '')
    if (dir && clean.startsWith(`${dir}/`)) include[clean.slice(dir.length + 1)] = content
  }
  return include
}

interface ResourceUsage {
  name: string
  reads: boolean
  writes: boolean
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
  const stdioOrder = new Map([['stdin', 0], ['stdout', 1], ['stderr', 2]])
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
}

function showResourceInput(resource: ResourceUsage): boolean {
  return resource.name === 'stdin' || resource.reads
}

function showResourceOutput(resource: ResourceUsage): boolean {
  return resource.name === 'stdout' || resource.name === 'stderr' || resource.writes
}

function resourceOutputText(name: string): string {
  return resourceOutputs.value[name] ?? resourceLogs.value[name]?.writes.join('') ?? ''
}

function resourceConfigs() {
  return resourceSections.value.map(resource => ({
    name: resource.name,
    inputText: resourceInputs.value[resource.name] ?? '',
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
  const url = new URL(window.location.href)
  url.searchParams.set('file', normalized)
  window.history.replaceState({}, '', url)
}

async function selectTestCase(testCase: TestCaseOption): Promise<void> {
  const file = `./${testCase.programPath}`
  loadFile(file)
  stateText.value = testCase.input
  setResourceInput('stdin', testCase.stdin ?? '')
  const url = new URL(window.location.href)
  url.searchParams.set('test', `./${testCase.manifestPath}`)
  url.searchParams.set('case', testCase.id.split('::').at(-1) ?? testCase.caseName)
  window.history.replaceState({}, '', url)
  await runProgram()
}

function clearRun(): void {
  running.value = false
  statusText.value = 'idle'
  stdoutText.value = ''
  stderrText.value = ''
  resourceLogs.value = {}
  resourceOutputs.value = {}
}

async function runProgram(): Promise<void> {
  if (running.value) return
  running.value = true
  statusText.value = 'running'
  stdoutText.value = ''
  stderrText.value = ''
  resourceLogs.value = {}
  resourceOutputs.value = {}
  try {
    const result = await runWithWorker({
      sourceText: composedSource.value,
      sourcePath: sourcePath.value,
      input: '',
      maxEvals: 10_000,
      maxStateBytes: 1_000_000,
      coverage: false,
      include: includeMapFor(sourcePath.value),
      resources: resourceConfigs(),
      trace: false,
    })
    stdoutText.value = result.stdout ?? ''
    const stderr = [result.stderr ?? '', result.error ?? '', result.errors ?? ''].filter(Boolean).join('\n')
    stderrText.value = stderr
    applyResourceLogs(result.resourceLogs ?? [], result.stdout ?? '', stderr)
    const stdinLog = resourceLogs.value.stdin
    if (stdinLog?.errors.includes('timeout')) statusText.value = 'waiting for stdin'
    else statusText.value = `exited ${result.exitCode ?? (stderr ? 1 : 0)}`
  } catch (error) {
    stderrText.value = error instanceof Error ? error.message : String(error)
    resourceOutputs.value = { ...resourceOutputs.value, stderr: stderrText.value }
    statusText.value = 'errored'
  } finally {
    running.value = false
  }
}

function applyResourceLogs(logs: Array<{ name: string; reads?: string[]; writes?: string[]; errors?: string[]; remainingInputText?: string; outputText?: string }>, stdout: string, stderr: string): void {
  const nextLogs: Record<string, { reads: string[]; writes: string[]; errors: string[]; remainingInputText?: string; outputText?: string }> = {}
  const nextInputs = { ...resourceInputs.value }
  const nextOutputs: Record<string, string> = {}
  for (const log of logs) {
    const normalized = {
      reads: log.reads ?? [],
      writes: log.writes ?? [],
      errors: log.errors ?? [],
      remainingInputText: log.remainingInputText,
      outputText: log.outputText,
    }
    nextLogs[log.name] = normalized
    if (log.remainingInputText !== undefined) nextInputs[log.name] = log.remainingInputText
    if (log.outputText !== undefined) nextOutputs[log.name] = log.outputText
    else if (normalized.writes.length > 0) nextOutputs[log.name] = normalized.writes.join('')
  }
  if (!nextOutputs.stdout && stdout) nextOutputs.stdout = stdout
  if (!nextOutputs.stderr && stderr) nextOutputs.stderr = stderr
  resourceLogs.value = nextLogs
  resourceInputs.value = nextInputs
  resourceOutputs.value = nextOutputs
}

loadFile(fileParam.value)
</script>
