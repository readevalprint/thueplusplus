# Thue++ Go-WASM demo

This is a small Vite/Vue browser demo shell for the Go-WASM Thue++ adapter.

The demo is intentionally not a JavaScript implementation of Thue++. It imports the real browser worker adapter from `wasm/`, which loads the Go WASM module and supplies browser resources through callbacks.

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

The focused Vitest tests mount the Vue app and exercise the browser-facing contract: hello/stdout, buffered stdin, custom callback resource write/readLine logging, resource timeout/error display, include-map resolution, coverage TSV/table rendering, educational example navigation, runtime status surfaces, output tabs, clipboard-copy affordances, and production-build compatibility through `npm run build`/`make demo-build` validation. The additional Node unit smoke in `demo/wasm/browser_adapter_unit_test.cjs` covers worker-client rejection paths plus callback-resource edge cases that jsdom cannot exercise as a real Worker.

`DESIGN.md` records the demo's project-owned visual direction: a dark formal interpreter workbench with tokenized colors, code-first panels, visible Go-WASM/Worker status, and explicit guardrails against implying a JavaScript rule evaluator or subprocess emulation.

These tests intentionally do not run `examples/**/tests/*.toml`. The semantic conformance suite remains `make test` at the repository root.

## Playground source and state

The playground treats the program editor as an exact source view. Loading a bundled `.tpp` file must preserve blank lines, hash-prefixed rows, aliases, and the final bare `::=` state block in the Program rules panel. `#` is ordinary Thue++ source text, not a browser-demo comment marker.

The state textarea is derived from an explicit first bare `::=` separator and preserves all following text as the initial state, including embedded newlines, or from a selected manifest case input. Files without a separator start with an empty state. Clearing the state textarea sends an explicit empty input override to the Go-WASM runner; it must not fall back to hidden state embedded in the source text.

The state history below the State editor is a raw chronological shadcn-vue/TanStack table. It has no filtering, sorting, pagination, selection checkboxes, column toggles, or toolbar. Collapsed rows show the compact diff for each step, while expanded rows show the full `stateAfter` checkpoint. Clicking a row restores that immutable checkpoint, including resource input/output buffers. Rows after the selected checkpoint remain marked as future/stale until execution or resource-buffer edits branch from the selected checkpoint and prune them.

Resource textareas are working inputs for the next execution, not edits to historical rows. If a resource buffer is changed while an older checkpoint is selected, future rows are pruned immediately and the next Step/Play/End uses the edited buffer. Selecting another history row restores that row's saved resource snapshot and discards uncommitted resource edits. Waiting-for-input rows are passive checkpoints when reselected: they restore resource data, but do not restart submit buttons or countdown timers until execution reaches the read again. Output attention is reserved for output produced by execution, not passive history restoration.

## Embeddable playground routes

The same shared playground surface powers the full workbench and the embeddable route:

- `/playground` keeps the full page shell, test selector, and debugger controls. On narrow containers or `mode=compact`, it switches to the compact tabbed layout.
- `/embed` renders the compact/mobile-style surface without the page header by default. It is intended for iframe embeds and docs slots.
- `/embed/demo` shows several embed presets with short explanations so the section/tab behavior can be reviewed visually.

Supported embed query parameters:

```text
file=./examples/hello/hello.tpp
test=./examples/.../tests/foo.toml
case=<case name>
section=output|state|input|trace|resources|source
tab=stdout|stderr
mode=mini|compact|debug|full|auto
controls=run|step|debug|none
editable=0|1
header=0|1
picker=0|1
openFull=0|1
syncUrl=0|1
```

Useful examples:

```text
/embed?file=./examples/hello/hello.tpp&section=output&tab=stdout
/embed?file=./examples/hello/hello.tpp&section=state
/embed?file=./examples/guess-number/guess-number.tpp&section=input&controls=debug
```

For native Vue embedding, use `PlaygroundSurface.vue` with the same concepts as props (`file`, `test`, `caseName`, `section`, `tab`, `mode`, `chrome`, `controls`, `editable`, `showOpenFull`). Large arbitrary source/state payloads are intentionally not encoded in the URL in this first version; pass them through component props or add a deliberate `postMessage`/share-link API later.

## Boundaries

- Native Python/Go TOML manifests remain the semantic conformance suite (`make test`).
- This demo is not semantic conformance for Thue++; it is a browser adapter/UI smoke suite.
- Browser resources are callbacks supplied to the Go-WASM adapter, not OS subprocesses. In-browser runs cannot spawn the process fixtures used by native examples.
- Include files are resolved from the adapter include map passed by the UI, not from the browser filesystem.
- The adapter behavior follows the Go-WASM browser callback resource work from GLKB #192 and is documented in [`wasm/README.md`](wasm/README.md).
