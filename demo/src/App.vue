<template>
  <PlaygroundPage v-if="isPlaygroundRoute" />
  <main v-else class="site-shell">
    <section class="landing-hero" aria-labelledby="page-title">
      <div class="hero-copy-block">
        <p class="kicker">thue++ in the browser</p>
        <h1 id="page-title">A tiny language for rewriting text with rules.</h1>
        <p class="lede">
          Pick a small program, edit the rules and starting text, then run it in the real Go-WASM interpreter.
          The browser shows stdin, stdout, stderr, resources, and traces around the runtime.
        </p>
        <div class="hero-actions">
          <a class="button-link primary" href="#playground">Try an example</a>
          <span class="runtime-note">Go-WASM semantics, not a JavaScript rule evaluator.</span>
        </div>
      </div>
      <aside class="why-card" aria-label="why are you here">
        <h2>Why are you here?</h2>
        <p>Start with the mental model before the workbench details:</p>
        <ul>
          <li>State is plain text.</li>
          <li>Rules match and rewrite that text.</li>
          <li>Output and input are explicit resources.</li>
        </ul>
      </aside>
    </section>

    <section class="concept-grid" aria-label="core concepts">
      <article v-for="concept in concepts" :key="concept.title" class="concept-card">
        <p>{{ concept.step }}</p>
        <h2>{{ concept.title }}</h2>
        <span>{{ concept.description }}</span>
      </article>
    </section>

    <section id="playground" class="playground" aria-labelledby="playground-title">
      <div class="playground-heading">
        <div>
          <p class="kicker">playground</p>
          <h2 id="playground-title">Start with one small example</h2>
          <p>
            The starter examples teach stdout, stdin, and callback resources. The advanced panel keeps coverage,
            limits, traces, and source inspection available without making the first screen feel like an IDE.
          </p>
        </div>
        <button data-test="run-demo" :disabled="running" @click="() => runProgram()">
          {{ running ? 'Running…' : 'Run Program' }}
        </button>
      </div>

      <nav class="starter-tabs" aria-label="starter examples">
        <button
          v-for="example in starterExamples"
          :key="example.id"
          type="button"
          class="starter-tab"
          :class="{ active: example.id === selectedId }"
          data-test="example-card"
          :data-example-id="example.id"
          @click="selectExample(example.id)"
        >
          <strong>{{ displayExampleName(example) }}</strong>
          <span>{{ exampleFeature(example.id) }}</span>
        </button>
      </nav>


      <section class="demo-run-layout">
        <section class="field-panel source-panel">
          <div class="panel-heading">
            <div>
              <p class="kicker compact">program</p>
              <h2>Source</h2>
            </div>
            <span class="mono-path">{{ sourcePath }}</span>
          </div>
          <pre data-test="source-preview">{{ composedSource }}</pre>
          <div v-if="input" class="context-block">
            <p class="kicker compact">stdin</p>
            <pre data-test="stdin-preview">{{ input }}</pre>
          </div>
        </section>

        <aside class="run-sidecar">
          <section class="field-panel output-card">
            <div class="panel-heading">
              <div>
                <p class="kicker compact">stdout</p>
                <h2>stdout</h2>
              </div>
              <button type="button" class="secondary" data-copy="stdout" @click="copyText('stdout', result.stdout || '')">Copy</button>
            </div>
            <pre>{{ result.stdout || outputFor(selectedId) }}</pre>
            <p class="hint">{{ explanationFor(selectedId) }}</p>
          </section>

          <section class="field-panel context-card">
            <div class="panel-heading">
              <div>
                <p class="kicker compact">program</p>
                <h2 data-test="selected-example-summary">{{ displayExampleName(selectedExample) }}</h2>
              </div>
              <span class="mono-path">{{ sourcePath }}</span>
            </div>
            <pre data-test="source-preview">{{ composedSource }}</pre>
            <div v-if="input" class="context-block">
              <p class="kicker compact">stdin</p>
              <pre data-test="stdin-preview">{{ input }}</pre>
            </div>
          </section>
        </aside>
      </section>

    </section>

    <details class="advanced-panel">
      <summary>
        <span>More examples and run details</span>
        <small>resources, stderr, coverage, trace, and generated source</small>
      </summary>

      <section class="advanced-grid">
        <section class="field-panel span advanced-examples" aria-label="more examples">
          <div class="panel-heading">
            <div>
              <p class="kicker compact">more examples</p>
              <h2>Resource and coverage cases</h2>
            </div>
          </div>
          <nav class="advanced-example-grid">
            <button
              v-for="example in advancedExamples"
              :key="example.id"
              type="button"
              class="example-card"
              :class="{ active: example.id === selectedId }"
              data-test="example-card"
              :data-example-id="example.id"
              @click="selectExample(example.id)"
            >
              <span>{{ displayExampleName(example) }}</span>
              <strong>{{ exampleFeature(example.id) }}</strong>
              <small>{{ example.description }}</small>
            </button>
          </nav>
        </section>

        <aside class="field-panel output-panel span" aria-label="run details">
          <div class="panel-heading">
            <div>
              <p class="kicker compact">run details</p>
              <h2>Run output</h2>
            </div>
            <button v-if="activeTab === 'stdout'" type="button" class="secondary" data-copy="stdout" @click="copyText('stdout', result.stdout || '')">Copy stdout</button>
            <button v-else-if="activeTab === 'coverage'" type="button" class="secondary" data-copy="coverage" @click="copyText('coverage TSV', coverageText)">Copy coverage</button>
            <button v-else-if="activeTab === 'source'" type="button" class="secondary" data-copy="source" @click="copyText('source', composedSource)">Copy source</button>
          </div>
          <nav class="tabs" aria-label="result tabs">
            <button v-for="tab in resultTabs" :key="tab.id" type="button" :class="{ active: activeTab === tab.id }" :data-result-tab="tab.id" @click="activeTab = tab.id">
              {{ tab.label }}
            </button>
          </nav>
          <p v-if="copyNotice" class="copy-notice">{{ copyNotice }}</p>

          <section v-if="activeTab === 'stdout'" class="tab-panel">
            <pre>{{ result.stdout || 'stdout appears here after a run' }}</pre>
          </section>
          <section v-else-if="activeTab === 'stderr'" class="tab-panel">
            <pre>{{ result.stderr || 'stderr appears here after a run' }}</pre>
          </section>
          <section v-else-if="activeTab === 'errors'" class="tab-panel">
            <pre class="error-text">{{ result.error || result.errors || procsError || 'errors appear here after a run' }}</pre>
            <pre v-if="formattedResourceLogs">{{ formattedResourceLogs }}</pre>
          </section>
          <section v-else-if="activeTab === 'resources'" class="tab-panel">
            <pre>{{ formattedResourceLogs || 'callback resource reads/writes appear here after a run' }}</pre>
          </section>
          <section v-else-if="activeTab === 'trace'" class="tab-panel">
            <pre>{{ traceText }}</pre>
          </section>
          <section v-else-if="activeTab === 'source'" class="tab-panel">
            <pre>{{ composedSource }}</pre>
          </section>
          <section v-else class="tab-panel">
            <pre>{{ coverageText || 'coverage TSV appears here when enabled' }}</pre>
            <table v-if="coverageRows.length" class="coverage-table">
              <thead><tr><th>Source</th><th>Line</th><th>Hits</th><th>Rule</th></tr></thead>
              <tbody>
                <tr v-for="row in coverageRows" :key="`${row.source}:${row.line}:${row.rule}`">
                  <td>{{ row.source }}</td>
                  <td>{{ row.line }}</td>
                  <td>{{ row.hits }}</td>
                  <td><code>{{ row.rule }}</code></td>
                </tr>
              </tbody>
            </table>
          </section>
        </aside>
      </section>
    </details>

    <section class="next-steps" aria-label="next steps">
      <h2>After the first run</h2>
      <div class="next-grid">
        <article v-for="step in nextSteps" :key="step.title">
          <h3>{{ step.title }}</h3>
          <p>{{ step.description }}</p>
        </article>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { examples, type DemoResourceExample } from './examples'
