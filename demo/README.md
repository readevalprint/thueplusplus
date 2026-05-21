# thue++ Go-WASM demo

This is a small Vite/Vue browser demo shell for the Go-WASM thue++ adapter.

The demo is intentionally not a JavaScript implementation of thue++. It imports the real browser worker adapter from `../js/wasm/`, which loads the Go WASM module and supplies browser resources through callbacks.

## Commands

From the repository root:

```bash
make wasm            # build build/thuepp.wasm
make demo-test       # run focused Vitest/Vue demo tests only
make demo-build      # type-check and build the production demo bundle
```

Or from this directory:

```bash
npm install
npm run dev          # start the Vite dev server
npm test             # vue-tsc plus focused demo UI tests
npm run test:ui      # focused Vitest UI tests only
npm run build        # production build
```

Before serving the demo, run `make wasm` once from the repository root. That target writes both browser-served runtime assets into the ignored `build/` directory: `build/thuepp.wasm` and `build/wasm_exec.js`. Vite serves that directory as the demo public asset root, so the worker can load `/thuepp.wasm` and `/wasm_exec.js`. `make demo-build` validates the production TypeScript/Vite bundle; it does not execute the full examples manifest suite.

## What the demo tests cover

The focused Vitest tests mount the Vue app and exercise the browser-facing contract: hello/stdout, buffered stdin, custom callback resource write/readLine logging, resource timeout/error display, include-map resolution, coverage TSV/table rendering, and production-build compatibility through `npm run build`/`make demo-build` validation.

These tests intentionally do not run `examples/**/tests/*.toml`. The semantic conformance suite remains `make test` at the repository root.

## Boundaries

- Native Python/Go TOML manifests remain the semantic conformance suite (`make test`).
- This demo is not semantic conformance for thue++; it is a browser adapter/UI smoke suite.
- Browser resources are callbacks supplied to the Go-WASM adapter, not OS subprocesses. In-browser runs cannot spawn the process fixtures used by native examples.
- Include files are resolved from the adapter include map passed by the UI, not from the browser filesystem.
- The adapter behavior follows the Go-WASM browser callback resource work from GLKB #192 and is documented in [`../js/wasm/README.md`](../js/wasm/README.md).
