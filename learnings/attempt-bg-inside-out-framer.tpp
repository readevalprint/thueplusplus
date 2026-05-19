# Attempt BG: inside-out pct framer probe.
# Goal: test user's architecture: repeatedly pct-encode innermost raw paren
# groups until no raw parens remain, then decode/evaluate the first outer node.
# Scope: proof-of-shape only, not hard acceptance. It confirms that encoded inner
# lists remain inert and the final outer node can be selected explicitly.

PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

# Source entry. Keep broad enough for this disposable probe, but state is distinct
# so internal evaluator rows are not re-lexed.
^(?<input>\([\s\S]*\))$ ::= C[{{input}}]

# Encode the leftmost innermost parenthesized raw list. Because encoded children
# contain no raw parens, repeated application works inside-out.
^C\[(?<pre>[\s\S]*)\((?<inner>[^()]*)\)(?<post>[\s\S]*)\]$ ::= C[{{pre}}L%5B{{inner|pctenc}}%5D{{post}}]

# When no raw parens remain and the whole document is one encoded list, move to
# first-outer-node evaluation.
^C\[L%5B(?<payload><|PCT|>)%5D\]$ ::= OUTER[{{payload}}]

# Demonstrate decode of only the outer node. Nested L[...] children remain pct-
# encoded in the decoded payload and therefore inert until deliberately selected.
^OUTER\[(?<payload><|PCT|>)\]$ ::= @OUT[{{payload}}]@@EXIT0@

^@OUT\[(?<v><|PCT|>)\]@@EXIT0@$ ::> stdout {{v|pctdec}}\n
^@EXIT0@$ ::- 0
