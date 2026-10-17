export async function initThueWasm(options = {}) {
  if (typeof globalThis.Go !== 'function') {
    if (!options.wasmExecURL) {
      throw new Error('Go wasm_exec.js must be loaded first or provided as wasmExecURL');
    }
    await import(options.wasmExecURL);
  }

  const wasmURL = options.wasmURL || new URL('thue.wasm', globalThis.location && globalThis.location.href || 'http://localhost/').toString();
  const response = await fetch(wasmURL);
  if (!response.ok) {
    throw new Error(`failed to fetch ${wasmURL}: HTTP ${response.status}`);
  }
  const go = new globalThis.Go();
  let result;
  try {
    result = await WebAssembly.instantiateStreaming(response.clone(), go.importObject);
  } catch (err) {
    const bytes = await response.arrayBuffer();
    result = await WebAssembly.instantiate(bytes, go.importObject);
  }
  go.run(result.instance).catch((err) => {
    if (options.onRuntimeError) options.onRuntimeError(err);
    else console.error('thue++ WASM runtime failed:', err);
  });

  for (let i = 0; i < 100; i += 1) {
    if (globalThis.Thue && typeof globalThis.Thue.run === 'function') {
      return { run: (runOptions) => globalThis.Thue.run(runOptions) };
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Thue.run was not registered by the Go WASM module');
}