import PlaygroundPage from './PlaygroundPage.vue'
import { runWithWorker, type DemoRunResult } from './wasm'

interface ResourceState extends DemoResourceExample { key: number }
type ResultTabId = 'stdout' | 'stderr' | 'errors' | 'resources' | 'coverage' | 'trace' | 'source'

const resultTabs: Array<{ id: ResultTabId; label: string }> = [
  { id: 'stdout', label: 'stdout' },
  { id: 'stderr', label: 'stderr' },
  { id: 'errors', label: 'errors' },
  { id: 'resources', label: 'resources' },
  { id: 'coverage', label: 'coverage' },
  { id: 'trace', label: 'trace' },
  { id: 'source', label: 'source' },
]

const selectedId = ref(examples[0].id)
const sourcePath = ref(examples[0].sourcePath)
const rulesText = ref('')
const stateText = ref('')
const input = ref(examples[0].input)
const procsText = ref('')
const maxEvals = ref(examples[0].maxEvals ?? 10_000)
const maxStateBytes = ref(examples[0].maxStateBytes ?? 1_000_000)
const coverage = ref(examples[0].coverage ?? true)
const running = ref(false)
const runState = ref<'not run' | 'dirty' | 'running' | 'stepped' | 'done' | 'error'>('not run')
const lastRunMs = ref<number | null>(null)
const copyNotice = ref('')
const activeTab = ref<ResultTabId>('stdout')
const result = reactive<DemoRunResult>({ stdout: '', stderr: '', coverage: '', coverageTSV: '', resourceLogs: [] })
const resources = ref<ResourceState[]>([])
let nextKey = 1

