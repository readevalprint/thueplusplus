export interface ResourceConfig {
  name: string
  inputText?: string
  readError?: string
}

export interface ResourceLog {
  name: string
  reads: string[]
  writes: string[]
  errors: string[]
  remainingInputText?: string
  outputText?: string
}

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
  resourceConfig?: ResourceConfig[]
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

export interface RunMetrics {
  applied_steps: number
  regex_evals: number
  regex_matches: number
  state_bytes: number
  state_peak: number
  rule_count: number
  rule_chars: number
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
  metrics?: RunMetrics
  trace?: TraceEvent[]
  coverageTSV?: string
  resourceLogs?: ResourceLog[]
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

export function initThue(options?: InitOptions): Promise<Engine>

export interface BrowserInitOptions {
  wasmURL?: string
  wasmExecURL?: string
  onRuntimeError?: (error: unknown) => void
}

export function initThueWasm(options?: BrowserInitOptions): Promise<Engine>

export class ThueWorker {
  constructor(workerURL: string, initOptions?: { wasmURL: string; wasmExecURL: string }, clientOptions?: { Worker?: typeof Worker; requestTimeoutMs?: number })
  run(options: RunOptions): Promise<RunResult>
  terminate(): void
}
