# SPDX-License-Identifier: AGPL-3.0-or-later
PORT ?= 8000
HOST ?= 127.0.0.1

.PHONY: serve-cgi test-cgi

serve-cgi:
	@cd ../.. && uv run python python/thuepp.py --help >/dev/null
	python3 -m http.server --cgi $(PORT) --bind $(HOST)

test-cgi:
	cd ../.. && uv run --with pytest pytest tools/test_lisp_cgi_script.py -q --tb=short
