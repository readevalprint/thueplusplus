export async function initThuePPWasm(options = {}) {
  if (typeof globalThis.Go !== 'function') {
    if (!options.wasmExecURL) {
      throw new Error('Go wasm_exec.js must be loaded first or provided as wasmExecURL');
    }
    await import(options.wasmExecURL);
  }

  const wasmURL = options.wasmURL || '/thuepp.wasm';
  const go = new globalThis.Go();
  const result = await WebAssembly.instantiateStreaming(fetch(wasmURL), go.importObject);
  go.run(result.instance).catch((err) => {
    if (options.onRuntimeError) options.onRuntimeError(err);
    else console.error('thue++ WASM runtime failed:', err);
  });

  for (let i = 0; i < 100; i += 1) {
    if (globalThis.ThuePP && typeof globalThis.ThuePP.run === 'function') {
      return { run: (runOptions) => globalThis.ThuePP.run(runOptions) };
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('ThuePP.run was not registered by the Go WASM module');
}
