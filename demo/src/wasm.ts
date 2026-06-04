// SPDX-License-Identifier: AGPL-3.0-or-later
export interface DemoResourceConfig {
  name: string
  inputText: string
  lineMode?: boolean
  readError?: string
}

export interface DemoRunRequest {
  sourceText: string
  sourcePath: string
  input: string
  evalLimit: number
  maxStateBytes: number
  coverage: boolean
  resources: DemoResourceConfig[]
  procs?: Record<string, string>
  trace?: boolean
  stepLimit?: number
  signal?: AbortSignal
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
  evalCheckCount?: number
  cumulativeStateBytes?: number
  resourceLogs?: DemoResourceLog[]
  trace?: DemoTraceEvent[]
}

interface WorkerClient {
  run(request: unknown): Promise<DemoRunResult>
  terminate(): void
}

declare const ThuePPWorker: new (workerURL: string, initOptions: { wasmURL: string; wasmExecURL: string }) => WorkerClient

function publicAssetURL(fileName: string): string {
  return new URL(`${import.meta.env.BASE_URL}${fileName}`, window.location.href).toString()
}

export async function runWithWorker(request: DemoRunRequest): Promise<DemoRunResult> {
  if (request.signal?.aborted) throw abortError()
  const { ThuePPWorker: Client } = await import('../wasm/worker-client.js') as unknown as {
    ThuePPWorker: typeof ThuePPWorker
  }

  const client = new Client(new URL('../wasm/browser-worker.js', import.meta.url).toString(), {
    wasmURL: publicAssetURL('thuepp.wasm'),
    wasmExecURL: publicAssetURL('wasm_exec.js'),
  })
  const abort = () => client.terminate()
  request.signal?.addEventListener('abort', abort, { once: true })

  try {
    if (request.signal?.aborted) throw abortError()
    const result = await client.run({
      sourceText: request.sourceText,
      sourcePath: request.sourcePath,
      input: request.input,
      evalLimit: request.evalLimit,
      maxStateBytes: request.maxStateBytes,
      coverage: request.coverage,
      resourceConfig: request.resources,
      procs: request.procs,
      trace: request.trace,
      stepLimit: request.stepLimit,
    })
    if (request.signal?.aborted) throw abortError()
    return {
      ...result,
      coverage: result.coverageTSV ?? result.coverage ?? '',
    }
  } finally {
    request.signal?.removeEventListener('abort', abort)
    client.terminate()
  }
}

function abortError(): DOMException {
  return new DOMException('Run aborted', 'AbortError')
}
