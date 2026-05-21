<template>
  <main class="shell">
    <header>
      <p class="eyebrow">thue++ Go-WASM demo</p>
      <h1>Browser shell backed by the real Go interpreter</h1>
      <p>
        This scaffold loads the browser worker adapter from <code>js/wasm/</code>.
        JavaScript supplies callback resources; it does not evaluate thue++ rules.
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
      <button type="button" @click="clearOutput">Clear output</button>
    </section>

    <section class="grid">
      <label class="panel span">
        Source (.tpp)
        <textarea v-model="sourceText" spellcheck="false" />
      </label>
      <label class="panel">
        Browser stdin buffer
        <textarea v-model="input" spellcheck="false" />
      </label>
      <section class="panel">
        <h2>Run result</h2>
        <p>Exit code: <strong>{{ result.exitCode ?? 'not run' }}</strong></p>
        <p v-if="result.error" class="error">{{ result.error }}</p>
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
        <h2>coverage TSV</h2>
        <pre>{{ result.coverage }}</pre>
      </section>
    </section>
  </main>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { examples } from './examples'
import { runWithWorker, type DemoRunResult } from './wasm'

const selectedId = ref(examples[0].id)
const sourceText = ref(examples[0].sourceText)
const input = ref(examples[0].input)
const maxEvals = ref(10_000)
const maxStateBytes = ref(1_000_000)
const coverage = ref(true)
const running = ref(false)
const result = reactive<DemoRunResult>({ stdout: '', stderr: '', coverage: '' })

function loadSelectedExample(): void {
  const example = examples.find(item => item.id === selectedId.value) ?? examples[0]
  sourceText.value = example.sourceText
  input.value = example.input
  clearOutput()
}

function clearOutput(): void {
  result.exitCode = undefined
  result.stdout = ''
  result.stderr = ''
  result.coverage = ''
  result.error = ''
}

async function runDemo(): Promise<void> {
  clearOutput()
  running.value = true
  try {
    Object.assign(result, await runWithWorker({
      sourceText: sourceText.value,
      sourcePath: 'demo-inline.tpp',
      input: input.value,
      maxEvals: maxEvals.value,
      maxStateBytes: maxStateBytes.value,
      coverage: coverage.value,
    }))
  } catch (error) {
    result.exitCode = 1
    result.error = error instanceof Error ? error.message : String(error)
  } finally {
    running.value = false
  }
}
</script>
