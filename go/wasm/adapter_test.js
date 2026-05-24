const assert = require('assert');
const path = require('path');
const { Worker } = require('worker_threads');
const { initThuePP } = require('../../js/wasm/node.cjs');

const wasmPath = process.env.THUEPP_WASM || path.join(__dirname, '..', '..', 'build', 'thuepp.wasm');

function request(worker, message) {
  return new Promise((resolve, reject) => {
    const id = Math.floor(Math.random() * 1e9);
    const timer = setTimeout(() => reject(new Error('worker response timeout')), 5000);
    function onMessage(reply) {
      if (!reply || reply.id !== id) return;
      clearTimeout(timer);
      worker.off('message', onMessage);
      if (reply.type === 'error') reject(new Error(reply.error));
      else resolve(reply.result);
    }
    worker.on('message', onMessage);
    worker.postMessage({ ...message, id });
  });
}

(async () => {
  const thuepp = await initThuePP({ wasmPath });

  const hello = await thuepp.run({
    sourcePath: 'adapter-hello.tpp',
    sourceText: '^hello$ ::> stdout Hello, World!\\n\nhello',
    coverage: true,
    maxEvals: 10,
  });
  assert.strictEqual(hello.exitCode, 0, JSON.stringify(hello));
  assert.strictEqual(hello.stdout, 'Hello, World!\n');
  assert.match(hello.coverageTSV || '', /adapter-hello\.tpp:1\t1/);

  const stdin = await thuepp.run({
    sourceText: '^start$ ::< 1 stdin\n^(?<name>[A-Za-z]+)$ ::> stdout hello {{name|pctdec}}!\\n\nstart',
    resources: { stdin: { readLine: () => 'Ada' } },
  });
  assert.strictEqual(stdin.exitCode, 0, JSON.stringify(stdin));
  assert.strictEqual(stdin.stdout, 'hello Ada!\n');

  const queue = [];
  const roundtrip = await thuepp.run({
    sourceText: '^start$ ::= WRITE\\nread\n^WRITE$ ::> echo ping\\n\n^read$ ::= response:@R@\n@R@ ::< 1 echo\n^response:(?<value>(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*)$ ::> stdout {{value|pctdec}}\n\nstart',
    resources: {
      echo: {
        write: (text) => queue.push(text.trim()),
        readLine: () => queue.shift() || { error: 'timeout' },
      },
    },
  });
  assert.strictEqual(roundtrip.exitCode, 0, JSON.stringify(roundtrip));
  assert.strictEqual(roundtrip.stdout, 'ping');

  const missing = await thuepp.run({ sourceText: '^start$ ::< 5 missing\nstart' });
  assert.strictEqual(missing.exitCode, 1, JSON.stringify(missing));
  assert.match(missing.error || '', /Unknown resource 'missing'/);

  const timeout = await thuepp.run({
    sourceText: '^start$ ::< 1 sleepy\nstart',
    resources: { sleepy: { readLine: () => ({ error: 'timeout' }) } },
  });
  assert.strictEqual(timeout.exitCode, 1, JSON.stringify(timeout));
  assert.match(timeout.error || '', /ERR:resource:sleepy:timeout/);

  const included = await thuepp.run({
    sourcePath: 'main.tpp',
    sourceText: '@include lib.tpp\nhello',
    include: { 'lib.tpp': '^hello$ ::> stdout included\\n' },
  });
  assert.strictEqual(included.exitCode, 0, JSON.stringify(included));
  assert.strictEqual(included.stdout, 'included\n');

  const worker = new Worker(path.join(__dirname, '..', '..', 'js', 'wasm', 'node-worker.cjs'), {
    workerData: { wasmPath },
  });
  try {
    const workerHello = await request(worker, {
      type: 'run',
      options: { sourceText: '^hello$ ::> stdout worker\\n\nhello' },
    });
    assert.strictEqual(workerHello.exitCode, 0, JSON.stringify(workerHello));
    assert.strictEqual(workerHello.stdout, 'worker\n');
  } finally {
    await worker.terminate();
  }

  console.log('wasm adapter tests ok');
})().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
