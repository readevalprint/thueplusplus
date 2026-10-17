SHELL := /bin/sh

.PHONY: test test-static test-core test-guests test-full cpp ruby csharp java js wasm wasm-smoke wasm-adapter-test demo-test demo-build problems langs metrics release-check

RUST_BIN := ./rust/target/release/thue
RUST_IMPL := --impl rust=$(RUST_BIN)
CSHARP_BIN := ./build/csharp/thue
CSHARP_IMPL := --impl csharp=$(CSHARP_BIN)
JAVA_BIN := ./java/build/install/thue/bin/thue
JAVA_IMPL := --impl java=$(JAVA_BIN)

# HOST selects one conformance host: python, go, js, wasm, rust, cpp, ruby, csharp, or java.
# Empty runs every host that is present. Guest programs run on native Go.
ifeq ($(HOST),)
  CORE_ARGS := --tier core $(RUST_IMPL) $(CSHARP_IMPL) $(JAVA_IMPL)
else ifeq ($(HOST),rust)
  CORE_ARGS := --tier core --only rust $(RUST_IMPL)
else ifeq ($(HOST),csharp)
  CORE_ARGS := --tier core --only csharp $(CSHARP_IMPL)
else ifeq ($(HOST),java)
  CORE_ARGS := --tier core --only java $(JAVA_IMPL)
else
  CORE_ARGS := --tier core --only $(HOST)
endif

ifneq ($(wildcard cpp/CMakeLists.txt),)
  FULL_IMPL := $(RUST_IMPL) $(CSHARP_IMPL) $(JAVA_IMPL) --impl cpp=./build/cpp/thue
  ifeq ($(HOST),)
    CORE_ARGS += --impl cpp=./build/cpp/thue
  else ifeq ($(HOST),cpp)
    CORE_ARGS := --tier core --only cpp --impl cpp=./build/cpp/thue
  endif
else
  FULL_IMPL := $(RUST_IMPL) $(CSHARP_IMPL) $(JAVA_IMPL)
endif

ifneq ($(wildcard ruby/thuelang.gemspec),)
  FULL_IMPL += --impl ruby=./ruby/exe/thue
  ifeq ($(HOST),)
    CORE_ARGS += --impl ruby=./ruby/exe/thue
  else ifeq ($(HOST),ruby)
    CORE_ARGS := --tier core --only ruby --impl ruby=./ruby/exe/thue
  endif
endif

# C++17 host. The binary is build/cpp/thue. g++ is required: the default c++
# on some images is clang without libstdc++.
# THUELANG_RE2_STATIC=1 links the static RE2 archive. The release archives use it.
ifeq ($(THUELANG_RE2_STATIC),)
  CPP_RE2_FLAG :=
else
  CPP_RE2_FLAG := -DTHUELANG_RE2_STATIC=ON
endif
csharp:
	@command -v dotnet >/dev/null 2>&1 || { echo "Error: dotnet is required to build the C# host" >&2; exit 127; }
	dotnet publish csharp/src/Thuelang.Cli/Thuelang.Cli.csproj -c Release -o build/csharp --nologo

cpp:
	@command -v cmake >/dev/null 2>&1 || { echo "Error: cmake is required to build the C++ host" >&2; exit 127; }
	@command -v g++ >/dev/null 2>&1 || { echo "Error: g++ is required to build the C++ host" >&2; exit 127; }
	@command -v pkg-config >/dev/null 2>&1 || { echo "Error: pkg-config is required to build the C++ host" >&2; exit 127; }
	cmake -S cpp -B build/cpp -DCMAKE_BUILD_TYPE=Release -DCMAKE_CXX_COMPILER=g++ $(CPP_RE2_FLAG)
	cmake --build build/cpp --parallel

# Ruby host. The executable is ruby/exe/thue. Gems install into ruby/vendor/bundle.
ruby:
	@command -v bundle >/dev/null 2>&1 || { echo "Error: bundle is required to build the Ruby host" >&2; exit 127; }
	cd ruby && bundle config set --local path vendor/bundle && bundle install

# JDK 21 host. The CLI is java/build/install/thue/bin/thue.
java:
	@command -v java >/dev/null 2>&1 || { echo "Error: java is required to build the Java host" >&2; exit 127; }
	./java/gradlew -p java --no-daemon installDist

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
	uv run python tools/test_check_versions.py
	uv run python tools/test_release_workflow.py
	uv run python metrics/test_frontmatter.py
	uv run python metrics/test_accept.py
	uv run python metrics/check_layout.py
	uv run python metrics/test_runs.py
	uv run python metrics/test_publish.py
	uv run python metrics/test_pr_check.py

test-core:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run repository verification" >&2; exit 127; }
	@if [ -z "$(HOST)" ] || [ "$(HOST)" = "rust" ]; then \
	  command -v cargo >/dev/null 2>&1 || { echo "Error: cargo is required to run repository verification" >&2; exit 127; }; \
	  cargo test --manifest-path rust/Cargo.toml; \
	  cargo build --release --manifest-path rust/Cargo.toml; \
	fi
	@if [ -z "$(HOST)" ] || [ "$(HOST)" = "go" ] || [ "$(HOST)" = "wasm" ] || [ "$(HOST)" = "java" ]; then \
	  command -v go >/dev/null 2>&1 || { echo "Error: go is required to run repository verification" >&2; exit 127; }; \
	fi
	@if [ -z "$(HOST)" ] || [ "$(HOST)" = "js" ] || [ "$(HOST)" = "wasm" ]; then \
	  command -v node >/dev/null 2>&1 || { echo "Error: node is required to run repository verification" >&2; exit 127; }; \
	fi
	@if [ -z "$(HOST)" ] || [ "$(HOST)" = "csharp" ]; then \
	  command -v dotnet >/dev/null 2>&1 || { echo "Error: dotnet is required to run repository verification" >&2; exit 127; }; \
	  dotnet test csharp/src/Thuelang.Tests/Thuelang.Tests.csproj -c Release --nologo; \
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
	@command -v dotnet >/dev/null 2>&1 || { echo "Error: dotnet is required to run repository verification" >&2; exit 127; }
	cargo test --manifest-path rust/Cargo.toml
	cargo build --release --manifest-path rust/Cargo.toml
	dotnet test csharp/src/Thuelang.Tests/Thuelang.Tests.csproj -c Release --nologo
	uv run python tools/example_runner.py --tier full $(FULL_IMPL)

