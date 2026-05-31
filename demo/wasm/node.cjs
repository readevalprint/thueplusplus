// SPDX-License-Identifier: AGPL-3.0-or-later
'use strict';

const fs = require('fs');
const path = require('path');

let singleton;

function defaultWasmExecPath() {
  const goroot = process.env.GOROOT || require('child_process').execFileSync('go', ['env', 'GOROOT'], { encoding: 'utf8' }).trim();
  return path.join(goroot, 'lib', 'wasm', 'wasm_exec.js');
}

function loadWasmExec(wasmExecPath) {
  if (typeof globalThis.Go === 'function') return;
  require(wasmExecPath || process.env.WASM_EXEC_JS || defaultWasmExecPath());
}

async function waitForAPI() {
  for (let i = 0; i < 100; i += 1) {
    if (globalThis.ThuePP && typeof globalThis.ThuePP.run === 'function') {
      return globalThis.ThuePP;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('ThuePP.run was not registered by the Go WASM module');
}

async function initThuePP(options = {}) {
  if (singleton && !options.fresh) return singleton;

  loadWasmExec(options.wasmExecPath);
  const wasmPath = options.wasmPath || process.env.THUEPP_WASM || path.join(__dirname, '..', '..', 'build', 'thuepp.wasm');
  const bytes = fs.readFileSync(wasmPath);
  const go = new globalThis.Go();
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  const runtime = go.run(instance);
  runtime.catch((err) => {
    if (options.onRuntimeError) options.onRuntimeError(err);
    else console.error('thue++ WASM runtime failed:', err && err.stack || err);
  });
  const api = await waitForAPI();
  singleton = {
    run: (runOptions) => api.run(runOptions),
    api,
    runtime,
  };
  return singleton;
}

module.exports = { initThuePP };
