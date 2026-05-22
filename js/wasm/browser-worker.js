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

function buildResources(options) {
  const logs = [];
  const resources = {};

  const stdinBuffer = { text: String(options.input || '') };
  logs.push({ name: 'stdin', reads: [], writes: [], errors: [] });
  resources.stdin = {
    readLine() {
      const line = shiftLine(stdinBuffer);
      logs[0].reads.push(line);
      return line;
    },
    readAll() {
      const text = stdinBuffer.text;
      stdinBuffer.text = '';
      logs[0].reads.push(text);
      return text;
    },
    write(text) {
      logs[0].writes.push(String(text));
      return '';
    },
  };

  const configs = Array.isArray(options.resourceConfig) ? options.resourceConfig : [];
  for (const config of configs) {
    const name = String(config && config.name || '').trim();
    if (!name) continue;
    const log = { name, reads: [], writes: [], errors: [] };
    const readQueue = Array.isArray(config.readLines) ? [...config.readLines] : splitLines(config.readLines || '');
    const echoBuffer = { text: '' };
    logs.push(log);
    resources[name] = {
      readLine() {
        if (config.readError) {
          log.errors.push(String(config.readError));
          return { error: String(config.readError) };
        }
        const value = readQueue.length > 0 ? readQueue.shift() : (echoBuffer.text ? shiftLine(echoBuffer) : undefined);
        if (value === undefined) {
          log.errors.push('timeout');
          return { error: 'timeout' };
        }
        log.reads.push(String(value));
        return String(value);
      },
      readAll() {
        if (config.readError) {
          log.errors.push(String(config.readError));
          return { error: String(config.readError) };
        }
        const queued = readQueue.splice(0).join('\n');
        const echoText = echoBuffer.text;
        echoBuffer.text = '';
        const all = queued && echoText ? `${queued}\n${echoText}` : queued || echoText;
        log.reads.push(all);
        return all;
      },
      write(text) {
        const value = String(text);
        log.writes.push(value);
        if (config.echoWrites) echoBuffer.text += value;
        return '';
      },
      close() {},
    };
  }

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
