# A later rule rewrites a data row above itself.
above:old
^above:old$ ::= above:new
^above:new$ ::> stdout above:new\n

::=
