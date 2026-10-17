import { ThueWorker } from 'thue-lang/worker'
import browserWorkerURL from 'thue-lang/browser-worker?url'

export interface DemoResourceConfig {
  name: string
  inputText: string
  readError?: string
}

export interface DemoRunRequest {
  sourceText: string
  sourcePath: string
  input: string
  maxEvals: number
  maxStateBytes: number
  coverage: boolean
  resources: DemoResourceConfig[]
  procs?: Record<string, string>
  trace?: boolean
  maxSteps?: number
}

export interface DemoResourceLog {
  name: string
  reads: string[]
  writes: string[]
  errors: string[]
  remainingInputText?: string
  outputText?: string
}

export interface DemoTraceEvent {
  step: number
  ruleIndex: number
  sourcePath: string
  lineNumber: number
  operator: string
  lhs: string
  matchStart: number
  matchEnd: number
  groups: Record<string, string>
  stateBefore: string
  replacement: string
  stateAfter: string
  exitCode?: number
  error?: string
}

export interface DemoRunResult {
  exitCode?: number
  stdout?: string
  stderr?: string
  coverage?: string
  coverageTSV?: string
  error?: string
  errors?: string
  state?: string
  evalCount?: number
  appliedSteps?: number
  resourceLogs?: DemoResourceLog[]
  trace?: DemoTraceEvent[]
  limit?: string
}

function publicAssetURL(fileName: string): string {
  return new URL(`${import.meta.env.BASE_URL}${fileName}`, window.location.href).toString()
}

export async function runWithWorker(request: DemoRunRequest): Promise<DemoRunResult> {
  const client = new ThueWorker(browserWorkerURL, {
    wasmURL: publicAssetURL('thue.wasm'),
    wasmExecURL: publicAssetURL('wasm_exec.js'),
  })

  try {
    const result = await client.run({
      sourceText: request.sourceText,
      sourcePath: request.sourcePath,
      input: request.input,
      maxEvals: request.maxEvals,
      maxStateBytes: request.maxStateBytes,
      coverage: request.coverage,
      resourceConfig: request.resources,
      procs: request.procs,
      trace: request.trace,
      maxSteps: request.maxSteps,
    })
    return {
      ...result,
      coverage: result.coverageTSV ?? '',
    }
  } finally {
    client.terminate()
  }
}