# Problems and languages. Both are native Go tests. Hosts are not part of these counters.
problems:
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run the problem suite" >&2; exit 127; }
	cd problems && go test ./... -count=1 -p 2 -timeout 20m -rapid.checks=100

langs:
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run the language cases" >&2; exit 127; }
	@command -v timeout >/dev/null 2>&1 || { echo "Error: timeout(1) is required to run the language cases" >&2; exit 127; }
	go build -C go -o ../build/go-thue ./cmd/thue
	cd langs && go test ./... -count=1 -p 2 -timeout 20m

metrics:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to record metrics" >&2; exit 127; }
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to record metrics" >&2; exit 127; }
	@command -v node >/dev/null 2>&1 || { echo "Error: node is required to record metrics" >&2; exit 127; }
	@command -v timeout >/dev/null 2>&1 || { echo "Error: timeout(1) is required to record metrics" >&2; exit 127; }
	@command -v cargo >/dev/null 2>&1 || { echo "Error: cargo is required to record metrics" >&2; exit 127; }
	@command -v dotnet >/dev/null 2>&1 || { echo "Error: dotnet is required to record metrics" >&2; exit 127; }
	@command -v java >/dev/null 2>&1 || { echo "Error: java is required to record metrics" >&2; exit 127; }
	uv run python metrics/record.py

# Package dry run. Does not publish. RELEASE_TAG=vX.Y.Z also requires every
# manifest version to equal X.Y.Z.
release-check:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required for release-check" >&2; exit 127; }
	@command -v npm >/dev/null 2>&1 || { echo "Error: npm is required for release-check" >&2; exit 127; }
	@command -v cargo >/dev/null 2>&1 || { echo "Error: cargo is required for release-check" >&2; exit 127; }
	@command -v dotnet >/dev/null 2>&1 || { echo "Error: dotnet is required for release-check" >&2; exit 127; }
	uv run python tools/check_versions.py
	rm -rf dist
	uv build
	uvx twine check dist/*
	cd js && npm pack --dry-run
	cd wasm && npm pack --dry-run
	cargo publish --dry-run --manifest-path rust/Cargo.toml
	rm -rf build/csharp-nupkg
	dotnet pack csharp/src/Thuelang/Thuelang.csproj -c Release --nologo -o build/csharp-nupkg
	dotnet pack csharp/src/Thuelang.Cli/Thuelang.Cli.csproj -c Release --nologo -o build/csharp-nupkg

wasm:
	@command -v node >/dev/null 2>&1 || { echo "Error: node is required to build WASM" >&2; exit 127; }
	node demo/scripts/build-wasm.mjs

wasm-smoke: wasm
	@command -v node >/dev/null 2>&1 || { echo "Error: node is required to run WASM smoke tests" >&2; exit 127; }
	GOROOT="$$(go env GOROOT)" THUE_WASM="$$(pwd)/build/thue.wasm" node go/wasm/smoke_test.js

wasm-adapter-test: wasm
	@command -v node >/dev/null 2>&1 || { echo "Error: node is required to run WASM adapter tests" >&2; exit 127; }
	GOROOT="$$(go env GOROOT)" THUE_WASM="$$(pwd)/build/thue.wasm" node go/wasm/adapter_test.js

demo-test:
	@command -v npm >/dev/null 2>&1 || { echo "Error: npm is required to run the browser demo tests" >&2; exit 127; }
	npm --prefix js ci
	npm --prefix demo ci
	npm --prefix demo test
	node js/browser-adapter.test.cjs
	node wasm/browser-adapter.test.cjs

demo-build:
	@command -v npm >/dev/null 2>&1 || { echo "Error: npm is required to build the browser demo" >&2; exit 127; }
	npm --prefix js ci
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

ifneq ($(wildcard ruby/thuelang.gemspec),)
test-full: ruby
ifeq ($(HOST),)
test-core: ruby
else ifeq ($(HOST),ruby)
test-core: ruby
endif
endif

test-full: csharp
ifeq ($(HOST),)
test-core: csharp
else ifeq ($(HOST),csharp)
test-core: csharp
endif

test-full: java
ifeq ($(HOST),)
test-core: java
else ifeq ($(HOST),java)
test-core: java
endif

ifneq ($(wildcard js/package.json),)
FULL_IMPL += --impl js=node\ js/src/cli.js
ifeq ($(HOST),)
CORE_ARGS += --impl js=node\ js/src/cli.js
else ifeq ($(HOST),js)
CORE_ARGS := --tier core --only js --impl js=node\ js/src/cli.js
endif
endif

js:
	npm --prefix js ci

ifneq ($(wildcard js/package.json),)
ifeq ($(HOST),)
test-core: js
else ifeq ($(HOST),js)
test-core: js
endif
test-full: js
endif
