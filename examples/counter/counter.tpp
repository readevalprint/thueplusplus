# Simple counter in thue++
# Counts from 0 to 5

# Write handlers - write message, leave transition marker
>0 ::> stdout Count: 0\n
>1 ::> stdout Count: 1\n
>2 ::> stdout Count: 2\n
>3 ::> stdout Count: 3\n
>4 ::> stdout Count: 4\n
>5 ::> stdout Count: 5\n

# After write completes, state is: c0, c1, etc. (the ">N" was removed)
# Transition to next count
^c0$ ::= >1c1
^c1$ ::= >2c2
^c2$ ::= >3c3
^c3$ ::= >4c4
^c4$ ::= >5c5
^c5$ ::= done

# Finish
done ::> stdout Done!\n
::=
>0c0
