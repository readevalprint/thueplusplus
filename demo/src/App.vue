<template>
  <main class="shell">
    <header>
      <p class="eyebrow">thue++ Go-WASM demo</p>
      <h1>Browser shell backed by the real Go interpreter</h1>
      <p>
        This demo runs in a Web Worker against the Go-WASM adapter from <code>js/wasm/</code>.
        JavaScript only provides callback resources, stdin buffers, and include text; it does not evaluate thue++ rules or emulate subprocesses.
      </p>
    </header>

    <section class="panel controls">
      <label>
        Example
        <select v-model="selectedId" @change="loadSelectedExample">
          <option v-for="example in examples" :key="example.id" :value="example.id">
            {{ example.name }}
          </option>
        </select>
      </label>
      <p class="description">{{ selectedExample.description }}</p>
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
      <button :disabled="running" @click="runDemo">
        {{ running ? 'Running...' : 'Run in worker' }}
      </button>
      <button type="button" class="secondary" @click="clearOutput">Clear output</button>
    </section>

    <section class="grid">
      <label class="panel span">
        Source (.tpp)
        <input v-model="sourcePath" aria-label="source path" placeholder="source path used for coverage/source map" />
        <textarea v-model="sourceText" spellcheck="false" />
      </label>

      <section class="panel">
        <h2>Buffered stdin</h2>
        <p class="hint">Lines are exposed as the <code>stdin</code> callback resource.</p>
        <textarea v-model="input" spellcheck="false" />
      </section>

      <section class="panel">
        <h2>Run result</h2>
        <dl class="kv">
          <dt>Worker</dt><dd>enabled</dd>
          <dt>Exit code</dt><dd>{{ result.exitCode ?? 'not run' }}</dd>
        </dl>
        <p v-if="result.error" class="error">{{ result.error }}</p>
      </section>

      <section class="panel span">
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

      <section class="panel">
        <h2>stdout</h2>
        <pre>{{ result.stdout }}</pre>
      </section>
      <section class="panel">
        <h2>stderr</h2>
        <pre>{{ result.stderr }}</pre>
      </section>
      <section class="panel span">
        <h2>error</h2>
        <pre class="error-text">{{ result.error || result.errors }}</pre>
      </section>
      <section class="panel span">
        <h2>Resource callback log</h2>
        <pre>{{ formattedResourceLogs }}</pre>
      </section>
      <section class="panel span">
        <h2>coverage TSV raw</h2>
        <pre>{{ coverageText }}</pre>
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
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, reactive, ref } from 'vue'
import { examples, type DemoIncludeExample, type DemoResourceExample } from './examples'
import { runWithWorker, type DemoRunResult } from './wasm'

interface ResourceState extends DemoResourceExample { key: number }
interface IncludeState extends DemoIncludeExample { key: number }

const selectedId = ref(examples[0].id)
const sourcePath = ref(examples[0].sourcePath)
const sourceText = ref(examples[0].sourceText)
const input = ref(examples[0].input)
const maxEvals = ref(examples[0].maxEvals ?? 10_000)
const maxStateBytes = ref(examples[0].maxStateBytes ?? 1_000_000)
const coverage = ref(examples[0].coverage ?? true)
const running = ref(false)
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

async function runDemo(): Promise<void> {
  clearOutput()
  running.value = true
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
  } catch (error) {
    result.exitCode = 1
    result.error = error instanceof Error ? error.message : String(error)
  } finally {
    running.value = false
  }
}

loadSelectedExample()
</script>
