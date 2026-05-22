export interface DemoResourceConfig {
  name: string
  readLines: string[]
  echoWrites: boolean
  readError?: string
}

export interface DemoRunRequest {
  sourceText: string
  sourcePath: string
  input: string
  maxEvals: number
  maxStateBytes: number
  coverage: boolean
  include: Record<string, string>
  resources: DemoResourceConfig[]
}

export interface DemoResourceLog {
  name: string
  reads: string[]
  writes: string[]
  errors: string[]
}

export interface DemoRunResult {
  exitCode?: number
  stdout?: string
  stderr?: string
  coverage?: string
  coverageTSV?: string
  error?: string
  errors?: string
  resourceLogs?: DemoResourceLog[]
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
  const { ThuePPWorker: Client } = await import('../../js/wasm/worker-client.js') as unknown as {
    ThuePPWorker: typeof ThuePPWorker
  }

  const client = new Client(new URL('../../js/wasm/browser-worker.js', import.meta.url).toString(), {
    wasmURL: publicAssetURL('thuepp.wasm'),
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
      include: request.include,
      resourceConfig: request.resources,
    })
    return {
      ...result,
      coverage: result.coverageTSV ?? result.coverage ?? '',
    }
  } finally {
    client.terminate()
  }
}
