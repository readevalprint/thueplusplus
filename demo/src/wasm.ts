export interface DemoRunRequest {
  sourceText: string
  sourcePath: string
  input: string
  maxEvals: number
  maxStateBytes: number
  coverage: boolean
}

export interface DemoRunResult {
  exitCode?: number
  stdout?: string
  stderr?: string
  coverage?: string
  error?: string
}

interface WorkerClient {
  run(request: unknown): Promise<DemoRunResult>
  terminate(): void
}

declare const ThuePPWorker: new (workerURL: string, initOptions: { wasmURL: string; wasmExecURL: string }) => WorkerClient

export async function runWithWorker(request: DemoRunRequest): Promise<DemoRunResult> {
  const { ThuePPWorker: Client } = await import('../../js/wasm/worker-client.js') as unknown as {
    ThuePPWorker: typeof ThuePPWorker
  }

  const client = new Client(new URL('../../js/wasm/browser-worker.js', import.meta.url).toString(), {
    wasmURL: '/thuepp.wasm',
    wasmExecURL: '/wasm_exec.js',
  })

  try {
    return await client.run({
      sourceText: request.sourceText,
      sourcePath: request.sourcePath,
      input: request.input,
      maxEvals: request.maxEvals,
      maxStateBytes: request.maxStateBytes,
      coverage: request.coverage,
      resources: {},
    })
  } finally {
    client.terminate()
  }
}
