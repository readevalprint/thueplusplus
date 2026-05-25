const assert = require('assert');
const fs = require('fs');
const path = require('path');

require(process.env.WASM_EXEC_JS || path.join(process.env.GOROOT || '/usr/local/go', 'lib/wasm/wasm_exec.js'));

const wasmPath = process.env.THUEPP_WASM || path.join(__dirname, '..', '..', 'build', 'thuepp.wasm');
const bytes = fs.readFileSync(wasmPath);

async function runSmoke(cases) {
  globalThis.ThuePPSmoke = cases;
  delete globalThis.ThuePPSmokeResult;
  const go = new Go();
  const result = await WebAssembly.instantiate(bytes, go.importObject);
  await go.run(result.instance);
  const runResult = globalThis.ThuePPSmokeResult;
  delete globalThis.ThuePPSmoke;
  delete globalThis.ThuePPSmokeResult;
  return Array.from(runResult);
}

(async () => {
  const [hello, emptyOverride, resource, missing, proc, callbackError] = await runSmoke([
    {
      sourcePath: 'hello.tpp',
      sourceText: '^hello$ ::> stdout hello\\n\n::=\nhello',
      coverage: true,
      maxEvals: 10,
    },
    {
      sourcePath: 'empty-override.tpp',
      sourceText: '^hello$ ::> stdout hello\\n\n::=\nhello',
      input: '',
      coverage: true,
      maxEvals: 10,
    },
    {
      sourceText: '^start$ ::< 1 input\n^(?<x>[A-Za-z0-9_.-]+)$ ::> stdout {{x|pctdec}}\\n\n::=\nstart',
      resources: {
        input: { readLine: () => 'from-callback' },
      },
    },
    {
      sourceText: '^start$ ::< 5 missing\n::=\nstart',
    },
    {
      sourceText: '^start$ ::< 5 sh\n::=\nstart',
      procs: { sh: 'printf nope' },
    },
    {
      sourceText: '^start$ ::< 1 input\n::=\nstart',
      resources: {
        input: { readLine: () => ({ error: 'callback boom' }) },
      },
    },
  ]);

  assert.strictEqual(hello.exitCode, 0, JSON.stringify(hello));
  assert.strictEqual(hello.stdout, 'hello\n');
  assert.match(hello.coverageTSV || '', /hello\.tpp:1\t1/);

  assert.strictEqual(emptyOverride.exitCode, 0, JSON.stringify(emptyOverride));
  assert.strictEqual(emptyOverride.stdout, '');

  assert.strictEqual(resource.exitCode, 0, JSON.stringify(resource));
  assert.strictEqual(resource.stdout, 'from-callback\n');

  assert.strictEqual(missing.exitCode, 1, JSON.stringify(missing));
  assert.match(missing.error || '', /Unknown resource 'missing'/);

  assert.strictEqual(proc.exitCode, 1, JSON.stringify(proc));
  assert.match(proc.error || '', /subprocess resources are not supported/);

  assert.strictEqual(callbackError.exitCode, 1, JSON.stringify(callbackError));
  assert.match(callbackError.error || '', /ERR:resource:input:callback boom/);

  console.log('wasm smoke ok');
})().catch((err) => {
  console.error(err && err.stack || err);
  process.exit(1);
});