const isPlaygroundRoute = computed(() => window.location.pathname.replace(/\/$/, '').endsWith('/playground'))
const selectedExample = computed(() => examples.find(item => item.id === selectedId.value) ?? examples[0])
const starterExamples = computed(() => ['hello', 'stdin', 'resource-echo'].map(id => examples.find(item => item.id === id)).filter((item): item is typeof examples[number] => Boolean(item)))
const advancedExamples = computed(() => examples.filter(example => !starterExamples.value.some(starter => starter.id === example.id)))
const concepts = [
  { step: '01', title: 'State Is Text', description: 'Every run starts with a plain text state you can read and edit.' },
  { step: '02', title: 'Rules Match Text', description: 'Ordered regex patterns rewrite state or call an explicit resource.' },
  { step: '03', title: 'Resources Are Boundaries', description: 'stdin, stdout, stderr, and callbacks stay visible in the UI.' },
]
const nextSteps = [
  { title: 'Edit the Program', description: 'Change the rules or initial state and run again to see the rewrite model.' },
  { title: 'Open Advanced Controls', description: 'Try callback resources, coverage TSV, or raw source inspection.' },
  { title: 'Read the Contracts', description: 'Use the repository examples and manifests when porting thue++ into another runtime.' },
]
const composedSource = computed(() => composeSource(rulesText.value, stateText.value))
const coverageText = computed(() => result.coverageTSV ?? result.coverage ?? '')
const traceText = computed(() => {
  const trace = (result as DemoRunResult & { trace?: unknown[] }).trace
  if (trace?.length) return JSON.stringify(trace, null, 2)
  const lines = [
    'trace appears here after stepping support is enabled in the Go-WASM runner',
    '',
    'current source:',
    composedSource.value,
  ]
  return lines.join('\n')
})
const procsError = computed(() => {
  try {
    parseProcs(procsText.value)
    return ''
  } catch (error) {
    return error instanceof Error ? error.message : String(error)
  }
})
const coverageRows = computed(() => coverageText.value.split('\n').map(line => line.trim()).filter(Boolean).map(line => {
  const parts = line.split('\t')
  const [sourceAndLine, hits = '', ...ruleParts] = parts
  const lastColon = sourceAndLine.lastIndexOf(':')
  return {
    source: lastColon >= 0 ? sourceAndLine.slice(0, lastColon) : sourceAndLine,
    line: lastColon >= 0 ? sourceAndLine.slice(lastColon + 1) : '',
    hits,
    rule: ruleParts.join('\t'),
  }
}))
const formattedResourceLogs = computed(() => {
  if (!result.resourceLogs?.length) return ''
  return result.resourceLogs.map(log => [
    `[${log.name}]`,
    `reads: ${log.reads.length ? JSON.stringify(log.reads) : '[]'}`,
    `writes: ${log.writes.length ? JSON.stringify(log.writes) : '[]'}`,
    `errors: ${log.errors.length ? JSON.stringify(log.errors) : '[]'}`,
  ].join('\n')).join('\n\n')
})

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

function composeSource(rules: string, state: string): string {
  const left = rules.replace(/\s+$/g, '')
  const right = state.replace(/^\s+|\s+$/g, '')
  if (!left) return right
  if (!right) return `${left}\n`
  return `${left}\n\n${right}\n`
}

function cloneResources(items: DemoResourceExample[]): ResourceState[] {
  return items.map(item => ({ ...item, key: nextKey++ }))
}

