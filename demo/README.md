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
npm run dev          # compile WASM, then start the Vite dev server
npm test             # vue-tsc plus focused demo UI tests
npm run test:ui      # focused Vitest UI tests only
npm run build        # compile WASM, type-check, build, and smoke-check dist
```

`npm run build` and `npm run dev` compile the Go interpreter with `scripts/build-wasm.mjs`. That script requires Go 1.24 or newer. When the `go` on `PATH` is older, and the host is linux, it downloads Go 1.24.6 into the ignored `demo/.cache/` directory. It writes `build/thuepp.wasm` and `build/wasm_exec.js` for the repo WASM checks, then copies only those two files to `demo/.wasm-public/`, which is Vite's `publicDir`. The repo `build/` directory is not the public directory: other build outputs must not be published.

The production page uses origin-root asset URLs (`/assets/...`, `/thuepp.wasm`). Nested routes such as `/playground` load those files from the site root. Host the demo at the domain root.

`make demo-build` from the repository root installs dependencies and runs that same production build. It does not execute the full examples manifest suite. It reads the committed `build/tasks/results.json`. Run `make tasks` and commit that file when the suite changes. The Guests and Tasks pages are generated from it.

## Vercel

Import this repository. The root `vercel.json` is the project to use:

| Setting | Value |
| --- | --- |
| Root Directory | `.` (repository root) |
| Framework Preset | Other |
| Install Command | `npm ci --prefix demo` |
| Build Command | `npm --prefix demo run build` |
| Output Directory | `demo/dist` |

`demo/vercel.json` is the matching config when the Vercel root directory is `demo`. That only works when the build step can still read `go/`, `examples/`, and `README.md` outside `demo/` (Vercel's "Include source files outside of the Root Directory in the Build Step" option). The build fails if those files are missing. Vercel does not serve files outside the project root; the published site is `dist/` only.

## What the demo tests cover

The focused Vitest tests mount the Vue app and exercise the browser-facing contract: hello/stdout, buffered stdin, custom callback resource write/readLine logging, resource timeout/error display, include-map resolution, coverage TSV/table rendering, educational example navigation, runtime status surfaces, output tabs, clipboard-copy affordances, and production-build compatibility through `npm run build`/`make demo-build` validation. The additional Node unit smoke in `js/browser-adapter.test.cjs` covers worker-client rejection paths plus callback-resource edge cases that jsdom cannot exercise as a real Worker. The playground imports that client from the `thuepp` package.

The site is a Vue 3, Vite, Tailwind 4, and shadcn-vue shell styled on a 1px-line, 2px-radius dark theme (light mode included). `/playground` is a full-screen route outside the docs layout. These tests intentionally do not run `examples/**/tests/*.toml`. The semantic conformance suite remains `make test` at the repository root.

## Playground source and state

The playground treats the program editor as an exact source view. Loading a bundled `.tpp` file must preserve blank lines, hash-prefixed rows, aliases, and the final bare `::=` state block in the Program rules panel. `#` is ordinary Thue++ source text, not a browser-demo comment marker.

The state textarea is derived from an explicit first bare `::=` separator and preserves all following text as the initial state, including embedded newlines, or from a selected manifest case input. Files without a separator start with an empty state. Clearing the state textarea sends an explicit empty input override to the Go-WASM runner; it must not fall back to hidden state embedded in the source text.

The state history below the State editor is a raw chronological shadcn-vue/TanStack table. It has no filtering, sorting, pagination, selection checkboxes, column toggles, or toolbar. Collapsed rows show the compact diff for each step, while expanded rows show the full `stateAfter` checkpoint. Clicking a row still restores that checkpoint, and rows after the selected checkpoint remain marked as future/stale until the next step prunes them.

## Page layout

The docs shell is a 52px sticky header. Learn, Reference, Playground, Hosts, Guests, and Tasks sit in that header, with the theme toggle and a GitHub link. Below 1024px those links move into a menu button. The left column is the sticky On this page list: the page's h2 and h3 headings, a vertical rail, and a brighter segment on the section in view. Below 1024px that list collapses behind a Contents toggle at the top of the article. The article is one centered column at about 65ch. There is no right column. `/playground` is outside that shell.

## Embeddable playground routes

The same shared playground surface powers the playground page and the embeddable route:

- `/playground` is its own full-screen route: header, resizable editor and output, and a status bar. It does not use the docs shell.
- `/embed` renders that same surface with no docs chrome. It is for iframe embeds.
- `/`, `/learn`, `/reference`, `/hosts`, `/guests`, and `/tasks` are the other prerendered pages. `/` is the landing page. `/guests` is the guest leaderboard. `/tasks` is the task index, and each task is also prerendered at `/tasks/<id>`. Run `make tasks` before `npm test`, `npm run dev`, or `npm run build`.

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
