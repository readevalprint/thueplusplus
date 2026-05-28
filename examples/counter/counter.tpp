# SPDX-License-Identifier: AGPL-3.0-or-later

>0 ::> stdout Count: 0\n
>1 ::> stdout Count: 1\n
>2 ::> stdout Count: 2\n
>3 ::> stdout Count: 3\n
>4 ::> stdout Count: 4\n
>5 ::> stdout Count: 5\n

^c0$ ::= >1c1
^c1$ ::= >2c2
^c2$ ::= >3c3
^c3$ ::= >4c4
^c4$ ::= >5c5
^c5$ ::= done

done ::> stdout Done!\n
::=
>0c0
