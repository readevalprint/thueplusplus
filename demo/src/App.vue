<template>
  <main class="shell">
    <header class="hero panel hero-panel">
      <div>
        <p class="eyebrow">thue++ Go-WASM workbench</p>
        <h1>Run thue++ in your browser</h1>
        <p class="hero-copy">
          Real Go-WASM interpreter execution in a Web Worker. The browser shell supplies stdin,
          include text, and callback resources; it does not run a JavaScript rule evaluator or emulate subprocesses.
        </p>
      </div>
      <aside class="proof-card" aria-label="what this demo proves">
        <span>What this proves</span>
        <strong>No JavaScript rule evaluator</strong>
        <p>Rules execute in the compiled Go runtime; JavaScript only owns host-resource callbacks and UI state.</p>
      </aside>
    </header>

    <section class="status-strip" aria-label="runtime status">
      <div class="status-chip" data-test="status-runtime"><span>Runtime</span><strong>Go-WASM</strong></div>
      <div class="status-chip"><span>Worker</span><strong>Web Worker</strong></div>
      <div class="status-chip" data-test="status-coverage"><span>Coverage</span><strong>{{ coverage ? 'on' : 'off' }}</strong></div>
      <div class="status-chip" data-test="status-exit-code"><span>Exit code</span><strong>{{ result.exitCode ?? 'not run' }}</strong></div>
      <div class="status-chip" data-test="run-state"><span>State</span><strong>{{ runState }}</strong></div>
      <div class="status-chip"><span>Last run</span><strong>{{ lastRunMs === null ? 'not run' : `${lastRunMs}ms` }}</strong></div>
    </section>

    <section class="workbench">
      <aside class="panel example-rail" aria-label="examples">
        <div class="section-title">
          <div>
            <p class="eyebrow compact">scenarios</p>
            <h2>Example navigator</h2>
          </div>
        </div>
        <p class="hint">Each scenario demonstrates one browser-adapter boundary.</p>
        <button
          v-for="example in examples"
          :key="example.id"
          type="button"
          class="example-card"
          :class="{ active: example.id === selectedId }"
          data-test="example-card"
          :data-example-id="example.id"
          @click="selectExample(example.id)"
        >
          <span>{{ example.name }}</span>
          <strong>{{ exampleFeature(example.id) }}</strong>
          <small>{{ example.description }}</small>
        </button>
      </aside>

      <section class="input-stack">
        <section class="panel controls">
          <div>
            <p class="eyebrow compact">selected</p>
            <h2>{{ selectedExample.name }}</h2>
            <p class="description" data-test="selected-example-summary">{{ selectedExample.description }}</p>
          </div>
          <label>
            Max evals
            <input v-model.number="maxEvals" type="number" min="1" />
          </label>
          <label>
            Max state bytes
            <input v-model.number="maxStateBytes" type="number" min="1" />
          </label>
          <label class="check">
            <input v-model="coverage" type="checkbox" />
            return coverage TSV
          </label>
          <div class="control-actions">
            <button data-test="run-demo" :disabled="running" @click="runDemo">
              {{ running ? 'Running...' : 'Run in worker' }}
            </button>
            <button type="button" class="secondary" @click="clearOutput">Clear output</button>
          </div>
        </section>

        <label class="panel editor-panel">
          <span>Source (.tpp)</span>
          <input v-model="sourcePath" aria-label="source path" placeholder="source path used for coverage/source map" />
          <textarea v-model="sourceText" spellcheck="false" />
        </label>

        <section class="input-grid">
          <section class="panel">
            <h2>Buffered stdin</h2>
            <p class="hint">Lines are exposed as the <code>stdin</code> callback resource.</p>
            <textarea v-model="input" spellcheck="false" />
          </section>

          <section class="panel">
            <div class="section-title">
              <h2>Named resources</h2>
              <button type="button" class="secondary" @click="addResource">Add resource</button>
            </div>
            <p class="hint">Resource reads/writes are callback functions created inside the worker. Empty queues return <code>ERR:resource:&lt;name&gt;:timeout</code>.</p>
            <div v-if="resources.length === 0" class="empty">No custom resources configured.</div>
            <div v-for="(resource, index) in resources" :key="resource.key" class="resource-row">
              <label>
                Name
                <input v-model="resource.name" placeholder="echo" />
              </label>
              <label>
                Queued read lines
                <textarea v-model="resource.readLines" spellcheck="false" />
              </label>
              <label class="check inline-check">
                <input v-model="resource.echoWrites" type="checkbox" />
                echo writes into read queue
              </label>
              <label>
                Read error
                <input v-model="resource.readError" placeholder="optional, e.g. timeout" />
              </label>
              <button type="button" class="secondary danger" @click="removeResource(index)">Remove</button>
              <pre class="log">{{ resourceLog(resource.name) || 'write log appears here after a run' }}</pre>
            </div>
          </section>

          <section class="panel span">
            <div class="section-title">
              <h2>Include map / source map</h2>
              <button type="button" class="secondary" @click="addInclude">Add include</button>
            </div>
            <p class="hint">The source path above is passed to Go for diagnostics and coverage. Include entries are passed as the adapter include map.</p>
            <div v-if="includes.length === 0" class="empty">No include files configured.</div>
            <div v-for="(include, index) in includes" :key="include.key" class="include-row">
              <label>
                Include path
                <input v-model="include.path" placeholder="lib.tpp" />
              </label>
              <label>
                Include source
                <textarea v-model="include.sourceText" spellcheck="false" />
              </label>
              <button type="button" class="secondary danger" @click="removeInclude(index)">Remove</button>
            </div>
          </section>
        </section>
      </section>

      <aside class="panel output-panel" aria-label="run observability">
        <div class="section-title">
          <div>
            <p class="eyebrow compact">observability</p>
            <h2>Run output</h2>
          </div>
          <button v-if="activeTab === 'stdout'" type="button" class="secondary" data-copy="stdout" @click="copyText('stdout', result.stdout || '')">Copy stdout</button>
          <button v-else-if="activeTab === 'coverage'" type="button" class="secondary" data-copy="coverage" @click="copyText('coverage TSV', coverageText)">Copy coverage</button>
        </div>
        <p class="hint">Raw adapter data stays available; tabs reduce visual overload while preserving diagnostics.</p>
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
          <pre class="error-text">{{ result.error || result.errors || 'errors appear here after a run' }}</pre>
          <pre v-if="formattedResourceLogs">{{ formattedResourceLogs }}</pre>
        </section>
        <section v-else-if="activeTab === 'resources'" class="tab-panel">
          <pre>{{ formattedResourceLogs || 'callback resource reads/writes appear here after a run' }}</pre>
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
  </main>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { examples, type DemoIncludeExample, type DemoResourceExample } from './examples'
