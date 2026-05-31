# SPDX-License-Identifier: AGPL-3.0-or-later
# Goal: print exactly Hello, koan! and exit with code 0.
# This first rule turns the starting state into two chores:
# write the greeting, then exit cleanly.
^START$ ::= OUT\nEXIT

# TODO: send the exact expected line to stdout.
# OUT ::> stdout Hello, koan!\n
# TODO: exit with code 0 once the output is written.
# ^EXIT$ ::- 0
::=
START
