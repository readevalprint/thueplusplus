# thue-lang

Thue++ for Node and the browser. The npm package name is `thue-lang` because `thue` is already on npm. The CLI command is `thue`. The engine is the Go WebAssembly build. The CLI is a thin wrapper over `initThue`.

The shared embedder contract is [../docs/host-api.md](../docs/host-api.md). Release steps are [../docs/releasing.md](../docs/releasing.md). This package is not published yet.

## Install from a checkout

The playground depends on this directory with `"thue-lang": "file:../js"`. A program that vendors the same tree can do the same. `npm publish` is described in the release doc and is not part of `make test`.

Node 22 or newer. Build the wasm module first (`make wasm` from the repository root) or set `THUE_WASM` to a `thue.wasm` built from `go/cmd/thue-wasm`.

## CLI

```bash
node js/src/cli.js <program.thue> [--max-steps N] [--max-state-bytes N] [--max-evals N]
```

The flags match the Go and Python CLIs. `unlimited` clears a limit. Omitting a limit uses the interpreter default (1000000 probes, 1000000 applied steps, 8388608 bytes of state). Conformance does not omit them; see [../docs/conformance.md](../docs/conformance.md).

## Node

```js
import { initThue } from 'thue-lang'

const engine = await initThue({ wasmPath: process.env.THUE_WASM })
const result = await engine.run({
  sourcePath: 'hello.thue',
  sourceText,
  maxSteps: 1000000,
  maxStateBytes: 8388608,
  maxEvals: 10000,
})
```

`result.limit` is `steps`, `evals`, `state`, or `timeout` when a limit stops the run. `result.exitCode` is the code in the host API. JSON `null` clears a limit.

## Browser

```js
import { initThueWasm } from 'thue-lang/browser'
```

`thue-lang/browser-worker` is a classic script. Load it with a URL (`import workerURL from 'thue-lang/browser-worker?url'`), then:

```js
import { ThueWorker } from 'thue-lang/worker'

const worker = new ThueWorker(workerURL, {
  wasmURL: '/thue.wasm',
  wasmExecURL: '/wasm_exec.js',
})
```

Do not import the worker as an ES module. Go's `wasm_exec.js` needs `importScripts`.
