# thuelang

Native JavaScript interpreter for Thue++. It runs on Node.js 22+ and in the browser. The package name is `thuelang`. The command is `thue`.

The Go build packaged for the browser is `@thuelang/wasm`, in `wasm/`.

```bash
node js/src/cli.js <program.thue> [--max-steps N] [--max-evals N] [--max-state-bytes N]
```

Omitted limits use the defaults: 1000000 steps, 1000000 evaluations, and 8388608 bytes of state. `unlimited` clears a limit. `0` is a real limit.

```js
import { initThue } from 'thuelang'

const engine = await initThue()
const result = await engine.run({
  sourcePath: 'hello.thue',
  sourceText,
})
```

Browser code imports `initThue` from `thuelang/browser`. A page that wants a worker imports `ThueWorker` from `thuelang/worker` and bundles `thuelang/browser-worker` (`import workerURL from 'thuelang/browser-worker?worker&url'`). The worker rejects process bindings. Runs from a page pass a step limit.

The regex engine is linear-time. Lookbehinds are off.