import { runWithWorker, type DemoRunResult } from './wasm'

interface ResourceState extends DemoResourceExample { key: number }
interface IncludeState extends DemoIncludeExample { key: number }
type ResultTabId = 'stdout' | 'stderr' | 'errors' | 'resources' | 'coverage'

const resultTabs: Array<{ id: ResultTabId; label: string }> = [
  { id: 'stdout', label: 'stdout' },
  { id: 'stderr', label: 'stderr' },
  { id: 'errors', label: 'errors' },
  { id: 'resources', label: 'resources' },
  { id: 'coverage', label: 'coverage' },
]

const selectedId = ref(examples[0].id)
const sourcePath = ref(examples[0].sourcePath)
const sourceText = ref(examples[0].sourceText)
const input = ref(examples[0].input)
const maxEvals = ref(examples[0].maxEvals ?? 10_000)
const maxStateBytes = ref(examples[0].maxStateBytes ?? 1_000_000)
const coverage = ref(examples[0].coverage ?? true)
const running = ref(false)
const runState = ref<'not run' | 'running' | 'done' | 'error'>('not run')
const lastRunMs = ref<number | null>(null)
const copyNotice = ref('')
const activeTab = ref<ResultTabId>('stdout')
const result = reactive<DemoRunResult>({ stdout: '', stderr: '', coverage: '', coverageTSV: '', resourceLogs: [] })
const resources = ref<ResourceState[]>([])
const includes = ref<IncludeState[]>([])
let nextKey = 1

