<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Thue++ Go-WASM JavaScript adapters

These files are a thin host-adapter layer around the Go WASM interpreter. They do not implement Thue++ parsing, matching, or evaluation in JavaScript, and they do not use JavaScript `RegExp` for language semantics.

## Files

- `node.cjs` loads `build/thuepp.wasm` in Node and exposes `await initThuePP({ wasmPath }).run(options)`.
- `browser.js` loads the same WASM artifact in a browser after `wasm_exec.js` is available, or from a provided `wasmExecURL`.
- `browser-worker.js` is a browser Worker message wrapper for non-blocking UI use.
- `worker-client.js` is a small browser-side client for `browser-worker.js`.
- `node-worker.cjs` is the Node `worker_threads` smoke-test wrapper used by the adapter tests.

## Run API

```js
const { initThuePP } = require('./demo/wasm/node.cjs');
const thuepp = await initThuePP({ wasmPath: 'build/thuepp.wasm' });
const result = await thuepp.run({
  sourceText: '^hello$ ::> stdout Hello\\n\nhello',
  sourcePath: 'inline.tpp',
  coverage: true,
  resources: {
    stdin: { readLine: () => 'Ada' },
  },
});
```

The result includes `exitCode`, `stdout`, `stderr`, `error` when nonzero, and `coverageTSV` when requested.

Browser resources are callbacks (`readLine`, `write`, optional `close`). OS subprocess resources are intentionally unsupported in `GOOS=js/wasm` and fail loudly. Full language conformance remains the native Python/Go manifest suite (`make test`); adapter tests only prove the JavaScript/WASM host boundary.
