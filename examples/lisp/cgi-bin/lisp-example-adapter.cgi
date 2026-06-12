#!/bin/sh
# Trusted CGI adapter for examples/lisp/cgi-example.lisp.
#
# Python's `http.server --cgi` only executes files under cgi-bin/ or htbin/.
# Keep untrusted Lisp as plain source outside cgi-bin; this adapter owns the
# host boundary: ruleset path, Lisp app path, resource limits, and the small CGI
# environment whitelist exposed as explicit `(arg "KEY")` script args.
set -eu
cd "$(dirname "$0")/../../.." || exit 1
exec uv run python python/thuepp.py examples/lisp/lisp.tpp \
  --input-file examples/lisp/cgi-example.lisp \
  --eval-limit 100000 \
  --max-state-bytes 1048576 \
  -- \
  --REQUEST_METHOD "${REQUEST_METHOD:-}" \
  --PATH_INFO "${PATH_INFO:-}" \
  --QUERY_STRING "${QUERY_STRING:-}"
