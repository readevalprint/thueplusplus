# SPDX-License-Identifier: AGPL-3.0-or-later
PCT <- [A-Za-z0-9_.%-]*

^eq-space:(?<a>.*)\|(?<b>.*)$ ::! eq a b
^arg-key$ ::= ARG<QUERY_STRING>
^ARG<(?<key>QUERY_STRING)>$ ::! arg key
^full:(?<pattern>[^|]+)\|(?<text>.*)$ ::! re2full pattern text
^match:(?<pattern>[^|]+)\|(?<text>.*)$ ::! re2match pattern text
^find:(?<pattern>[^|]+)\|(?<text>.*)$ ::! re2find pattern text
^findidx:(?<pattern>[^|]+)\|(?<text>.*)$ ::! re2findidx pattern text
^groups:(?<pattern>[^|]+)\|(?<text>.*)$ ::! re2groups pattern text
^fullgroups:(?<pattern>[^|]+)\|(?<text>.*)$ ::! re2fullgroups pattern text
^(?<result>.+)$ ::> stdout {{result}}\n
::=
