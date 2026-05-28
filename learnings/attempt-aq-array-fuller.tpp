# SPDX-License-Identifier: AGPL-3.0-or-later
# Attempt AQ: fuller array/head/rest probe.
# Goal: specify empty/singleton/rest behavior and mixed values.
# Runtime render shape is ARRAY[...] -> [items]. Empty is []. Rest singleton -> [].

# Array literals: empty, singleton, pair, triple, mixed triple.
^\(array\)$ ::= ARRAY0[]
^\(array (?<a>-?[0-9]+)\)$ ::= ARRAY1[{{a}}]
^\(array (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)$ ::= ARRAY2[{{a}}|{{b}}]
^\(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)$ ::= ARRAY3[{{a}}|{{b}}|{{c}}]
^\(array (?<a>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<b>-?[0-9]+)\)$ ::= ARRAY3M[{{a}}|{{s|pctenc}}|{{b}}]

# Head. Empty head is explicit fail-loud runtime error text for now.
^\(head \(array\)\)$ ::= ERROR[empty_array]
^\(head \(array (?<a>-?[0-9]+)\)\)$ ::= NUM[{{a}}]
^\(head \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)\)$ ::= NUM[{{a}}]
^\(head \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)$ ::= NUM[{{a}}]
^\(head \(array (?<a>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<b>-?[0-9]+)\)\)$ ::= NUM[{{a}}]

# Rest.
^\(rest \(array\)\)$ ::= ARRAY0[]
^\(rest \(array (?<a>-?[0-9]+)\)\)$ ::= ARRAY0[]
^\(rest \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+)\)\)$ ::= ARRAY1[{{b}}]
^\(rest \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)$ ::= ARRAY2[{{b}}|{{c}}]
^\(rest \(array (?<a>-?[0-9]+) "(?<s>[A-Za-z0-9_ -]+)" (?<b>-?[0-9]+)\)\)$ ::= ARRAY2S[{{s|pctenc}}|{{b}}]

# Render staging.
^ARRAY0\[\]$ ::= OUTARR[%5B%5D]
^ARRAY1\[(?<a>-?[0-9]+)\]$ ::= OUTARR[%5B{{a}}%5D]
^ARRAY2\[(?<a>-?[0-9]+)\|(?<b>-?[0-9]+)\]$ ::= OUTARR[%5B{{a}}%20{{b}}%5D]
^ARRAY3\[(?<a>-?[0-9]+)\|(?<b>-?[0-9]+)\|(?<c>-?[0-9]+)\]$ ::= OUTARR[%5B{{a}}%20{{b}}%20{{c}}%5D]
^ARRAY3M\[(?<a>-?[0-9]+)\|(?<s>[A-Za-z0-9_.%-]+)\|(?<b>-?[0-9]+)\]$ ::= OUTARR[%5B{{a}}%20%22{{s}}%22%20{{b}}%5D]
^ARRAY2S\[(?<s>[A-Za-z0-9_.%-]+)\|(?<b>-?[0-9]+)\]$ ::= OUTARR[%5B%22{{s}}%22%20{{b}}%5D]

^NUM\[(?<n>-?[0-9]+)\]$ ::> stdout {{n}}
^ERROR\[(?<e>[A-Za-z0-9_]+)\]$ ::> stderr {{e}}
^OUTARR\[(?<v>[A-Za-z0-9_.%-]+)\]$ ::> stdout {{v|pctdec}}
