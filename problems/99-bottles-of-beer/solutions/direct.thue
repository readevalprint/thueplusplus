^v4\n ::> stdout 4 bottles of beer on the wall, 4 bottles of beer.\nTake one down and pass it around, 3 bottles of beer on the wall.\n\n
^v3\n ::> stdout 3 bottles of beer on the wall, 3 bottles of beer.\nTake one down and pass it around, 2 bottles of beer on the wall.\n\n
^v2\n ::> stdout 2 bottles of beer on the wall, 2 bottles of beer.\nTake one down and pass it around, 1 bottle of beer on the wall.\n\n
^v1\n ::> stdout 1 bottle of beer on the wall, 1 bottle of beer.\nTake one down and pass it around, no more bottles of beer on the wall.\n\n
^f1\n?\z ::> stdout No more bottles of beer on the wall, no more bottles of beer.\nGo to the store and buy some more, 1 bottle of beer on the wall.\n
^f2\n?\z ::> stdout No more bottles of beer on the wall, no more bottles of beer.\nGo to the store and buy some more, 2 bottles of beer on the wall.\n
^f3\n?\z ::> stdout No more bottles of beer on the wall, no more bottles of beer.\nGo to the store and buy some more, 3 bottles of beer on the wall.\n
^f4\n?\z ::> stdout No more bottles of beer on the wall, no more bottles of beer.\nGo to the store and buy some more, 4 bottles of beer on the wall.\n
\A\z ::- 0
\Ag:0\ni:4\nbuy:(?<b>4)\n\z ::= g:1\nv4\ni:4\nbuy:{{b}}\n
\Ag:0\ni:3\nbuy:(?<b>[1-4])\n\z ::= g:1\nv3\ni:3\nbuy:{{b}}\n
\Ag:0\ni:2\nbuy:(?<b>[1-4])\n\z ::= g:1\nv2\ni:2\nbuy:{{b}}\n
\Ag:0\ni:1\nbuy:(?<b>[1-4])\n\z ::= g:1\nv1\ni:1\nbuy:{{b}}\n
\Ag:1\ni:4\nbuy:(?<b>4)\n\z ::= g:0\ni:3\nbuy:{{b}}\n
\Ag:1\ni:3\nbuy:(?<b>[1-4])\n\z ::= g:0\ni:2\nbuy:{{b}}\n
\Ag:1\ni:2\nbuy:(?<b>[1-4])\n\z ::= g:0\ni:1\nbuy:{{b}}\n
\Ag:1\ni:1\nbuy:(?<b>1)\n\z ::= f1
\Ag:1\ni:1\nbuy:(?<b>2)\n\z ::= f2
\Ag:1\ni:1\nbuy:(?<b>3)\n\z ::= f3
\Ag:1\ni:1\nbuy:(?<b>4)\n\z ::= f4
\Ain\n?\z ::< 30 stdin
\A(?<n>[1-4])\n?\z ::= g:0\ni:{{n}}\nbuy:{{n}}\n

::=
in
