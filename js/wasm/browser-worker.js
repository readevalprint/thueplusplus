let thueppReady;

async function init(options = {}) {
  if (thueppReady) return thueppReady;
  if (typeof globalThis.Go !== 'function') {
    if (!options.wasmExecURL) throw new Error('wasmExecURL is required when wasm_exec.js is not preloaded');
    importScripts(options.wasmExecURL);
  }
  const go = new globalThis.Go();
  const response = await fetch(options.wasmURL || 'thuepp.wasm');
  const bytes = await response.arrayBuffer();
  const { instance } = await WebAssembly.instantiate(bytes, go.importObject);
  go.run(instance).catch((err) => postMessage({ type: 'runtime-error', error: String(err && err.stack || err) }));
  thueppReady = waitForAPI();
  return thueppReady;
}

async function waitForAPI() {
  for (let i = 0; i < 100; i += 1) {
    if (globalThis.ThuePP && typeof globalThis.ThuePP.run === 'function') return globalThis.ThuePP;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('ThuePP.run was not registered by the Go WASM module');
}

self.onmessage = async (event) => {
  const message = event.data || {};
  try {
    if (message.type === 'init') {
      await init(message);
      postMessage({ type: 'ready', id: message.id });
      return;
    }
    if (message.type === 'run') {
      const api = await init(message);
      const result = await api.run(message.options || {});
      postMessage({ type: 'result', id: message.id, result });
      return;
    }
    postMessage({ type: 'error', id: message.id, error: `unknown worker message type ${message.type}` });
  } catch (err) {
    postMessage({ type: 'error', id: message.id, error: String(err && err.stack || err) });
  }
};
