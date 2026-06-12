# SPDX-License-Identifier: AGPL-3.0-or-later
PORT ?= 8000
HOST ?= 127.0.0.1
TEST_PORT := $(if $(TEST_PORT),$(TEST_PORT),$(shell python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1", 0)); print(s.getsockname()[1]); s.close()'))
CGI_URL := http://$(HOST):$(PORT)/cgi-bin/lisp-example-adapter.cgi/health?a=1
ROOT_URL := http://$(HOST):$(PORT)/
TEST_CGI_URL := http://$(HOST):$(TEST_PORT)/cgi-bin/lisp-example-adapter.cgi/health?a=1
TEST_ROOT_URL := http://$(HOST):$(TEST_PORT)/

.PHONY: serve-cgi test-cgi

serve-cgi:
	python3 -m http.server --cgi $(PORT) --bind $(HOST)

test-cgi:
	@tmp_log=$$(mktemp); \
	python3 -m http.server --cgi $(TEST_PORT) --bind $(HOST) >$$tmp_log 2>&1 & \
	pid=$$!; \
	trap 'kill $$pid 2>/dev/null || true; wait $$pid 2>/dev/null || true; rm -f $$tmp_log $$tmp_body' EXIT INT TERM; \
	tmp_body=$$(mktemp); \
	ok=; \
	for _ in $$(seq 1 50); do \
		if curl -fsS '$(TEST_CGI_URL)' >$$tmp_body 2>/dev/null; then ok=1; break; fi; \
		sleep 0.1; \
	done; \
	if [ -z "$$ok" ]; then \
		echo 'CGI request failed' >&2; \
		cat $$tmp_log >&2; \
		exit 1; \
	fi; \
	if ! curl -fsS '$(TEST_ROOT_URL)' | grep -Fq '/cgi-bin/lisp-example-adapter.cgi/health?a=1'; then \
		echo 'root index does not link to CGI smoke endpoint' >&2; \
		cat $$tmp_log >&2; \
		exit 1; \
	fi; \
	printf 'method=GET\npath=/health\nquery=a=1\n' | cmp -s - $$tmp_body || { \
		echo 'unexpected CGI response body:' >&2; \
		cat $$tmp_body >&2; \
		echo >&2; \
		echo 'server log:' >&2; \
		cat $$tmp_log >&2; \
		exit 1; \
	}; \
	echo 'CGI smoke passed: $(TEST_CGI_URL)'
