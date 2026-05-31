let thueppReady;

async function init(options = {}) {
  if (thueppReady) return thueppReady;
  if (typeof globalThis.Go !== 'function') {
    if (!options.wasmExecURL) throw new Error('wasmExecURL is required when wasm_exec.js is not preloaded');
    importScripts(options.wasmExecURL);
  }
  const go = new globalThis.Go();
  const wasmURL = options.wasmURL || 'thuepp.wasm';
  const response = await fetch(wasmURL);
  if (!response.ok) {
    throw new Error(`failed to fetch ${wasmURL}: HTTP ${response.status}`);
  }
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

function splitLines(text) {
  if (!text) return [];
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line, index, lines) => line !== '' || index < lines.length - 1);
}

function shiftLine(buffer) {
  if (!buffer.text) return '';
  const newline = buffer.text.indexOf('\n');
  if (newline < 0) {
    const line = buffer.text;
    buffer.text = '';
    return line.endsWith('\r') ? line.slice(0, -1) : line;
  }
  const line = buffer.text.slice(0, newline);
  buffer.text = buffer.text.slice(newline + 1);
  return line.endsWith('\r') ? line.slice(0, -1) : line;
}

function shiftSubmittedValue(buffer) {
  const value = buffer.text;
  buffer.text = '';
  return value;
}

function buildResources(options) {
  const logs = [];
  const resources = {};
  const configsByName = new Map();
  for (const config of Array.isArray(options.resourceConfig) ? options.resourceConfig : []) {
    const name = String(config && config.name || '').trim();
    if (name) configsByName.set(name, config);
  }

  function addResource(name, fallbackInput = '') {
    if (resources[name]) return;
    const config = configsByName.get(name) || {};
    const buffer = { text: String(config.inputText ?? fallbackInput) };
    const submittedValueMode = Object.prototype.hasOwnProperty.call(config, 'inputText') && !config.lineMode;
    const log = { name, reads: [], writes: [], errors: [], remainingInputText: buffer.text, outputText: '' };
    logs.push(log);
    resources[name] = {
      readLine() {
        if (config.readError) {
          log.errors.push(String(config.readError));
          log.remainingInputText = buffer.text;
          return { error: String(config.readError) };
        }
        if (!buffer.text) {
          const pending = `WAIT:resource:${name}:pending_input`;
          log.errors.push(pending);
          log.remainingInputText = buffer.text;
          return { error: pending };
        }
        const line = submittedValueMode ? shiftSubmittedValue(buffer) : shiftLine(buffer);
        log.reads.push(line);
        log.remainingInputText = buffer.text;
        return line;
      },
      write(text) {
        const value = String(text);
        log.writes.push(value);
        log.outputText += value;
        return '';
      },
      close() {},
    };
  }

  addResource('stdin', options.input || '');
  addResource('stdout');
  addResource('stderr');
  for (const name of configsByName.keys()) addResource(name);

  return { resources, logs };
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
      const options = { ...(message.options || {}) };
      const built = buildResources(options);
      options.resources = built.resources;
      delete options.resourceConfig;
      const result = await api.run(options);
      postMessage({ type: 'result', id: message.id, result: { ...result, resourceLogs: built.logs } });
      return;
    }
    postMessage({ type: 'error', id: message.id, error: `unknown worker message type ${message.type}` });
  } catch (err) {
    postMessage({ type: 'error', id: message.id, error: String(err && err.stack || err) });
  }
};
