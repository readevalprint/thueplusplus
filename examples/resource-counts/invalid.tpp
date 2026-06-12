PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^old$ ::< 5s stdin
^bad-unit$ ::< 5s 1 chars stdin
^missing-capture$ ::< 5s {{n}} bytes stdin
^bad-capture (?<n>[A-Za-z]+)$ ::< 5s {{n}} bytes stdin
^eof-bytes$ ::< 5s 4 bytes stdin
^eof-lines$ ::< 5s 2 lines stdin
::=
old
