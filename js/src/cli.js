#!/usr/bin/env node
// Thin Node host. It speaks the same argv contract as the Go and Python CLIs.
// Process bindings are opt-in: the wasm module never spawns a process itself.

import { writeFileSync, readFileSync, writeSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { Worker } from 'node:worker_threads'
import { fileURLToPath } from 'node:url'
import { initThue } from './node.js'

const here = dirname(fileURLToPath(import.meta.url))
const HEADER_BYTES = 12
const MAX_PAYLOAD = 1024 * 1024
const sab = new SharedArrayBuffer(HEADER_BYTES + MAX_PAYLOAD)
const header = new Int32Array(sab, 0, 3)
const ioWorker = new Worker(new URL('./proc-host.cjs', import.meta.url))
const STDIN_HEADER_BYTES = 16
const STDIN_MAX_PAYLOAD = 1024 * 1024
const stdinSab = new SharedArrayBuffer(STDIN_HEADER_BYTES + STDIN_MAX_PAYLOAD)
const stdinHeader = new Int32Array(stdinSab, 0, 4)
const stdinWorker = new Worker(new URL('./stdin-host.cjs', import.meta.url))
stdinWorker.postMessage({ sab: stdinSab })

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const wasmPath = process.env.THUE_WASM || resolve(here, '..', '..', 'build', 'thue.wasm')
    const sourceText = readProgram(options.program)
    const thue = await initThue({ wasmPath })
    const resources = {
      stdin: { readLine: (timeoutSeconds) => readStdinLine(timeoutSeconds) },
      stdout: { write: (content) => { writeSync(1, String(content)); return '' } },
      stderr: { write: (content) => { writeSync(2, String(content)); return '' } },
    }
    for (const proc of options.procs) {
      resources[proc.name] = {
        readLine: (timeoutSeconds) => callProc('read', proc, { timeoutSeconds }),
        write: (content) => callProc('write', proc, { content: String(content) }),
        close: () => {},
      }
    }
    const runOptions = {
      sourcePath: options.program,
      sourceText,
      maxEvals: options.maxEvals,
      maxStateBytes: options.maxStateBytes,
      maxSteps: options.maxSteps,
      debug: options.debug,
      trace: options.trace,
      listRules: options.listRules,
      coverage: Boolean(options.ruleCoverage),
      resources,
    }
    if (Object.prototype.hasOwnProperty.call(options, 'input')) runOptions.input = options.input
    const result = await thue.run(runOptions)
    if (options.ruleCoverage) writeFileSync(options.ruleCoverage, result.coverageTSV || '', 'utf8')
    if (options.counts && !options.listRules) writeCounts(options.counts, result)
    process.stdout.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
    if (options.trace) process.stderr.write(formatTrace(result.trace))
    if (result.error) process.stderr.write(`Error: ${result.error}\n`)
    await cleanup()
    process.exit(result.exitCode ?? 1)
  } catch (error) {
    process.stderr.write(`Error: ${error && error.message ? error.message : error}\n`)
    await cleanup()
    process.exit(1)
  }
}

function parseArgs(argv) {
  if (argv.length === 0) {
    process.stderr.write('usage: thue <program> [--proc:<name> <command>]... [--input <state>] [options]\n')
    process.exit(2)
  }
  const options = { program: resolve(argv[0]), procs: [], debug: false, listRules: false }
  for (let index = 1; index < argv.length;) {
    const arg = argv[index]
    if (arg === '--debug') {
      options.debug = true
      index += 1
    } else if (arg === '--trace') {
      options.trace = true
      index += 1
    } else if (arg === '--list-rules') {
      options.listRules = true
      index += 1
    } else if (arg === '--rule-coverage' || arg.startsWith('--rule-coverage=')) {
      options.ruleCoverage = takeValue(argv, index, '--rule-coverage')
      index += arg.startsWith('--rule-coverage=') ? 1 : 2
    } else if (arg === '--counts' || arg.startsWith('--counts=')) {
      options.counts = takeValue(argv, index, '--counts')
      index += arg.startsWith('--counts=') ? 1 : 2
    } else if (arg === '--input' || arg.startsWith('--input=')) {
      options.input = takeValue(argv, index, '--input')
      index += arg.startsWith('--input=') ? 1 : 2
    } else if (arg === '--max-evals' || arg.startsWith('--max-evals=')) {
      options.maxEvals = takeLimit(argv, index, '--max-evals')
      index += arg.startsWith('--max-evals=') ? 1 : 2
    } else if (arg === '--max-state-bytes' || arg.startsWith('--max-state-bytes=')) {
      options.maxStateBytes = takeLimit(argv, index, '--max-state-bytes')
      index += arg.startsWith('--max-state-bytes=') ? 1 : 2
    } else if (arg === '--max-steps' || arg.startsWith('--max-steps=')) {
      options.maxSteps = takeLimit(argv, index, '--max-steps')
      index += arg.startsWith('--max-steps=') ? 1 : 2
    } else if (arg.startsWith('--proc:')) {
      const name = arg.slice('--proc:'.length)
      if (index + 1 >= argv.length) {
        process.stderr.write(`Error: --proc:${name} requires a command argument\n`)
        process.exit(1)
      }
      options.procs.push({ name, command: argv[index + 1] })
      index += 2
    } else {
      process.stderr.write(`Error: Unknown argument: ${arg}\n`)
      process.exit(1)
    }
  }
  return options
}

