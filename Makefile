SHELL := /bin/sh

.PHONY: test test-static test-core test-guests test-full cpp wasm wasm-smoke wasm-adapter-test demo-test demo-build problems langs metrics

RUST_BIN := ./rust/target/release/thuepp
RUST_IMPL := --impl rust=$(RUST_BIN)

# HOST selects one conformance host: python, go, wasm, rust, or cpp.
# Empty runs every host that is present. Guest programs run on native Go.
ifeq ($(HOST),)
  CORE_ARGS := --tier core $(RUST_IMPL)
else ifeq ($(HOST),rust)
  CORE_ARGS := --tier core --only rust $(RUST_IMPL)
else
  CORE_ARGS := --tier core --only $(HOST)
endif

ifneq ($(wildcard cpp/CMakeLists.txt),)
  FULL_IMPL := $(RUST_IMPL) --impl cpp=./build/cpp/thuepp
  ifeq ($(HOST),)
    CORE_ARGS += --impl cpp=./build/cpp/thuepp
  else ifeq ($(HOST),cpp)
    CORE_ARGS := --tier core --only cpp --impl cpp=./build/cpp/thuepp
  endif
else
  FULL_IMPL := $(RUST_IMPL)
endif

# C++17 host. The binary is build/cpp/thuepp. g++ is required: the default c++
# on some images is clang without libstdc++.
cpp:
	@command -v cmake >/dev/null 2>&1 || { echo "Error: cmake is required to build the C++ host" >&2; exit 127; }
	@command -v g++ >/dev/null 2>&1 || { echo "Error: g++ is required to build the C++ host" >&2; exit 127; }
	@command -v pkg-config >/dev/null 2>&1 || { echo "Error: pkg-config is required to build the C++ host" >&2; exit 127; }
	cmake -S cpp -B build/cpp -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER=g++
	cmake --build build/cpp --parallel

# Per-PR check. Core features on every host, guest programs on native Go.
test: test-static test-core test-guests

test-static:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run repository verification" >&2; exit 127; }
	uv run python metrics/test_history.py
	uv run python metrics/check_history.py
	uv run python tools/test_runner_limits.py
	uv run python tools/check_contract.py
	uv run python tools/test_environments.py
	uv run python tools/test_ci_paths.py
	uv run python tools/test_tiers.py
	uv run python metrics/test_frontmatter.py
	uv run python metrics/test_accept.py
	uv run python metrics/check_layout.py
	uv run python metrics/test_runs.py

test-core:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run repository verification" >&2; exit 127; }
	@if [ -z "$(HOST)" ] || [ "$(HOST)" = "rust" ]; then \
	  command -v cargo >/dev/null 2>&1 || { echo "Error: cargo is required to run repository verification" >&2; exit 127; }; \
	  cargo test --manifest-path rust/Cargo.toml; \
	  cargo build --release --manifest-path rust/Cargo.toml; \
	fi
	@if [ -z "$(HOST)" ] || [ "$(HOST)" = "go" ] || [ "$(HOST)" = "wasm" ]; then \
	  command -v go >/dev/null 2>&1 || { echo "Error: go is required to run repository verification" >&2; exit 127; }; \
	fi
	@if [ -z "$(HOST)" ] || [ "$(HOST)" = "wasm" ]; then \
	  command -v node >/dev/null 2>&1 || { echo "Error: node is required to run repository verification" >&2; exit 127; }; \
	fi
	uv run python tools/example_runner.py $(CORE_ARGS)
	uv run python tools/test_metrics_cli.py
	uv run python metrics/check_solutions.py

test-guests:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run repository verification" >&2; exit 127; }
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run repository verification" >&2; exit 127; }
	uv run python tools/example_runner.py --tier guests

# Every manifest on every host, with parity and rule coverage.
test-full: test-static
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run repository verification" >&2; exit 127; }
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run repository verification" >&2; exit 127; }
	@command -v node >/dev/null 2>&1 || { echo "Error: node is required to run repository verification" >&2; exit 127; }
	@command -v cargo >/dev/null 2>&1 || { echo "Error: cargo is required to run repository verification" >&2; exit 127; }
	cargo test --manifest-path rust/Cargo.toml
	cargo build --release --manifest-path rust/Cargo.toml
	uv run python tools/example_runner.py --tier full $(FULL_IMPL)

# Problems and languages. Both are native Go tests. Hosts are not part of these counters.
problems:
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run the problem suite" >&2; exit 127; }
	@command -v timeout >/dev/null 2>&1 || { echo "Error: timeout(1) is required to run the problem suite" >&2; exit 127; }
	go build -C go -o ../build/go-thuepp ./cmd/thuepp
	cd problems && go test ./... -count=1 -p 2 -timeout 20m

langs:
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run the language cases" >&2; exit 127; }
	@command -v timeout >/dev/null 2>&1 || { echo "Error: timeout(1) is required to run the language cases" >&2; exit 127; }
	go build -C go -o ../build/go-thuepp ./cmd/thuepp
	cd langs && go test ./... -count=1 -p 2 -timeout 20m

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
	npm --prefix demo ci
	npm --prefix demo test
	node js/browser-adapter.test.cjs

demo-build:
	@command -v npm >/dev/null 2>&1 || { echo "Error: npm is required to build the browser demo" >&2; exit 127; }
	npm --prefix demo ci
	npm --prefix demo run build

ifneq ($(wildcard cpp/CMakeLists.txt),)
test-full: cpp
ifeq ($(HOST),)
test-core: cpp
else ifeq ($(HOST),cpp)
test-core: cpp
endif
endif
