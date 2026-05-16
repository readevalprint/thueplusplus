# Test-only fixture for malformed numeric parser coverage.
# This deliberately bypasses the public numeric regex from ../builtin.tpp so
# tests can assert builtin parser error taxonomy for invalid numeric strings.
^parser-add:(?<a>[^,]+),(?<b>[^,]+)$ ::! add a b
::=
