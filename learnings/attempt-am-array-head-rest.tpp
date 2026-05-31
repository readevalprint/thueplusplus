# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt AM: typed array/head/rest value-layer probe.
# Goal: prove array values, head, and rest work with pct-protected render payloads.
# This is fixed width and fixed-pattern; not a general list parser.

# Arrays of ints and mixed int/string/int.
^\(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= ARR3[{{a}}|{{b}}|{{c}}]
^\(array (?<a>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<b>-?[0-9]+)\)$ ::= ARR3M[{{a}}|{{s|pctenc}}|{{b}}]

# head/rest over explicit array surface.
^\(head \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)$ ::= NUM[{{a}}]
^\(rest \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)$ ::= ARR2[{{b}}|{{c}}]
^\(head \(array (?<a>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<b>-?[0-9]+)\)\)$ ::= NUM[{{a}}]
^\(rest \(array (?<a>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<b>-?[0-9]+)\)\)$ ::= ARR2M[{{s|pctenc}}|{{b}}]

# Internal typed arrays render to Lisp-like array syntax.
^ARR3\[(?<a>-?[0-9]+)\|(?<b>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= OUTARR[%5B{{a}}%20{{b}}%20{{c}}%5D]
^ARR2\[(?<b>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= OUTARR[%5B{{b}}%20{{c}}%5D]
^ARR3M\[(?<a>-?[0-9]+)\|(?<s>[A-Za-z0-9_.%-]+)\|(?<b>-?[0-9]+)\]$ ::= OUTARR[%5B{{a}}%20%22{{s}}%22%20{{b}}%5D]
^ARR2M\[(?<s>[A-Za-z0-9_.%-]+)\|(?<b>-?[0-9]+)\]$ ::= OUTARR[%5B%22{{s}}%22%20{{b}}%5D]

^NUM\[(?<n>-?[0-9]+)\]$ ::> stdout {{n}}
^OUTARR\[(?<v>[A-Za-z0-9_.%-]+)\]$ ::> stdout {{v|pctdec}}
