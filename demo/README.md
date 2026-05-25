# thue++ Go-WASM demo

This is a small Vite/Vue browser demo shell for the Go-WASM thue++ adapter.

The demo is intentionally not a JavaScript implementation of thue++. It imports the real browser worker adapter from `../js/wasm/`, which loads the Go WASM module and supplies browser resources through callbacks.

## Commands

From the repository root:

```bash
make wasm            # build build/thuepp.wasm and build/wasm_exec.js
make demo-test       # run focused Vitest/Vue plus browser adapter unit tests
make demo-build      # build WASM, type-check, build, and smoke-check production dist
```

Or from this directory:

```bash
npm install
npm run dev          # start the Vite dev server
npm test             # vue-tsc plus focused demo UI tests
npm run test:ui      # focused Vitest UI tests only
npm run build        # production build
```

Before serving the demo, run `make demo-build` from the repository root. That target builds both browser-served runtime assets into the ignored `build/` directory (`build/thuepp.wasm` and `build/wasm_exec.js`), runs the Vite production build, and verifies that `demo/dist/` contains non-empty runtime assets with base-relative URLs. Vite serves the generated runtime assets as the demo public asset root, so the worker loads `thuepp.wasm` and `wasm_exec.js` relative to the deployed demo page instead of assuming origin-root hosting. `make demo-build` is still an additive browser integration check; it does not execute the full examples manifest suite.

## What the demo tests cover

The focused Vitest tests mount the Vue app and exercise the browser-facing contract: hello/stdout, buffered stdin, custom callback resource write/readLine logging, resource timeout/error display, include-map resolution, coverage TSV/table rendering, educational example navigation, runtime status surfaces, output tabs, clipboard-copy affordances, and production-build compatibility through `npm run build`/`make demo-build` validation. The additional Node unit smoke in `js/wasm/browser_adapter_unit_test.cjs` covers worker-client rejection paths plus callback-resource edge cases that jsdom cannot exercise as a real Worker.

`DESIGN.md` records the demo's project-owned visual direction: a dark formal interpreter workbench with tokenized colors, code-first panels, visible Go-WASM/Worker status, and explicit guardrails against implying a JavaScript rule evaluator or subprocess emulation.

These tests intentionally do not run `examples/**/tests/*.toml`. The semantic conformance suite remains `make test` at the repository root.

## Playground source and state

The playground treats the program editor as an exact source view. Loading a bundled `.tpp` file must preserve blank lines, hash-prefixed rows, aliases, and the final bare `::=` state block in the Program rules panel. `#` is ordinary Thue++ source text, not a browser-demo comment marker.

The state textarea is derived only from an explicit first bare `::=` separator followed by at most one state row, or from a selected manifest case input. Files without a separator start with an empty state. Clearing the state textarea sends an explicit empty input override to the Go-WASM runner; it must not fall back to hidden state embedded in the source text.

The state history below the State editor is a raw chronological shadcn-vue/TanStack table. It has no filtering, sorting, pagination, selection checkboxes, column toggles, or toolbar. Collapsed rows show the compact diff for each step, while expanded rows show the full `stateAfter` checkpoint. Clicking a row still restores that checkpoint, and rows after the selected checkpoint remain marked as future/stale until the next step prunes them.

## Boundaries

- Native Python/Go TOML manifests remain the semantic conformance suite (`make test`).
- This demo is not semantic conformance for thue++; it is a browser adapter/UI smoke suite.
- Browser resources are callbacks supplied to the Go-WASM adapter, not OS subprocesses. In-browser runs cannot spawn the process fixtures used by native examples.
- Include files are resolved from the adapter include map passed by the UI, not from the browser filesystem.
- The adapter behavior follows the Go-WASM browser callback resource work from GLKB #192 and is documented in [`../js/wasm/README.md`](../js/wasm/README.md).
