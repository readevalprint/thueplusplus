const assert = require('assert');
const path = require('path');
const { Worker } = require('worker_threads');
const wasmPath = process.env.THUE_WASM || path.join(__dirname, '..', '..', 'build', 'thue.wasm');

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
  const { initThue } = await import('../../js/src/node.js');
  const thue = await initThue({ wasmPath });

  const limits = { maxSteps: 1000, maxStateBytes: 1000000, maxEvals: 1000 };
  const hello = await thue.run({
    sourcePath: 'adapter-hello.thue',
    sourceText: '^hello$ ::> stdout Hello, World!\\n\n::=\nhello',
    coverage: true,
    ...limits,
    maxEvals: 10,
  });
  assert.strictEqual(hello.exitCode, 0, JSON.stringify(hello));
  assert.strictEqual(hello.stdout, 'Hello, World!\n');
  assert.match(hello.coverageTSV || '', /adapter-hello\.thue:1\t1/);

  const stdin = await thue.run({
    ...limits,
    sourceText: '^start$ ::< 1 stdin\n^(?<name>[A-Za-z]+)$ ::> stdout hello {{name|pctdec}}!\\n\n::=\nstart',
    resources: { stdin: { readLine: () => 'Ada' } },
  });
  assert.strictEqual(stdin.exitCode, 0, JSON.stringify(stdin));
  assert.strictEqual(stdin.stdout, 'hello Ada!\n');

  const queue = [];
  const roundtrip = await thue.run({
    ...limits,
    sourceText: '^start$ ::= WRITE\\nread\n^WRITE$ ::> echo ping\\n\n^read$ ::= response:@R@\n@R@ ::< 1 echo\n^response:(?<value>(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*)$ ::> stdout {{value|pctdec}}\n\n::=\nstart',
    resources: {
      echo: {
        write: (text) => queue.push(text.trim()),
        readLine: () => queue.shift() || { error: 'timeout' },
      },
    },
  });
  assert.strictEqual(roundtrip.exitCode, 0, JSON.stringify(roundtrip));
  assert.strictEqual(roundtrip.stdout, 'ping');

  const missing = await thue.run({ ...limits, sourceText: '^start$ ::< 5 missing\n::=\nstart' });
  assert.strictEqual(missing.exitCode, 1, JSON.stringify(missing));
  assert.match(missing.error || '', /Unknown resource 'missing'/);

  const timeout = await thue.run({
    ...limits,
    sourceText: '^start$ ::< 1 sleepy\n::=\nstart',
    resources: { sleepy: { readLine: () => ({ error: 'timeout' }) } },
  });
  assert.strictEqual(timeout.exitCode, 13, JSON.stringify(timeout));
  assert.strictEqual(timeout.limit, 'timeout');
  assert.match(timeout.error || '', /ERR:resource:sleepy:timeout/);

  const inertInclude = await thue.run({
    ...limits,
    sourcePath: 'main.thue',
    sourceText: '::=\n@include lib.thue',
  });
  assert.strictEqual(inertInclude.exitCode, 0, JSON.stringify(inertInclude));
  assert.strictEqual(inertInclude.stdout, '');
  assert.strictEqual(inertInclude.state, '@include lib.thue');

  const invalidData = await thue.run({
    ...limits,
    sourcePath: 'bad.thue',
    sourceText: '^x$ ::% data\n::=\nx',
  });
  assert.strictEqual(invalidData.exitCode, 1, JSON.stringify(invalidData));
  assert.match(invalidData.error || '', /Invalid rule syntax: \^x\$ ::% data/);

  const worker = new Worker(path.join(__dirname, '..', '..', 'js', 'src', 'node-worker.js'), {
    workerData: { wasmPath },
  });
  try {
    const workerHello = await request(worker, {
      type: 'run',
      options: { ...limits, sourceText: '^hello$ ::> stdout worker\\n\n::=\nhello' },
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
