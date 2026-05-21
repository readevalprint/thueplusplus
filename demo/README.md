# thue++ Go-WASM demo

This is a small Vite/Vue browser demo shell for the Go-WASM thue++ adapter.

The demo is intentionally not a JavaScript implementation of thue++. It imports the real browser worker adapter from `../js/wasm/`, which loads the Go WASM module and supplies browser resources through callbacks.

## Commands

From the repository root:

```bash
make demo-build
```

Or from this directory:

```bash
npm install
npm run build
npm run dev
```

Before serving the demo, build the WASM artifact and make `build/thuepp.wasm` plus Go's `wasm_exec.js` available to the Vite dev server/static host paths expected by `src/wasm.ts` (`/thuepp.wasm` and `/wasm_exec.js`). Follow-up demo cards will polish the asset pipeline and UI feature set.

## Boundaries

- Native Python/Go TOML manifests remain the semantic conformance suite (`make test`).
- Browser resources are callbacks, not OS subprocesses.
- Demo tests/builds must not run the full `examples/**/tests/*.toml` manifest universe.
