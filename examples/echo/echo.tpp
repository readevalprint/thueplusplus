# Echo input to output using safe PCT read semantics.
# Usage: ./python/thuepp.py examples/echo/echo.tpp --file:input /path/to/file

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

# Read the entire input binding once as inert PCT, then decode only at output.
^read$ ::= echo:@IN@
@IN@ ::< -1 input
^echo:(?<data>$PCT)$ ::> stdout {{data|pctdec}}

::=
read
