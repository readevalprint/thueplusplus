SHELL := /bin/sh

.PHONY: test test-python test-go test-shared test-coverage

# Add a JavaScript target to `test` only after a JavaScript implementation exists
# and is wired through tools/run-example-manifests.
test: test-python test-go test-shared test-coverage

test-python:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run Python tests" >&2; exit 127; }
	uv run python -m unittest discover -s python/tests -v

test-go:
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run Go tests" >&2; exit 127; }
	cd go && go test -count=1 ./...

test-shared:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run shared manifest tests" >&2; exit 127; }
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run shared manifest tests" >&2; exit 127; }
	@tmp=$$(mktemp -d); trap 'rm -rf "$$tmp"' EXIT; \
		(cd go && go build -o "$$tmp/thuepp-go" ./cmd/thuepp); \
		uv run python tools/run-example-manifests --parity \
			--interpreter "python=uv run python python/thuepp.py" \
			--interpreter "go=$$tmp/thuepp-go" \
			examples/*/tests/*.toml

test-coverage:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run rule coverage checks" >&2; exit 127; }
	uv run python tools/check-rule-coverage examples/lisp/lisp.tpp examples/lisp/tests/*.toml
