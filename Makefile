SHELL := /bin/sh

.PHONY: test wasm wasm-smoke wasm-adapter-test demo-test demo-build tasks metrics

# Runtime behavior is specified by executable example manifests, run against
# Python, Go, and the wasm build with integrated rule coverage.
test:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run repository verification" >&2; exit 127; }
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run repository verification" >&2; exit 127; }
	@command -v node >/dev/null 2>&1 || { echo "Error: node is required to run repository verification" >&2; exit 127; }
	@command -v cargo >/dev/null 2>&1 || { echo "Error: cargo is required to run repository verification" >&2; exit 127; }
	uv run python metrics/test_history.py
	uv run python metrics/check_history.py
	uv run python tools/test_runner_limits.py
	uv run python tools/check_contract.py
	cargo test --manifest-path rust/Cargo.toml
	cargo build --release --manifest-path rust/Cargo.toml
	uv run python tools/example_runner.py --impl 'rust=./rust/target/release/thuepp'

# Golden-program transcripts under tasks/. One JSON row per task, guest, and host.
tasks:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run the task suite" >&2; exit 127; }
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run the task suite" >&2; exit 127; }
	@command -v node >/dev/null 2>&1 || { echo "Error: node is required to run the task suite" >&2; exit 127; }
	@command -v timeout >/dev/null 2>&1 || { echo "Error: timeout(1) is required to run the task suite" >&2; exit 127; }
	@command -v cargo >/dev/null 2>&1 || { echo "Error: cargo is required to run the task suite" >&2; exit 127; }
	uv run python tasks/runner.py --output build/tasks/results.json

# Append HEAD to metrics/history.json. Runs the task suite, then the host benchmark.
metrics:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to record metrics" >&2; exit 127; }
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to record metrics" >&2; exit 127; }
	@command -v node >/dev/null 2>&1 || { echo "Error: node is required to record metrics" >&2; exit 127; }
	@command -v timeout >/dev/null 2>&1 || { echo "Error: timeout(1) is required to record metrics" >&2; exit 127; }
	@command -v cargo >/dev/null 2>&1 || { echo "Error: cargo is required to record metrics" >&2; exit 127; }
	uv run python metrics/record.py

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
	@test -s build/tasks/results.json || { echo "Error: build/tasks/results.json is missing. Run make tasks." >&2; exit 1; }
	npm --prefix demo ci
	npm --prefix demo test
	node js/browser-adapter.test.cjs

demo-build:
	@command -v npm >/dev/null 2>&1 || { echo "Error: npm is required to build the browser demo" >&2; exit 127; }
	@test -s build/tasks/results.json || { echo "Error: build/tasks/results.json is missing. Run make tasks." >&2; exit 1; }
	npm --prefix demo ci
	npm --prefix demo run build
