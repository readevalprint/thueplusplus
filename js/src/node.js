import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const here = dirname(fileURLToPath(import.meta.url))

let singleton

function defaultWasmExecPath() {
  const goroot = process.env.GOROOT || execFileSync('go', ['env', 'GOROOT'], { encoding: 'utf8' }).trim()
  return join(goroot, 'lib', 'wasm', 'wasm_exec.js')
}

function loadWasmExec(wasmExecPath) {
  if (typeof globalThis.Go === 'function') return
  require(wasmExecPath || process.env.WASM_EXEC_JS || defaultWasmExecPath())
}

async function waitForAPI() {
  for (let i = 0; i < 100; i += 1) {
    if (globalThis.ThuePP && typeof globalThis.ThuePP.run === 'function') return globalThis.ThuePP
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('ThuePP.run was not registered by the Go WASM module')
}

export async function initThuePP(options = {}) {
  if (singleton && !options.fresh) return singleton
  loadWasmExec(options.wasmExecPath)
  const wasmPath = options.wasmPath || process.env.THUEPP_WASM || join(here, '..', '..', 'build', 'thuepp.wasm')
  const bytes = readFileSync(wasmPath)
  const go = new globalThis.Go()
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject)
  const runtime = go.run(instance)
  runtime.catch((err) => {
    if (options.onRuntimeError) options.onRuntimeError(err)
    else console.error('thue++ WASM runtime failed:', err && err.stack || err)
  })
  const api = await waitForAPI()
  singleton = {
    run: (runOptions) => api.run(runOptions),
    api,
    runtime,
  }
  return singleton
}
