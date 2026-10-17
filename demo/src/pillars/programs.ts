import helloSource from '../../../examples/hello/hello.thue?raw'
import type { DemoRunRequest } from '@/wasm'
import { splitProgramSource } from '@/thueSource'

export const portableSource = helloSource
export const portablePath = 'examples/hello/hello.thue'

const portableSplit = splitProgramSource(portableSource)
if (portableSplit.error) throw new Error(portableSplit.error)
if (!portableSplit.state) throw new Error(`${portablePath} has no initial state`)
export const portableInput = portableSplit.state

export const sandboxLimits = {
  maxSteps: 4,
  maxEvals: 32,
  maxStateBytes: 64,
} as const

// A write to stdout is bound. A write to socket is not. Then the state grows until the step limit.
export const sandboxSource = [
  '^start$ ::> stdout in\\n',
  '^$ ::> socket x\\n',
  '^ERR:resource:socket$ ::= a',
  'a ::= aa',
  '',
  '::=',
  'start',
  '',
].join('\n')

export const sandboxPath = 'landing/sandbox.thue'
export const sandboxInput = 'start'

export function portableRequest(): DemoRunRequest {
  return {
    sourceText: portableSource,
    sourcePath: portablePath,
    input: portableInput,
    maxSteps: 1_000_000,
    maxEvals: 1_000_000,
    maxStateBytes: 8_388_608,
    coverage: false,
    resources: [],
    trace: true,
  }
}

export function sandboxRequest(): DemoRunRequest {
  return {
    sourceText: sandboxSource,
    sourcePath: sandboxPath,
    input: sandboxInput,
    maxSteps: sandboxLimits.maxSteps,
    maxEvals: sandboxLimits.maxEvals,
    maxStateBytes: sandboxLimits.maxStateBytes,
    coverage: false,
    resources: [],
    trace: true,
  }
}
