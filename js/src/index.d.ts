export interface RunOptions {
  sourceText: string
  sourcePath?: string
  input?: string
  maxEvals?: number | null
  maxStateBytes?: number | null
  maxSteps?: number | null
  debug?: boolean
  trace?: boolean
  coverage?: boolean
  listRules?: boolean
  resources?: Record<string, ResourceCallbacks>
  procs?: Record<string, string>
}

export interface ResourceCallbacks {
  readLine?: (timeoutSeconds: number) => string | { error: string }
  write?: (content: string) => string | { error: string }
  close?: () => void
}

export interface TraceEvent {
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

export interface RunResult {
  exitCode: number
  stdout: string
  stderr: string
  error?: string
  errors?: string
  state?: string
  evalCount?: number
  appliedSteps?: number
  trace?: TraceEvent[]
  coverageTSV?: string
  limit?: 'steps' | 'evals' | 'state' | 'timeout'
}

export interface Engine {
  run(options: RunOptions): Promise<RunResult>
}

export interface InitOptions {
  wasmPath?: string
  wasmExecPath?: string
  fresh?: boolean
  onRuntimeError?: (error: unknown) => void
}

export function initThuePP(options?: InitOptions): Promise<Engine>

export interface BrowserInitOptions {
  wasmURL?: string
  wasmExecURL?: string
  onRuntimeError?: (error: unknown) => void
}

export function initThuePPWasm(options?: BrowserInitOptions): Promise<Engine>

export class ThuePPWorker {
  constructor(workerURL: string, initOptions?: { wasmURL: string; wasmExecURL: string }, clientOptions?: { Worker?: typeof Worker; requestTimeoutMs?: number })
  run(options: RunOptions): Promise<RunResult>
  terminate(): void
}
