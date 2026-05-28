<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Hash data semantics

The character `#` has no special language-level meaning in Thue++.

A source row is a rule only when ordinary rule parsing finds a valid unescaped operator such as `::=`. A row that starts with `#` and has no valid operator is ordinary text for the same reason as any other non-rule row: before the final state separator it is inert source text, and after the final state separator it is ordinary initial-state text. A row such as `#x ::= y` is parsed by the ordinary rule grammar.

Runtime state is just text. Rows beginning with `#` are not protected from matching, and `\#` is not a language permission bit; it is only ordinary regex spelling for a literal hash where accepted by the regex engine.

The manifests in `tests/` pin Python/Go parity for:

- matching `#...` runtime rows without a special escape;
- broad row patterns seeing hash-prefixed state;
- `\#` behaving as ordinary regex syntax;
- source rows beginning with `#` plus a valid operator parsing normally;
- pattern alias expansion keeping source metadata out of executable state.
