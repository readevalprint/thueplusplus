import { run } from './engine.js'

export function splitLines(text) {
  if (!text) return [];
  return String(text).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter((line, index, lines) => line !== '' || index < lines.length - 1);
}

export function shiftLine(buffer) {
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

export function buildResources(options) {
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
    const submittedValueMode = Object.prototype.hasOwnProperty.call(config, 'inputText');
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
          const pending = `pending_input:${name}`;
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

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  globalThis.onmessage = async (event) => {
    const message = event.data || {};
    try {
      if (message.type === 'init') {
        postMessage({ type: 'ready', id: message.id });
        return;
      }
      if (message.type === 'run') {
        const options = { ...(message.options || {}) };
        const built = buildResources(options);
        options.resources = built.resources;
        delete options.resourceConfig;
        const result = await run(options);
        postMessage({ type: 'result', id: message.id, result: { ...result, resourceLogs: built.logs } });
        return;
      }
      postMessage({ type: 'error', id: message.id, error: `unknown worker message type ${message.type}` });
    } catch (err) {
      postMessage({ type: 'error', id: message.id, error: String(err && err.stack || err) });
    }
  };
}
