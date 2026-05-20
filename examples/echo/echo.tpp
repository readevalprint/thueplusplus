# Echo input to output using safe PCT read semantics.
# Usage: ./python/thuepp.py examples/echo/echo.tpp --proc:input "producer command"

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

# Read the entire proc binding once as inert PCT, then decode only at output.
^read$ ::= echo:@IN@
@IN@ ::< -1 input
^echo:(?<data>$PCT)$ ::> stdout {{data|pctdec}}

::=
read
