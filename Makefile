SHELL := /bin/sh

.PHONY: test wasm wasm-smoke wasm-adapter-test

# Runtime behavior is specified by executable example manifests, run against
# both mandatory implementations with integrated rule coverage.
test:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run repository verification" >&2; exit 127; }
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run repository verification" >&2; exit 127; }
	uv run python tools/check_contract.py
	uv run python tools/example_runner.py

wasm:
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to build WASM" >&2; exit 127; }
	mkdir -p build
	cd go && GOOS=js GOARCH=wasm go build -o ../build/thuepp.wasm ./cmd/thuepp-wasm

wasm-smoke: wasm
	@command -v node >/dev/null 2>&1 || { echo "Error: node is required to run WASM smoke tests" >&2; exit 127; }
	GOROOT="$$(go env GOROOT)" THUEPP_WASM="$$(pwd)/build/thuepp.wasm" node go/wasm/smoke_test.js

wasm-adapter-test: wasm
	@command -v node >/dev/null 2>&1 || { echo "Error: node is required to run WASM adapter tests" >&2; exit 127; }
	GOROOT="$$(go env GOROOT)" THUEPP_WASM="$$(pwd)/build/thuepp.wasm" node go/wasm/adapter_test.js
