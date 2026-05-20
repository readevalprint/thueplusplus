SHELL := /bin/sh

.PHONY: test

# Runtime behavior is specified by executable example manifests, run against
# both mandatory implementations with integrated rule coverage.
test:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run repository verification" >&2; exit 127; }
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run repository verification" >&2; exit 127; }
	uv run python tools/check_contract.py
	uv run python tools/example_runner.py
