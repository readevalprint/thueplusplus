// SPDX-License-Identifier: AGPL-3.0-or-later
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function loadWorkerClient() {
  const source = fs.readFileSync(path.join(__dirname, 'worker-client.js'), 'utf8')
    .replace('export class ThuePPWorker', 'class ThuePPWorker') + '\nmodule.exports = { ThuePPWorker };\n';
  const module = { exports: {} };
  const context = {
    module,
    exports: module.exports,
    Error,
    setTimeout,
    clearTimeout,
    globalThis: {},
  };
  vm.runInNewContext(source, context, { filename: 'worker-client.js' });
  return module.exports.ThuePPWorker;
}

function loadBrowserWorkerInternals() {
  const source = fs.readFileSync(path.join(__dirname, 'browser-worker.js'), 'utf8');
  const context = {
    console,
    setTimeout,
    clearTimeout,
    WebAssembly,
    fetch: async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0) }),
    importScripts() {},
    postMessage() {},
  };
  context.globalThis = context;
  context.self = context;
  vm.runInNewContext(source, context, { filename: 'browser-worker.js' });
  return {
    buildResources: context.buildResources,
    shiftLine: context.shiftLine,
    splitLines: context.splitLines,
  };
}

class MockWorker {
  constructor(url) {
    this.url = url;
    this.messages = [];
    this.terminated = false;
    MockWorker.last = this;
  }

  postMessage(message) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }
}

async function rejectsWith(promise, pattern) {
  let rejected = false;
  try {
    await promise;
  } catch (err) {
    rejected = true;
    assert.match(String(err && err.message || err), pattern);
  }
  assert.ok(rejected, `expected rejection matching ${pattern}`);
}

(async () => {
  const ThuePPWorker = loadWorkerClient();

  const errorClient = new ThuePPWorker('worker.js', {}, { Worker: MockWorker, requestTimeoutMs: 0 });
  MockWorker.last.onerror({ message: 'blocked by CSP' });
  await rejectsWith(errorClient.ready, /blocked by CSP/);

  const runtimeClient = new ThuePPWorker('worker.js', {}, { Worker: MockWorker, requestTimeoutMs: 0 });
  MockWorker.last.onmessage({ data: { type: 'runtime-error', error: 'go runtime died' } });
  await rejectsWith(runtimeClient.ready, /go runtime died/);

  const timeoutClient = new ThuePPWorker('worker.js', {}, { Worker: MockWorker, requestTimeoutMs: 5 });
  await rejectsWith(timeoutClient.ready, /request timed out: init/);
  assert.strictEqual(MockWorker.last.messages[0].type, 'init');

  const internals = loadBrowserWorkerInternals();
  const stdin = internals.buildResources({ input: 'a\n\n' });
  assert.strictEqual(stdin.resources.stdin.readAll, undefined);
  assert.strictEqual(stdin.resources.stdin.readLines(1), 'a');
  assert.strictEqual(stdin.resources.stdin.readLines(1), '');
  assert.deepStrictEqual(Array.from(stdin.logs[0].reads), ['a', '']);

  const mixedStdin = internals.buildResources({ input: 'Ada\nLovelace\n' });
  assert.strictEqual(mixedStdin.resources.stdin.readLines(1), 'Ada');
  assert.strictEqual(mixedStdin.resources.stdin.readLines(1), 'Lovelace');

  const resource = internals.buildResources({
    resourceConfig: [{ name: 'echo', inputText: '  ping  \nlast' }],
  });
  resource.resources.echo.write('ignored by reads\n');
  assert.strictEqual(resource.resources.echo.readLines(1), '  ping  \nlast');
  assert.strictEqual(resource.resources.echo.readLines(1).error, 'WAIT:resource:echo:pending_input');
  const echoLog = resource.logs.find((log) => log.name === 'echo');
  assert.deepStrictEqual(Array.from(echoLog.writes), ['ignored by reads\n']);
  assert.deepStrictEqual(Array.from(echoLog.reads), ['  ping  \nlast']);
  assert.deepStrictEqual(Array.from(echoLog.errors), ['WAIT:resource:echo:pending_input']);
  assert.strictEqual(echoLog.remainingInputText, '');
  assert.strictEqual(echoLog.outputText, 'ignored by reads\n');

  console.log('browser adapter unit tests ok');
})().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
