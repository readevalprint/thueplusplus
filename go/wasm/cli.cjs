'use strict'

// Command-line host for the Go wasm build. It speaks the same argv, stdin,
// stdout, stderr, and exit-code contract as go/cmd/thuepp. Process bindings
// are host opt-in: the wasm module never spawns a process itself.

const fs = require('fs')
const path = require('path')
const { Worker } = require('worker_threads')
const { initThuePP } = require('../../demo/wasm/node.cjs')

const HEADER_BYTES = 12
const MAX_PAYLOAD = 1024 * 1024
const sab = new SharedArrayBuffer(HEADER_BYTES + MAX_PAYLOAD)
const header = new Int32Array(sab, 0, 3)
const ioWorker = new Worker(path.join(__dirname, 'proc_host.cjs'))

let stdinBuffer = ''
let stdinEOF = false

async function main() {
  try {
    const options = parseArgs(process.argv.slice(2))
    const wasmPath = process.env.THUEPP_WASM || path.join(__dirname, '..', '..', 'build', 'thuepp.wasm')
    const sourceText = readProgram(options.program)
    const thuepp = await initThuePP({ wasmPath })
    const resources = {
      stdin: { readLine: () => readStdinLine() },
      // Stream stdio as the writes happen. The wasm result buffers them only
      // until run() returns, which is too late for a parent reading a child.
      stdout: { write: (content) => { fs.writeSync(1, String(content)); return '' } },
      stderr: { write: (content) => { fs.writeSync(2, String(content)); return '' } },
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
      stepLimit: options.maxSteps,
      debug: options.debug,
      listRules: options.listRules,
      coverage: Boolean(options.ruleCoverage),
      resources,
    }
    if (Object.prototype.hasOwnProperty.call(options, 'input')) runOptions.input = options.input
    const result = await thuepp.run(runOptions)
    if (options.ruleCoverage) fs.writeFileSync(options.ruleCoverage, result.coverageTSV || '', 'utf8')
    process.stdout.write(result.stdout || '')
    process.stderr.write(result.stderr || '')
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
    process.stderr.write('usage: thuepp <program> [--proc:<name> <command>]... [--input <state>] [options]\n')
    process.exit(2)
  }
  const options = { program: path.resolve(argv[0]), procs: [], debug: false, listRules: false }
  for (let index = 1; index < argv.length;) {
    const arg = argv[index]
    if (arg === '--debug') {
      options.debug = true
      index += 1
    } else if (arg === '--list-rules') {
      options.listRules = true
      index += 1
    } else if (arg === '--rule-coverage' || arg.startsWith('--rule-coverage=')) {
      options.ruleCoverage = takeValue(argv, index, '--rule-coverage')
      index += arg.startsWith('--rule-coverage=') ? 1 : 2
    } else if (arg === '--input' || arg.startsWith('--input=')) {
      options.input = takeValue(argv, index, '--input')
      index += arg.startsWith('--input=') ? 1 : 2
    } else if (arg === '--max-evals' || arg.startsWith('--max-evals=')) {
      options.maxEvals = takeInt(argv, index, '--max-evals')
      index += arg.startsWith('--max-evals=') ? 1 : 2
    } else if (arg === '--max-state-bytes' || arg.startsWith('--max-state-bytes=')) {
      options.maxStateBytes = takeInt(argv, index, '--max-state-bytes')
      index += arg.startsWith('--max-state-bytes=') ? 1 : 2
    } else if (arg === '--max-steps' || arg.startsWith('--max-steps=')) {
      options.maxSteps = takeInt(argv, index, '--max-steps')
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

function takeInt(argv, index, flag) {
  const text = takeValue(argv, index, flag)
  if (!/^-?\d+$/.test(text)) {
    process.stderr.write(`strconv.Atoi: parsing ${JSON.stringify(text)}: invalid syntax\n`)
    process.exit(2)
  }
  return Number(text)
}

function readProgram(program) {
  try {
    return fs.readFileSync(program, 'utf8')
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      process.stderr.write(`Error: File not found: ${program}\n`)
      process.exit(1)
    }
    throw error
  }
}

function readStdinLine() {
  while (!stdinBuffer.includes('\n') && !stdinEOF) {
    const chunk = Buffer.alloc(4096)
    const n = fs.readSync(0, chunk, 0, chunk.length, null)
    if (n === 0) {
      stdinEOF = true
      break
    }
    stdinBuffer += chunk.subarray(0, n).toString('utf8')
  }
  const newline = stdinBuffer.indexOf('\n')
  if (newline < 0) return { error: 'EOF before newline' }
  let line = stdinBuffer.slice(0, newline)
  stdinBuffer = stdinBuffer.slice(newline + 1)
  if (line.endsWith('\r')) line = line.slice(0, -1)
  return line
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
  return ioWorker.terminate()
}

main()
