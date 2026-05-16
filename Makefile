SHELL := /bin/sh

.PHONY: test test-python test-go test-coverage test-js

test: test-python test-go test-coverage

# Future slot: add this target to `test` once a JavaScript implementation exists.
test-js:
	@echo "JavaScript implementation is not present yet; test-js is reserved for future JS tests."

test-python:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run Python tests" >&2; exit 127; }
	uv run python -m unittest discover -s python/tests -v

test-go:
	@command -v go >/dev/null 2>&1 || { echo "Error: go is required to run Go tests" >&2; exit 127; }
	cd go && go test -count=1 ./...

test-coverage:
	@command -v uv >/dev/null 2>&1 || { echo "Error: uv is required to run rule coverage checks" >&2; exit 127; }
	uv run python tools/check-rule-coverage examples/lisp/lisp.tpp examples/lisp/tests/*.toml
