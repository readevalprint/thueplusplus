#!/bin/sh
set -eu
cd "$(dirname "$0")/../../.." || exit 1

FORM_BODY=
if [ "${REQUEST_METHOD:-}" = POST ]; then
  FORM_BODY=$(dd bs=1 count="${CONTENT_LENGTH:-0}" 2>/dev/null || true)
fi

exec build/thuepp examples/lisp/lisp.tpp \
  --input-file "examples/lisp/cgi-bin/$(basename "$0" .cgi).lisp" \
  --eval-limit 400000 \
  --max-state-bytes 4194304 \
  -- \
  --REQUEST_METHOD "${REQUEST_METHOD:-}" \
  --PATH_INFO "${PATH_INFO:-}" \
  --QUERY_STRING "${QUERY_STRING:-}" \
  --CONTENT_TYPE "${CONTENT_TYPE:-}" \
  --CONTENT_LENGTH "${CONTENT_LENGTH:-}" \
  --FORM_BODY "$FORM_BODY"
