SHELL := /bin/sh

.PHONY: test wasm wasm-smoke wasm-adapter-test demo-test demo-build

# Runtime behavior is specified by executable example manifests, run against
# Python, Go, and the wasm build with integrated rule coverage.
test:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run repository verification" >&2; exit 127; }
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run repository verification" >&2; exit 127; }
	@command -v node >/dev/null 2>&1 || { echo "Error: node is required to run repository verification" >&2; exit 127; }
	uv run python tools/test_runner_limits.py
	uv run python tools/check_contract.py
	uv run python tools/example_runner.py

wasm:
	@command -v node >/dev/null 2>&1 || { echo "Error: node is required to build WASM" >&2; exit 127; }
	node demo/scripts/build-wasm.mjs

wasm-smoke: wasm
	@command -v node >/dev/null 2>&1 || { echo "Error: node is required to run WASM smoke tests" >&2; exit 127; }
	GOROOT="$$(go env GOROOT)" THUEPP_WASM="$$(pwd)/build/thuepp.wasm" node go/wasm/smoke_test.js

wasm-adapter-test: wasm
	@command -v node >/dev/null 2>&1 || { echo "Error: node is required to run WASM adapter tests" >&2; exit 127; }
	GOROOT="$$(go env GOROOT)" THUEPP_WASM="$$(pwd)/build/thuepp.wasm" node go/wasm/adapter_test.js

demo-test:
	@command -v npm >/dev/null 2>&1 || { echo "Error: npm is required to run the browser demo tests" >&2; exit 127; }
	npm --prefix demo ci
	npm --prefix demo test
	node js/browser-adapter.test.cjs

demo-build:
	@command -v npm >/dev/null 2>&1 || { echo "Error: npm is required to build the browser demo" >&2; exit 127; }
	npm --prefix demo ci
	npm --prefix demo run build
