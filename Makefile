SHELL := /bin/sh

.PHONY: test test-contract test-shared test-coverage test-code-coverage

# Add a JavaScript target to `test` only after a JavaScript implementation exists
# and is wired through tools/run-example-manifests.
# Host-code coverage is intentionally focused-only until the measurement pass is trusted.
# Runtime behavior is specified by executable example manifests, not separate
# Python/Go unit-test suites.
test: test-contract test-shared test-coverage

test-contract:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run repository conformance checks" >&2; exit 127; }
	uv run python tools/check-contract

test-shared:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run shared manifest tests" >&2; exit 127; }
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run shared manifest tests" >&2; exit 127; }
	uv run python tools/run-example-manifests --contract tools/thuepp-contract.toml --parity --jobs 8 --manifest-glob 'examples/**/tests/*.toml'

test-coverage:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run rule coverage checks" >&2; exit 127; }
	uv run python tools/check-rule-coverage --jobs 8 --manifest-glob 'examples/**/tests/*.toml'

test-code-coverage:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run host-code coverage checks" >&2; exit 127; }
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run host-code coverage checks" >&2; exit 127; }
	uv run python tools/check-code-coverage
