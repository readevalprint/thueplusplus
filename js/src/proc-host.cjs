'use strict'

const { spawn } = require('child_process')
const { parentPort } = require('worker_threads')

const procs = new Map()
const HEADER_BYTES = 12
const MAX_PAYLOAD = 1024 * 1024

parentPort.on('message', (message) => {
  if (!message || message.op === 'cleanup') {
    for (const state of procs.values()) kill(state)
    procs.clear()
    if (message && message.sab) finish(message.sab, false, '')
    return
  }
  try {
    if (message.op === 'write') write(message)
    else if (message.op === 'read') read(message)
    else finish(message.sab, true, `unknown host op ${message.op}`)
  } catch (error) {
    finish(message.sab, true, error && error.message ? error.message : String(error))
  }
})

function ensure(name, command) {
  const existing = procs.get(name)
  if (existing) return existing
  const child = spawn('/bin/sh', ['-c', `stdbuf -oL ${command}`], {
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const state = {
    child,
    buffer: '',
    lines: [],
    stderr: '',
    exitCode: null,
    exitError: null,
    stdoutEnded: false,
    waiters: [],
  }
  child.stdout.on('data', (chunk) => {
    state.buffer += chunk.toString('utf8')
    let newline = state.buffer.indexOf('\n')
    while (newline >= 0) {
      state.lines.push(state.buffer.slice(0, newline + 1))
      state.buffer = state.buffer.slice(newline + 1)
      newline = state.buffer.indexOf('\n')
    }
    deliver(state)
  })
  child.stdout.on('end', () => {
    state.stdoutEnded = true
    if (state.buffer !== '') {
      state.lines.push(state.buffer)
      state.buffer = ''
    }
    deliver(state)
  })
  child.stderr.on('data', (chunk) => {
    state.stderr += chunk.toString('utf8')
  })
  child.on('error', (error) => {
    state.exitError = error.message
    state.exitCode = state.exitCode ?? 1
    state.stdoutEnded = true
    deliver(state)
  })
  child.on('exit', (code) => {
    state.exitCode = code ?? 0
    deliver(state)
  })
  procs.set(name, state)
  return state
}

function write(message) {
  const state = ensure(message.name, message.command)
  if (state.exitCode !== null || !state.child.stdin.writable) {
    finish(message.sab, true, state.exitError || `process exited ${state.exitCode}`)
    return
  }
  state.child.stdin.write(message.content, 'utf8', (error) => {
    if (error) finish(message.sab, true, error.message)
    else finish(message.sab, false, '')
  })
}

function read(message) {
  const state = ensure(message.name, message.command)
  const timeoutMs = Math.max(0, Number(message.timeoutSeconds) * 1000)
  let settled = false
  const timer = setTimeout(() => {
    if (settled) return
    settled = true
    state.waiters = state.waiters.filter((waiter) => waiter !== complete)
    finish(message.sab, true, 'timeout')
  }, timeoutMs)
  function complete(payload) {
    if (settled) return
    settled = true
    clearTimeout(timer)
    finish(message.sab, payload.error !== undefined, payload.error ?? payload.line)
  }
  state.waiters.push(complete)
  deliver(state)
}

function deliver(state) {
  while (state.lines.length > 0 && state.waiters.length > 0) {
    const raw = state.lines.shift()
    const waiter = state.waiters.shift()
    const stripped = stripLine(raw)
    if (stripped === null) waiter({ error: 'EOF before newline' })
    else waiter({ line: stripped })
  }
  // stdout 'end' can lag the process exit. A fixed grace drops the line
  // when the host is busy. The caller's read timeout still bounds the wait.
  if (state.exitCode === null || !state.stdoutEnded || state.waiters.length === 0) return
  const error = exitMessage(state)
  while (state.waiters.length > 0) state.waiters.shift()({ error })
}

function exitMessage(state) {
  if (state.exitError) return state.exitError
  const stderr = state.stderr.trim()
  if (state.exitCode !== 0) return stderr || `process exited ${state.exitCode}`
  return 'EOF before newline'
}

function stripLine(line) {
  if (!line.endsWith('\n')) return null
  let text = line.slice(0, -1)
  if (text.endsWith('\r')) text = text.slice(0, -1)
  return text
}

function kill(state) {
  if (state.child.exitCode === null && state.child.signalCode === null) state.child.kill('SIGKILL')
}

function finish(sab, isError, text) {
  const encoded = Buffer.from(String(text), 'utf8')
  if (encoded.length > MAX_PAYLOAD) {
    text = 'resource payload exceeds host buffer'
    isError = true
  }
  const payload = Buffer.from(String(text), 'utf8')
  const header = new Int32Array(sab, 0, 3)
  new Uint8Array(sab, HEADER_BYTES, payload.length).set(payload)
  Atomics.store(header, 1, payload.length)
  Atomics.store(header, 2, isError ? 1 : 0)
  Atomics.store(header, 0, 1)
  Atomics.notify(header, 0, 1)
}