function exampleFeature(id: string): string {
  const features: Record<string, string> = {
    hello: 'stdout starter',
    stdin: 'stdin starter',
    'resource-echo': 'callback resource',
    coverage: 'coverage TSV',
    error: 'resource error',
    timeout: 'timeout surface',
  }
  return features[id] ?? 'starter'
}

function displayExampleName(example: { id: string; name: string }): string {
  return example.name
}

function outputFor(id: string): string {
  const outputs: Record<string, string> = {
    hello: 'stdout appears here after you run the example',
    stdin: 'stdout appears here after stdin is consumed',
  }
  return outputs[id] ?? 'stdout appears here after a run'
}

function explanationFor(id: string): string {
  const explanations: Record<string, string> = {
    hello: 'The initial text is “hello”. A rule matches it and writes a line to stdout.',
    stdin: 'The first rule reads one stdin line into state. The next rule captures the name and writes the greeting.',
  }
  return explanations[id] ?? 'Run the example to see how rules transform text and resources.'
}

function selectExample(id: string): void {
  selectedId.value = id
  loadSelectedExample()
}

function loadSelectedExample(): void {
  const example = selectedExample.value
  const split = splitProgram(example.sourceText)
  sourcePath.value = example.sourcePath
  rulesText.value = split.rules
  stateText.value = split.state
  input.value = example.input
  procsText.value = ''
  maxEvals.value = example.maxEvals ?? 10_000
  maxStateBytes.value = example.maxStateBytes ?? 1_000_000
  coverage.value = example.coverage ?? false
  resources.value = cloneResources(example.resources)
  activeTab.value = 'stdout'
  clearOutput()
}


function clearOutput(): void {
  result.exitCode = undefined
  result.stdout = ''
  result.stderr = ''
  result.coverage = ''
  result.coverageTSV = ''
  result.error = ''
  result.errors = ''
  ;(result as DemoRunResult & { trace?: unknown[] }).trace = []
  result.resourceLogs = []
  lastRunMs.value = null
  runState.value = 'not run'
  copyNotice.value = ''
}

function parseProcs(text: string): Record<string, string> {
  const procs: Record<string, string> = {}
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
  for (const [index, raw] of lines.entries()) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const equal = line.indexOf('=')
    if (equal < 0) throw new Error(`Procs line ${index + 1}: expected name = command`)
    const name = line.slice(0, equal).trim()
    const command = line.slice(equal + 1).trim()
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error(`Procs line ${index + 1}: invalid binding name ${JSON.stringify(name)}`)
    if (!command) throw new Error(`Procs line ${index + 1}: command is empty`)
    procs[name] = command
  }
  return procs
}

async function copyText(label: string, text: string): Promise<void> {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(text)
    copyNotice.value = `Copied ${label}`
  } catch (error) {
    copyNotice.value = `Could not copy ${label}: ${error instanceof Error ? error.message : String(error)}`
  }
}

async function runProgram(options: { stepLimit?: number; trace?: boolean } = {}): Promise<void> {
  clearOutput()
  running.value = true
  runState.value = 'running'
  const started = performance.now()
  try {
    const procs = parseProcs(procsText.value)
    Object.assign(result, await runWithWorker({
      sourceText: composedSource.value,
      sourcePath: sourcePath.value,
      input: input.value,
      maxEvals: maxEvals.value,
      maxStateBytes: maxStateBytes.value,
      coverage: coverage.value,
      resources: resources.value.filter(item => item.name.trim()).map(item => ({
        name: item.name.trim(),
        inputText: item.inputText,
        readError: item.readError?.trim() || undefined,
      })),
      procs,
      trace: Boolean(options.trace),
      stepLimit: options.stepLimit,
    }))
    runState.value = result.exitCode && result.exitCode !== 0 || result.error || result.errors ? 'error' : options.stepLimit ? 'stepped' : 'done'
    if (result.error || result.errors) activeTab.value = 'errors'
    else if (options.trace) activeTab.value = 'trace'
    else activeTab.value = 'stdout'
  } catch (error) {
    result.exitCode = 1
    result.error = error instanceof Error ? error.message : String(error)
    runState.value = 'error'
    activeTab.value = 'errors'
  } finally {
    lastRunMs.value = Math.max(0, Math.round(performance.now() - started))
    running.value = false
  }
}

loadSelectedExample()
</script>