function writeCounts(path, result) {
  if (!Number.isInteger(result.appliedSteps) || !Number.isInteger(result.evalCount)) {
    process.stderr.write('Error: host result missing integer appliedSteps and evalCount\n')
    process.exit(1)
  }
  writeFileSync(path, `${JSON.stringify({ applied_steps: result.appliedSteps, probes: result.evalCount })}\n`)
}

function takeValue(argv, index, flag) {
  const arg = argv[index]
  const equals = `${flag}=`
  if (arg.startsWith(equals)) return arg.slice(equals.length)
  if (index + 1 >= argv.length) {
    process.stderr.write(`Error: ${flag} requires an argument\n`)
    process.exit(1)
  }
  return argv[index + 1]
}

function takeLimit(argv, index, flag) {
  const text = takeValue(argv, index, flag)
  if (text === 'unlimited') return null
  if (!/^-?\d+$/.test(text)) {
    process.stderr.write(`strconv.Atoi: parsing ${JSON.stringify(text)}: invalid syntax\n`)
    process.exit(2)
  }
  return Number(text)
}

function readProgram(program) {
  try {
    return readFileSync(program, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      process.stderr.write(`Error: File not found: ${program}\n`)
      process.exit(1)
    }
    throw error
  }
}

function readStdinLine(timeoutSeconds) {
  const timeoutMs = Number(timeoutSeconds) * 1000
  const deadline = Date.now() + timeoutMs
  while (Atomics.load(stdinHeader, 0) === 0) {
    const remaining = deadline - Date.now()
    if (!(remaining > 0)) return { error: 'timeout' }
    Atomics.wait(stdinHeader, 0, 0, remaining)
  }
  const kind = Atomics.load(stdinHeader, 2)
  const length = Atomics.load(stdinHeader, 1)
  const text = Buffer.from(new Uint8Array(stdinSab, STDIN_HEADER_BYTES, length)).toString('utf8')
  if (kind === 1) {
    Atomics.store(stdinHeader, 0, 0)
    Atomics.notify(stdinHeader, 0, 1)
    return text
  }
  return { error: text || 'EOF before newline' }
}

function formatTrace(events) {
  if (!events || !events.length) return ''
  const lines = events.map((event) => JSON.stringify({
    step: event.step,
    ruleIndex: event.ruleIndex,
    lineNumber: event.lineNumber,
    operator: event.operator,
    matchStart: event.matchStart,
    matchEnd: event.matchEnd,
    error: event.error || '',
    stateBefore: event.stateBefore,
    replacement: event.replacement || '',
    stateAfter: event.stateAfter,
    exitCode: event.exitCode == null ? null : event.exitCode,
  }))
  return lines.join('\n') + '\n'
}

function callProc(op, proc, extra) {
  Atomics.store(header, 0, 0)
  ioWorker.postMessage({ op, sab, name: proc.name, command: proc.command, ...extra })
  const timeoutMs = op === 'read' ? Math.max(0, Number(extra.timeoutSeconds) * 1000) + 1000 : 10000
  Atomics.wait(header, 0, 0, timeoutMs)
  if (Atomics.load(header, 0) !== 1) return { error: 'timeout' }
  const length = Atomics.load(header, 1)
  const text = Buffer.from(new Uint8Array(sab, HEADER_BYTES, length)).toString('utf8')
  if (Atomics.load(header, 2) === 1) return { error: text || 'unknown resource error' }
  return op === 'write' ? '' : text
}

function cleanup() {
  Atomics.store(header, 0, 0)
  ioWorker.postMessage({ op: 'cleanup', sab })
  Atomics.wait(header, 0, 0, 1000)
  return Promise.all([ioWorker.terminate(), stdinWorker.terminate()])
}

main()
