^MAP:.*$ ::| a=(?<v>[^,]*) ::! eq v v
^1$ ::> stdout 1\n

::=
MAP:a=x
