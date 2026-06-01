The machine starts by walking to the log line, then to the exit.
^START$ ::= LOG\nEXIT

The log line writes the wrong bytes.
Change only the text after stdout.
LOG ::> stdout nope\n
The process exits cleanly after the log line writes.
^EXIT$ ::- 0
::=
START
