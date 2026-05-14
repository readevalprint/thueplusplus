# Echo input to output using thue++ bulk-read semantics.
# Usage: ./python/thuepp.py examples/echo/echo.tpp --file:input /path/to/file

# Read the entire input binding once, then write the captured data to stdout.
^read$ ::< input echo:{{data}}
^ERR:resource:[\s\S]*$ ::- 1
^echo:(?<data>[\s\S]*)$ ::> stdout {{data}}

::=
read