const selectedExample = computed(() => examples.find(item => item.id === selectedId.value) ?? examples[0])
const coverageText = computed(() => result.coverageTSV ?? result.coverage ?? '')
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

function cloneResources(items: DemoResourceExample[]): ResourceState[] {
  return items.map(item => ({ ...item, key: nextKey++ }))
}

function cloneIncludes(items: DemoIncludeExample[]): IncludeState[] {
  return items.map(item => ({ ...item, key: nextKey++ }))
}

function exampleFeature(id: string): string {
  const features: Record<string, string> = {
    hello: 'stdout adapter',
    stdin: 'stdin buffer',
    'resource-echo': 'Callback resource',
    include: 'Include map',
    coverage: 'Coverage TSV',
    error: 'resource error',
    timeout: 'timeout surface',
  }
  return features[id] ?? 'adapter scenario'
}

function selectExample(id: string): void {
  selectedId.value = id
  loadSelectedExample()
}

function loadSelectedExample(): void {
  const example = selectedExample.value
  sourcePath.value = example.sourcePath
  sourceText.value = example.sourceText
  input.value = example.input
  maxEvals.value = example.maxEvals ?? 10_000
  maxStateBytes.value = example.maxStateBytes ?? 1_000_000
  coverage.value = example.coverage ?? false
  resources.value = cloneResources(example.resources)
  includes.value = cloneIncludes(example.includes)
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
  result.resourceLogs = []
  lastRunMs.value = null
  runState.value = 'not run'
  copyNotice.value = ''
}

function addResource(): void {
  resources.value.push({ key: nextKey++, name: 'resource', readLines: '', echoWrites: false, readError: '' })
}

function removeResource(index: number): void {
  resources.value.splice(index, 1)
}

function addInclude(): void {
  includes.value.push({ key: nextKey++, path: 'lib.tpp', sourceText: '' })
}

function removeInclude(index: number): void {
  includes.value.splice(index, 1)
}

function splitLines(text: string): string[] {
  if (!text) return []
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line, index, lines) => line !== '' || index < lines.length - 1)
}

function resourceLog(name: string): string {
  const log = result.resourceLogs?.find(item => item.name === name)
  if (!log) return ''
  return `reads: ${JSON.stringify(log.reads)}\nwrites: ${JSON.stringify(log.writes)}\nerrors: ${JSON.stringify(log.errors)}`
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

async function runDemo(): Promise<void> {
  clearOutput()
  running.value = true
  runState.value = 'running'
  const started = performance.now()
  try {
    Object.assign(result, await runWithWorker({
      sourceText: sourceText.value,
      sourcePath: sourcePath.value,
      input: input.value,
      maxEvals: maxEvals.value,
      maxStateBytes: maxStateBytes.value,
      coverage: coverage.value,
      include: Object.fromEntries(includes.value.filter(item => item.path.trim()).map(item => [item.path.trim(), item.sourceText])),
      resources: resources.value.filter(item => item.name.trim()).map(item => ({
        name: item.name.trim(),
        readLines: splitLines(item.readLines),
        echoWrites: Boolean(item.echoWrites),
        readError: item.readError?.trim() || undefined,
      })),
    }))
    runState.value = result.exitCode && result.exitCode !== 0 || result.error || result.errors ? 'error' : 'done'
    if (result.error || result.errors) activeTab.value = 'errors'
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
