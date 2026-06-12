# SPDX-License-Identifier: AGPL-3.0-or-later
SHELL := /bin/sh

.PHONY: test wasm wasm-smoke wasm-adapter-test demo-test demo-build challenge-check challenge-test

build/thuepp:
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to build thuepp" >&2; exit 127; }
	mkdir -p build
	cd go && go build -o ../build/thuepp ./cmd/thuepp

# Runtime behavior is specified by executable example manifests, run against
# both mandatory implementations with integrated rule coverage.
test: build/thuepp
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run repository verification" >&2; exit 127; }
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run repository verification" >&2; exit 127; }
	uv run python tools/check_contract.py
	uv run python tools/check_read_timeouts.py
	uv run --with pytest pytest tools/test_cli_input_file.py tools/test_cli_export_state.py tools/test_lisp_cgi_script.py tools/test_example_runner.py tools/test_submission_automerge.py -q --tb=short
	uv run python tools/example_runner.py
	uv run python tools/challenge_generator.py --check

wasm:
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to build WASM" >&2; exit 127; }
	mkdir -p build
	cd go && GOOS=js GOARCH=wasm go build -o ../build/thuepp.wasm ./cmd/thuepp-wasm
	cp "$$(go env GOROOT)/lib/wasm/wasm_exec.js" build/wasm_exec.js

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
	node demo/wasm/browser_adapter_unit_test.cjs

demo-build: wasm
	@command -v npm >/dev/null 2>&1 || { echo "Error: npm is required to build the browser demo" >&2; exit 127; }
	npm --prefix demo ci
	npm --prefix demo run build

# Challenge system (isolated; does not touch example_runner or examples/)
challenge-check:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required" >&2; exit 127; }
	uv run python tools/challenge_generator.py --check

challenge-test: challenge-check
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required" >&2; exit 127; }
	uv run --with pytest pytest tools/test_challenge_generator.py tools/test_submission_automerge.py -q --tb=short
