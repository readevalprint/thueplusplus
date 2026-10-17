# @thuelang/wasm

Thue++ for Node and the browser, backed by the Go build compiled for the browser. The npm package name is `@thuelang/wasm`. The CLI command is `thue`. The native JavaScript interpreter is the separate package `thuelang` in `js/`.

The shared embedder contract is [../docs/host-api.md](../docs/host-api.md). A pushed `vX.Y.Z` tag publishes this package. See [../docs/releasing.md](../docs/releasing.md).

## Install from a checkout

A program can depend on this directory with `"@thuelang/wasm": "file:../wasm"`. `make release-check` runs `npm pack --dry-run`. It does not publish.

Node 22 or newer. Build the module first (`make wasm` from the repository root) or set `THUE_WASM` to a `thue.wasm` built from `go/cmd/thue-wasm`.

## CLI

```bash
node wasm/src/cli.js <program.thue> [--max-steps N] [--max-state-bytes N] [--max-evals N]
```

The flags match the Go and Python CLIs. `unlimited` clears a limit. Omitting a limit uses the interpreter default (1000000 probes, 1000000 applied steps, 8388608 bytes of state).

## Node

```js
import { initThue } from '@thuelang/wasm'

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
import { initThueWasm } from '@thuelang/wasm/browser'
```

`@thuelang/wasm/browser-worker` is a classic script. Load it with a URL (`import workerURL from '@thuelang/wasm/browser-worker?url'`), then:

```js
import { ThueWorker } from '@thuelang/wasm/worker'

const worker = new ThueWorker(workerURL, {
  wasmURL: '/thue.wasm',
  wasmExecURL: '/wasm_exec.js',
})
```

Do not import the worker as an ES module. The Go module support file needs `importScripts`.
