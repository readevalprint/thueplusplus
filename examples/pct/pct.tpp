# Generic PCT framing examples.
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^enc:(?<x>[\s\S]*)$ ::! pctenc x
^dec:(?<x><|PCT|>)$ ::! pctdec x
^data:space$ ::% hello world
^data:escape$ ::% a\nb
^data:percent$ ::% 100%
^data:encoded-looking$ ::% %20
^join:(?<a><|PCT|>),(?<b><|PCT|>)$ ::% {{a}}, {{b}}
^read$ ::= out:@IN@
@IN@ ::< -1 input
^out:(?<x><|PCT|>)$ ::> stdout {{x|pctdec}}
^(?<out>[^\n]+)$ ::> stdout {{out}}\n

::=
