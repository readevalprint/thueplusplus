# Attempt AW: delimited value representation stress test.
# Goal: fix the AV edgecase where pct AST item streams made ARR(...) values hard to capture
# as lambda/let arguments. Use explicit V[...] constructors with a constructor tag.

# Direct focused source forms for the failure class; this is not arbitrary parsing.
^\(\(lambda \(x\) \(head x\)\) \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)$ ::= APPLY_HEAD[VARR[{{a}}%2C{{b}}%2C{{c}}]]
^\(\(lambda \(x\) \(rest x\)\) \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)$ ::= APPLY_REST[VARR[{{a}}%2C{{b}}%2C{{c}}]]
^\(let \(\(x \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)\) \(head x\)\)$ ::= APPLY_HEAD[VARR[{{a}}%2C{{b}}%2C{{c}}]]
^\(let \(\(x \(array (?<a>-?[0-9]+) (?<b>-?[0-9]+) (?<c>-?[0-9]+)\)\)\) \(rest x\)\)$ ::= APPLY_REST[VARR[{{a}}%2C{{b}}%2C{{c}}]]

# Delimited destructuring is trivial once the whole array value is atomic.
^APPLY_HEAD\[VARR\[(?<a>-?[0-9]+)%2C(?<b>-?[0-9]+)%2C(?<c>-?[0-9]+)\]\]$ ::= VNUM[{{a}}]
^APPLY_REST\[VARR\[(?<a>-?[0-9]+)%2C(?<b>-?[0-9]+)%2C(?<c>-?[0-9]+)\]\]$ ::= VARR2[{{b}}%2C{{c}}]

^VNUM\[(?<n>-?[0-9]+)\]$ ::> stdout {{n}}
^VARR2\[(?<b>-?[0-9]+)%2C(?<c>-?[0-9]+)\]$ ::> stdout [{{b}} {{c}}]
