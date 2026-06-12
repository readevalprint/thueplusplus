#!/bin/sh
# Trusted CGI adapter for the checked Lisp CGI examples.
#
# Python's `http.server --cgi` executes only files under cgi-bin/ or htbin/.
# Keep untrusted Lisp as plain source outside cgi-bin; this adapter owns the
# host boundary: route selection, ruleset path, resource limits, bounded request
# body reads, and the small CGI metadata whitelist exposed as explicit `(arg
# "KEY")` script args.
set -eu

MAX_FORM_BODY_BYTES=8192
PATH_VALUE=${PATH_INFO:-}
METHOD=${REQUEST_METHOD:-}
CONTENT_TYPE_VALUE=${CONTENT_TYPE:-}
CONTENT_LENGTH_VALUE=${CONTENT_LENGTH:-}
FORM_BODY=

cgi_error() {
  status=${2:-400}
  reason='Bad Request'
  if [ "$status" = 404 ]; then
    reason='Not Found'
  fi
  printf 'Status: %s %s\r\n' "$status" "$reason"
  printf 'Content-Type: text/plain\r\n\r\n'
  printf '%s\n' "$1"
  exit 0
}

# This adapter deliberately invokes one checked Lisp web app for every PATH_INFO.
# Routing, query/form interpretation, 404 responses, and HTML escaping live in
# Lisp; shell only owns trusted CGI mechanics and bounded body transfer.
app='examples/lisp/web-demo.lisp'

if [ "$METHOD" = POST ]; then
  case "$CONTENT_LENGTH_VALUE" in
    '') cgi_error 'missing CONTENT_LENGTH for POST' ;;
    *[!0-9]*) cgi_error 'invalid CONTENT_LENGTH for POST' ;;
  esac
  if [ "$CONTENT_LENGTH_VALUE" -gt "$MAX_FORM_BODY_BYTES" ]; then
    cgi_error "CONTENT_LENGTH exceeds ${MAX_FORM_BODY_BYTES} byte limit"
  fi

  tmp_body=$(mktemp)
  trap 'rm -f "$tmp_body"' EXIT INT TERM
  dd bs=1 count="$CONTENT_LENGTH_VALUE" of="$tmp_body" 2>/dev/null
  actual_bytes=$(wc -c < "$tmp_body" | tr -d ' ')
  if [ "$actual_bytes" != "$CONTENT_LENGTH_VALUE" ]; then
    cgi_error 'truncated POST body'
  fi
  FORM_BODY=$(cat "$tmp_body")
  rm -f "$tmp_body"
  trap - EXIT INT TERM
fi

cd "$(dirname "$0")/../../.." || exit 1
if [ -x .venv/bin/python ]; then
  exec .venv/bin/python python/thuepp.py examples/lisp/lisp.tpp \
    --input-file "$app" \
    --eval-limit 400000 \
    --max-state-bytes 4194304 \
    -- \
    --REQUEST_METHOD "$METHOD" \
    --PATH_INFO "$PATH_VALUE" \
    --QUERY_STRING "${QUERY_STRING:-}" \
    --CONTENT_TYPE "$CONTENT_TYPE_VALUE" \
    --CONTENT_LENGTH "$CONTENT_LENGTH_VALUE" \
    --FORM_BODY "$FORM_BODY"
fi
exec uv run python python/thuepp.py examples/lisp/lisp.tpp \
  --input-file "$app" \
  --eval-limit 400000 \
  --max-state-bytes 4194304 \
  -- \
  --REQUEST_METHOD "$METHOD" \
  --PATH_INFO "$PATH_VALUE" \
  --QUERY_STRING "${QUERY_STRING:-}" \
  --CONTENT_TYPE "$CONTENT_TYPE_VALUE" \
  --CONTENT_LENGTH "$CONTENT_LENGTH_VALUE" \
  --FORM_BODY "$FORM_BODY"
