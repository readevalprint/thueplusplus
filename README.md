<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
> We do this not because it is easy, but because we thought it would be easy.

# Thue++

Start with a string and rules that rewrite it:

```text
lhs ::= rhs
```

This is a [semi-Thue system](https://grokipedia.com/page/Semi-Thue_system): replace matching substrings by rule, and repeat. It is named after [Axel Thue](https://mathshistory.st-andrews.ac.uk/Biographies/Thue/), whose early work on [string rewriting](https://grokipedia.com/page/Rewriting) became part of the foundation of formal language theory.

John Colagioia's esolang [Thue](https://github.com/jcolag/Thue) turned that idea into a small programming language. Thue++ keeps the same core model, then adds [regular-expression](https://en.wikipedia.org/wiki/Regular_expression) captures and templates:

```thuepp
^hello (?<name>[A-Za-z]+)$ ::= hi {{name}}
```

A rule matches the current state. If it applies, it rewrites with the template. Then scanning starts again from the top.

Optional context links are included where they help. You do not need a formal-language background to read this README, and the links are there for whichever terms you want to chase further.

This README builds up from the [rules](#rules) then to [captures](#captures-and-templates), [IO](#io-resources-and-builtins), [state machines](examples/guess-number/guess-number.tpp), [Forth](examples/forth/README.md), and [Lisp](examples/lisp/README.md).

## Use cases

Thue++ has a small surface area: ordered regex rules, capture templates, explicit resources, and a single state string. That makes it easier to audit than a general-purpose embedded language.

The execution model is deterministic. Given the same source, state, resource bindings, resource messages, and limits, the same rule fires in the same order and produces the same result. Numeric builtins use exact rationals rather than float arithmetic, so numeric behavior is deterministic too.

External effects are gated through named resources. A program cannot reach the network, filesystem, API keys, subprocesses, or host services unless the runner binds a resource that exposes them.

Resource metering is also direct. Memory is the size of the current state string. Time and CPU can be charged by rewrite step, rule match, or even rule check, depending on how strict the host needs to be.

That makes Thue++ a candidate for anything that needs to run untrusted code. For example, a sandbox for agent-facing [domain-specific languages](https://martinfowler.com/books/dsl.html): the host can expose only the capabilities an LLM agent should have, meter the text state and rewrite budget, and keep API keys or network access outside the language. The same properties also support blockchain smart-contract execution, where gas can be charged per step and persisted state size. Anything is possible.

## Rules

```thuepp
^hello$ ::= world

::=
hello
```

This program has one rule and one initial state.

The last `::=` marks the start of that state. The marker is not included. The state starts as `hello`, so the rule rewrites it to `world`.

Rules scan top to bottom. After a match, scanning starts again from the first rule.

## Captures and templates

The pattern can capture text, and the replacement can use it:

```thuepp
^hello (?<name>[A-Za-z]+)$ ::= hi {{name}}

::=
hello Ada
```

The capture `name` matches `Ada`, so the state rewrites to `hi Ada`.

## Pattern aliases

When a regex fragment gets reused or hard to read, give it a name:

```thuepp
NAME_ALIAS <- [A-Za-z_][A-Za-z0-9_]*
^hello (?<name>$NAME_ALIAS)$ ::= hi {{name}}
```

The rule uses `$NAME_ALIAS` where the full regex would otherwise go.

## IO, resources, and builtins

These operators are the boundary between pure rewriting and effects:

```text
::=   rewrite state
::>   write to a resource
::<   read from a resource
::-   exit with a code
::!   call a builtin
```

The default resources are `stdin`, `stdout`, and `stderr`. A runner can bind more names to processes, browser callbacks, or other streams.

Runners can also pass script arguments after `--`. A rule can read a named script argument with `::! arg KEY`; the value enters state PCT-encoded, just like resource input. For example, `thuepp examples/args/args.tpp -- --QUERY_STRING "$QUERY_STRING"` exposes the explicit `QUERY_STRING` argument to rules using `::! arg QUERY_STRING`. If the key comes from a capture, use the same RHS template syntax as other operators: `::! arg {{key}}`.

## Hello world

This program writes one line, then exits:

<!-- thuepp-readme-example: source=examples/hello/hello.tpp expected-output=examples/hello/tests/basic.toml -->
<!-- thuepp-readme-example:start -->
Example source (`examples/hello/hello.tpp`):

Run it now in the browser playground:
https://thuelang.org/playground?file=./examples/hello/hello.tpp

See the source: [examples/hello/hello.tpp](https://gitlab.com/thuelang/thueplusplus/-/blob/main/examples/hello/hello.tpp)

```thuepp
# SPDX-License-Identifier: AGPL-3.0-or-later
^START$ ::= hello\ndone
hello ::> stdout Hello, World!\n
done ::- 0

::=
START
```

Expected output:

```text
Hello, World!
```
<!-- thuepp-readme-example:end -->

## Input and processes

Reads and writes go through named resources.

```thuepp
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^START$ ::= @PROMPT@NAME<@READ@>
@PROMPT@ ::> stdout What is your name?\n
@READ@ ::< 30s 1 lines stdin
^NAME<(?<name>$PCT)>$ ::> stdout hello {{name|pctdec}}!\n

::=
START
```

`::< 30s 1 lines stdin` reads exactly one newline-terminated line from `stdin` with an explicit 30-second timeout. Every operator RHS is expanded as a `{{capture}}` template before that operator parses it, so captured read operands are explicit: `::< {{timeout}} {{count}} {{unit}} {{resource}}`. Read timeouts are positive integer durations with `ms`, `s`, or `m` units; bare numeric seconds are invalid. Resource reads use `TIMEOUT COUNT UNIT RESOURCE`: after template expansion, `UNIT` is plural-only `lines` or `bytes`, `COUNT` is a non-negative integer, and `RESOURCE` is a bound resource name. `lines` strips terminators and joins multiple lines with `\n`; `bytes` reads exact raw bytes. The payload is PCT-encoded before it enters state. `{{name|pctdec}}` decodes it before writing.

The same resource interface can connect to a process. The runner binds a resource name, and Thue++ reads or writes through that name.

## Conditionals by rewriting: guess the number

Conditionals come from pattern choice. If the state matches one rule, that rule fires. If it does not, scanning continues until another rule matches.

The guess-number example uses this to validate input and choose the next state. Numeric builtins only see digit strings; invalid input rewrites back to the prompt.

Numeric builtins are deterministic exact-rational operations. Decimal-looking input such as `0.1` is parsed as the rational `1/10`; adding `0.1` and `0.2` returns `3/10`, not a [floating-point](https://floating-point-gui.de/) approximation. The interpreters do not use decimal or binary float arithmetic internally.

It also shows process resources. The program reads `@RANDOM_NUMBER@` from the `random` resource. This command runs the Go backend and binds `random` to a process that writes `7`:

```bash
printf 'x\n3\n8\n7\n' | \
  go -C go run ./cmd/thuepp \
    ../examples/guess-number/guess-number.tpp \
    --proc:random 'printf 7; echo'
```

<!-- thuepp-readme-example: source=examples/guess-number/guess-number.tpp source-lines=1-30 expected-output=examples/guess-number/tests/basic.toml -->
<!-- thuepp-readme-example:start -->
Example source excerpt (`examples/guess-number/guess-number.tpp`, lines 1-30):

Run it now in the browser playground:
https://thuelang.org/playground?file=./examples/guess-number/guess-number.tpp

See the source: [examples/guess-number/guess-number.tpp](https://gitlab.com/thuelang/thueplusplus/-/blob/main/examples/guess-number/guess-number.tpp)

```thuepp
# SPDX-License-Identifier: AGPL-3.0-or-later
NUMBER <- [0-9]+

PAYLOAD <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

@RANDOM_NUMBER@ ::< 5s 1 lines random

@PROMPT@ ::> stdout Guess:\n
@USER_GUESS@ ::< 30s 1 lines stdin

@INVALID_NUMBER@ ::> stdout Please enter digits only.\n
@TOO_LOW@ ::> stdout Too low.\n
@TOO_HIGH@ ::> stdout Too high.\n

@EQUAL\[(?<guess>$NUMBER),(?<secret>$NUMBER)\]@ ::! numeq {{guess}} {{secret}}
@LESS_THAN\[(?<guess>$NUMBER),(?<secret>$NUMBER)\]@ ::! lt {{guess}} {{secret}}

^SECRET<(?<secret>$NUMBER)>$ ::= @PROMPT@GUESS<{{secret}}|@USER_GUESS@>

^GUESS<(?<secret>$NUMBER)\|(?<guess>$NUMBER)>$ ::= CHECK<{{secret}}|{{guess}}|@EQUAL[{{guess}},{{secret}}]@>

^GUESS<(?<secret>$NUMBER)\|(?<bad>$PAYLOAD)>$ ::= @INVALID_NUMBER@SECRET<{{secret}}>

^CHECK<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|1>$ ::> stdout Correct!\n
^CHECK<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|0>$ ::= DIRECTION<{{secret}}|{{guess}}|@LESS_THAN[{{guess}},{{secret}}]@>

^DIRECTION<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|1>$ ::= @TOO_LOW@SECRET<{{secret}}>
^DIRECTION<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|0>$ ::= @TOO_HIGH@SECRET<{{secret}}>

::=
```

Expected output:

```text
Guess:
Please enter digits only.
Guess:
Too low.
Guess:
Too high.
Guess:
Correct!
```
<!-- thuepp-readme-example:end -->

## Structured state: copy-on-write KV store

The copy-on-write KV example stores a transactional key-value database in the state string. See [`examples/cow-kv/README.md`](examples/cow-kv/README.md) for the full walkthrough.

Commands are semicolon-separated:

```text
set a base; begin; set a child; commit; get a
```

Expected output:

```text
child
```

Internally, the program rewrites commands into a state shaped like this:

```text
RUN|base|stack|remaining-commands|
```

`base` holds committed entries. `stack` holds transaction frames such as `T[...]T[...]`. The top frame is the current transaction.

Transactions are copy-on-write overlays. `set` and `del` write only to the top frame when a transaction is open. `get` scans the top frame, then parent frames, then base. Deletions are tombstones, so they stop lookup and return `nil`.

`commit` merges the top frame one level down. `discard` removes the top frame. This lets rewrite rules model stacks, tombstones, lookup order, and transaction boundaries.

## A smaller language inside the language: Forth

[`examples/forth/forth.tpp`](examples/forth/forth.tpp) is a compact [stack machine](https://en.wikipedia.org/wiki/Stack_machine) in the spirit of [Forth](https://www.forth.com/resources/forth-programming-language/), written as rewrite rules. It is smaller than the Lisp evaluator, but it shows the same idea: a language can live inside state transitions.

```text
1 2 + 3 *
```

Expected output:

```text
9
```

Tokens are whitespace-delimited. The data stack renders top-first, so `1 2 3` becomes `3 2 1`. The executable cases are in [`examples/forth/tests/core.toml`](examples/forth/tests/core.toml), with more notes in [`examples/forth/README.md`](examples/forth/README.md).

## A larger language inside the language: Lisp

Apparently, you can write a powerful [Lisp](https://en.wikipedia.org/wiki/Lisp_%28programming_language%29) as regex rewrite rules. [`examples/lisp/lisp.tpp`](examples/lisp/lisp.tpp) is still only Thue++ rules. The reader, typed values, [lexical scope](https://www.scheme.com/tspl4/binding.html), closures, lists, quote, eval, and macro expansion all live in `.tpp`.

```lisp
(add (mul 2 3) 4)
```

Expected output:

```text
10
```

The key boundary is source text versus runtime state. The reader protects strings, expands shorthand, and freezes lists into pct-encoded `L<...>` payloads.

A leading `'` means `quote`: `'x` reads as `(quote x)`, and `'(add 1 2)` reads as `(quote (add 1 2))` before evaluation.

```thuepp
^READ<(?<pre>[\s\S]*)'(?<datum>$READER_DATUM)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}(quote {{datum}}){{post}}> {{k}}
^READ<(?<pre>[\s\S]*)`(?<datum>$READER_DATUM)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}(quasiquote {{datum}}){{post}}> {{k}}
^READ<(?<pre>[\s\S]*),(?<datum>$READER_DATUM)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}(unquote {{datum}}){{post}}> {{k}}
^READ<(?<pre>[\s\S]*),@(?<datum>$READER_DATUM)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}(splice {{datum}}){{post}}> {{k}}
^READ<(?<pre>[\s\S]*)\((?<inner>[^()]*)\)(?<post>[\s\S]*)> (?<k>K(?:TOP|PARSE<.*>))$ ::= READ<{{pre}}L<{{inner|pctenc}}>{{post}}> {{k}}
```

Top-level input then boots an explicit environment. Primitive functions are values in that environment (`VPRIM<add>`, `VPRIM<parse>`, `VPRIM<macroexpand>`, and friends). They can be passed around, shadowed, or left out of later eval scopes.

```thuepp
^READ<L<(?<payload>$PCT)>> KTOP$ ::= CBOOT<{{payload|pctdec}}|KDONE>
^CBOOT<(?<expr>[^|]*)\|(?<k>.*)>$ ::= EENV<{{expr}}|add=VPRIM%3Cadd%3E;mul=VPRIM%3Cmul%3E;parse=VPRIM%3Cparse%3E;macroexpand=VPRIM%3Cmacroexpand%3E;write=VPRIM%3Cwrite%3E;|{{k}}>
```

The real rule has more primitives; this is the shape.

## Lisp quotes: code as data

`quote` is lazy: it returns source as data instead of evaluating it. Symbols become `VSYM<...>`. Lists become `VLIST<...>` with [percent-encoded](https://datatracker.ietf.org/doc/html/rfc3986#section-2.1) items. Output renders them back as readable Lisp.

```thuepp
^EENV<quote (?<item>(?:$OPSYM|$EXPR))\|(?<env>[^|]*)\|(?<k>.*)>$ ::= QUOTE<{{item}}|{{k}}>
^QUOTE<(?<sym>$SYM)\|(?<k>.*)>$ ::= RET<VSYM<{{sym|pctenc}}>|{{k}}>
^QUOTE<L<(?<payload>$PCT)>\|(?<k>.*)>$ ::= QUOTELIST<{{payload|pctdec}}|{{k}}|>
^QUOTELIST<(?<item>(?:$OPSYM|$EXPR))(?: (?<rest>[^|]*))?\|(?<k>.*)\|(?<acc>$ITEMS)>$ ::= QUOTE<{{item}}|KQLIST<{{rest}}|{{acc}}> {{k}}>
```

```lisp
'(add 1 2)
```

Expected output:

```text
(add 1 2)
```

`quasiquote` uses the same data boundary, but escape forms can evaluate. `unquote` inserts one value. `splice` inserts the items of a list.

```thuepp
^EENV<quasiquote (?<item>(?:$OPSYM|$EXPR))\|(?<env>[^|]*)\|(?<k>.*)>$ ::= QQ<{{item}}|{{env}}|{{k}}>
^QQESC<unquote\|list\|(?<expr>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ARGENV<{{expr|pctdec}}|{{env}}|KKEEPENV<{{env}}> KQQITEM<{{rest}}|{{env}}|{{acc}}> {{k}}>
^QQESC<splice\|list\|(?<expr>$PCT)\|(?<rest>[^|]*)\|(?<env>[^|]*)\|(?<acc>$ITEMS)> (?<k>.*)>$ ::= ARGENV<{{expr|pctdec}}|{{env}}|KKEEPENV<{{env}}> KQQSPLICE<{{rest}}|{{env}}|{{acc}}> {{k}}>
```

```lisp
`(add ,(add 1 2) ,@(list 4 5))
```

Expected output:

```text
(add 3 4 5)
```

## Lisp parse: source strings to code values

`parse` turns string data into Lisp code-as-data. It is not `eval`. It uses the same reader as top-level input, but returns the quoted data value instead of running it.

```thuepp
^APPLY<VPRIM<parse>\|(?<a>[^;]*);\|(?<k>.*)>$ ::= BPARSE<{{a|pctdec}}|{{k}}>
^BPARSE<VSTR<(?<s>$PCT)>\|(?<k>.*)>$ ::= READ<{{s|pctdec}}> KPARSE<{{k}}>
^READ<L<(?<payload>$PCT)>> KPARSE<(?<k>.*)>$ ::= QUOTE<L<{{payload}}>|{{k}}>
^READ<(?<sym>$SYM)> KPARSE<(?<k>.*)>$ ::= QUOTE<{{sym}}|{{k}}>
```

Parsing source produces the same kind of data as `quote`:

```lisp
(parse "(add 1 2)")
```

Expected output:

```text
(add 1 2)
```

Because `parse` reuses the reader, shorthand is canonicalized too:

```lisp
(parse "`(1 ,x)")
```

Expected output:

```text
(quasiquote (1 (unquote x)))
```

To run parsed code, pass it to `eval` with an explicit scope:

```lisp
(eval (parse "(add x 1)") (dict ('add add) ('x 10)))
```

Expected output:

```text
11
```

## Lisp eval: explicit scope as sandbox

`eval` does not use caller locals or the default core environment. It evaluates its `code` and `scope` operands, converts the association-list scope into an environment, and runs the code there. The code can only see names in that alist.

```thuepp
^EENV<eval (?<code>$EXPR) (?<scope>$EXPR)\|(?<env>[^|]*)\|(?<k>.*)>$ ::= ARGENV<{{code}}|{{env}}|KEVALSCOPE<{{scope|pctenc}}^{{env}}> {{k}}>
^RET<(?<code>$VAL)\|KEVALSCOPE<(?<scope>$PCT)\^(?<env>[^>]*)> (?<k>.*)>$ ::= ARGENV<{{scope|pctdec}}|{{env}}|KEVALRUN<{{code}}> {{k}}>
^ALIST2ENV<\|(?<code>$VAL)\|(?<k>.*)\|(?<acc>(?:$NAME=[^;]*;)*)>$ ::= CODEVAL<{{code}}|{{acc}}|{{k}}>
^CODEVAL<VSYM<(?<name>$NAME)>\|(?<scopeenv>[^|]*)\|(?<k>.*)>$ ::= LOOK<{{name}}|{{scopeenv}}|{{k}}>
```

```lisp
(eval '(add x 1) (dict ('add add) ('x 10)))
```

Expected output:

```text
11
```

A sandbox is a function that builds a smaller scope before calling `eval`:

```lisp
(let ((sandbox
        (fn (source)
          (eval
            (parse source)
            (dict
              ('square (fn (x) (mul x x)))
              ('safe-add (fn (a b) (add a b))))))))
  (sandbox "(square 6)"))
```

That returns `36`. The helper only exposes the API it installs:

```lisp
(sandbox "(safe-add 1 2)") ; returns 3
(sandbox "(add 1 2)")      ; fails with unbound_name
```

`'square`, `'safe-add`, `'add`, and `'x` are shorthand for `(quote square)`, `(quote safe-add)`, `(quote add)`, and `(quote x)`. They build symbol keys for the association-list scope. They do not look those names up.

`add` without the quote is different: it is the current value of the `add` binding. That is what exposes the primitive to evaluated code.

`add` is available while constructing `safe-add`, but not to user code unless the scope exposes it. Caller locals are not ambient capabilities either. If the caller binds `secret`, `(sandbox "secret")` still fails with `unbound_name` unless `secret` is placed in the scope. The executable fixture is [`examples/lisp/tests/sandbox_demo.toml`](examples/lisp/tests/sandbox_demo.toml).

## Lisp macros: explicit expansion, then eval

There is no `defmacro`, global macro registry, or implicit macro pass. `macroexpand` takes two arguments: code-as-data and an association list of `(symbol transformer)` pairs. The transformer receives the raw operand list and returns new code-as-data. Expansion then repeats on the result.

```thuepp
^APPLY<VPRIM<macroexpand>\|(?<code>[^;]*);(?<scope>[^;]*);\|(?<k>.*)>$ ::= BMACROEXPAND<{{code|pctdec}}|{{scope|pctdec}}|{{k}}>
^BMACROEXPAND<(?<code>$VAL)\|VLIST<(?<macros>$ITEMS)>\|(?<k>.*)>$ ::= MEXP<N|{{code}}|{{macros}}|{{k}}>
^MEXP<(?<mode>N|Q)\|VLIST<(?<head>[^;]*);(?<tail>$ITEMS)>\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MEXPHEAD<{{mode}}|{{head|pctdec}}|{{head}}|{{tail}}|{{macros}}|{{k}}>
^MEXPHEAD<N\|VSYM<(?<name>$PCT)>\|(?<head>[^|]*)\|(?<tail>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MLOOK<{{name}}|{{macros}}|{{head}};{{tail}}|{{tail}}|{{macros}}|{{k}}>
^MEXPHEAD<Q\|VSYM<unquote>\|(?<head>[^|]*)\|(?<tail>$ITEMS)\|(?<macros>$ITEMS)\|(?<k>.*)>$ ::= MEXPLIST<N|{{tail}}|{{macros}}|KMQESCAPE<{{head}}> {{k}}|>
^RET<(?<expanded>$VAL)\|KMEXPANDRESULT<(?<macros>$ITEMS)> (?<k>.*)>$ ::= MEXP<N|{{expanded}}|{{macros}}|{{k}}>
```

```lisp
(let ((macros
       (dict
         ('inc
          (fn (args)
            `(add ,(first args) 1))))))
  (macroexpand '(inc (inc x)) macros))
```

Expected output:

```text
(add (add x 1) 1)
```

To execute the expansion, pass it to `eval` with an explicit value scope. The macro scope controls expansion. The eval scope controls runtime capabilities.

```lisp
(let ((macros
       (dict
         ('inc
          (fn (args)
            `(add ,(first args) 1))))))
  (eval
    (macroexpand '(inc (inc 2)) macros)
    (dict ('add add))))
```

Expected output:

```text
4
```

This is all with humble `lhs ::= rhs` rewrite rules.

## Current reference runners

This repository has two current conformance backends:

```bash
# Python backend
uv run python python/thuepp.py <program.tpp>

# Go backend
(cd go && go run ./cmd/thuepp ../<program.tpp>)
```

The stable Python entry point is `python/thuepp.py`. Direct `./python/thuepp.py ...` commands assume dependencies are already installed or the command runs under `uv`.

JavaScript support is Go-WASM based. Files under [`demo/wasm/`](demo/wasm/) load the WASM artifact and adapt runner resources for Node, browser, and worker environments. They are adapters, not a separate JavaScript implementation.

Browser resources are callbacks: `readLines`, `readBytes`, `write`, and optional `close`. Browser and `GOOS=js/wasm` runs do not support OS subprocesses. Subprocess-style bindings fail loudly instead of emulating a shell.

## Verification

Before review, run the root check:

```bash
make test
```

`make test` runs the conformance check and shared manifest runner. The runner invokes the reference backends, checks backend parity, reports per-program rule counts, and enforces rule coverage for manifest-declared examples.

For focused debugging, pass manifest paths directly:

```bash
uv run python tools/example_runner.py examples/echo/tests/proc-input.toml
```

For Go-WASM adapter changes, also run:

```bash
make wasm-adapter-test
```

For browser demo changes, also run:

```bash
make demo-build
```

Generated README examples are checked by [`tools/check_contract.py`](tools/check_contract.py). Regenerate them with:

```bash
uv run python tools/check_contract.py --update-readme
```

## Language features

- v0.2 semantics checked by executable manifests
- ordered rewrite rules over text state
- [RE2-compatible](https://github.com/google/re2/wiki/Syntax) regex subset
- pattern aliases with `$NAME` references
- named captures and `{{group}}` templates
- operators: `::=`, `::<`, `::>`, `::-`, `::!`
- default resources: `stdin`, `stdout`, `stderr`
- runner-provided resource bindings
- source rules parse once; execution rewrites only state
- state is one string and may contain newlines
- matching scans the whole state string in multiline regex mode
- optional initial state after a final separator row `::=`
- no comment syntax: `#` is ordinary text unless the row also contains a valid operator
- `--input` replaces the source-provided initial state for CLI runners
- resource reads consume exact counted `bytes` or `lines` and PCT-encode the payload
- execution limits such as `--eval-limit` and `--max-state-bytes`
- exact rational numeric builtins; decimal-looking input parses to rationals, never floats
- string escape/unescape builtins over PCT payloads

## Rule coverage counts

Backends can write successful rule application counts:

```bash
./python/thuepp.py examples/lisp/lisp.tpp --input '(add 1 2)' --rule-coverage /tmp/lisp.coverage.tsv
(cd go && go run ./cmd/thuepp ../examples/lisp/lisp.tpp --input '(add 1 2)' --rule-coverage /tmp/lisp.go.coverage.tsv)
```

Coverage files are TSV with no header:

```text
examples/lisp/lisp.tpp:97	1
examples/lisp/lisp.tpp:156	1
```

A rule counts only after it applies. Failed eval checks, failed builtins, missing resources, and failed writes do not count.

Coverage ignores are unsupported. Every surviving rule in manifest-declared examples must be covered by fixtures. Otherwise, add a fixture or delete the rule.

## Repository layout

```text
examples/        Shared Thue++ programs and manifest tests
python/          Current Python conformance backend
go/              Current Go conformance backend and Go-WASM export package
demo/wasm/       JavaScript adapters for loading the Go-WASM module
docs/            Language contracts for builtins and typed values
tools/           Repository conformance checker and shared manifest runner
learnings/       Preserved design notes and failed attempts worth not repeating
```

## Further reading

Project docs and examples:

- [`examples/forth/README.md`](examples/forth/README.md) — compact stack-language example
- [`examples/lisp/README.md`](examples/lisp/README.md) — Lisp evaluator contract
- [`examples/lisp/tests/sandbox_demo.toml`](examples/lisp/tests/sandbox_demo.toml) — explicit-scope sandbox demo
- [`docs/rfc-language.md`](docs/rfc-language.md) — standalone Thue++ language contract
- [`docs/numeric-builtins.md`](docs/numeric-builtins.md) — exact numeric grammar and display policy
- [`docs/string-escape-builtins.md`](docs/string-escape-builtins.md) — escape/unescape contract
- [`docs/typed-values.md`](docs/typed-values.md) — readable typed value wrappers
- [`demo/wasm/README.md`](demo/wasm/README.md) — WASM adapter API

External context:

- [Semi-Thue system](https://grokipedia.com/page/Semi-Thue_system) — the string-rewrite model Thue++ starts from
- [Rewriting](https://grokipedia.com/page/Rewriting) — broader rewriting-system context
- [Axel Thue](https://mathshistory.st-andrews.ac.uk/Biographies/Thue/) — historical background from MacTutor
- [Thue esolang](https://github.com/jcolag/Thue) — John Colagioia's original language
- [RE2 syntax](https://github.com/google/re2/wiki/Syntax) — regex syntax family targeted by both backends
- [RFC 3986 percent-encoding](https://datatracker.ietf.org/doc/html/rfc3986#section-2.1) — background for PCT payloads
- [The Floating-Point Guide](https://floating-point-gui.de/) — why exact rationals avoid decimal/binary float surprises

## Installation

There is no package to install. Use this repository as a reference for the language semantics and examples.

If you want Thue++ semantics in another project, give this repository to your coding agent and ask it to port only what that project needs.

Copy-pasteable agent prompt:

```text
Implement Thue++ in this project. Use this repository as the reference. Preserve .tpp semantics, especially ordered rewrites, template captures, explicit resources, exact-rational numeric builtins with no decimal/binary floats, execution limits, and fail-loud errors. Port only what the project needs, but verify it against equivalent examples/manifests from examples/**/tests/*.toml. Do not silently degrade unsupported behavior.
```

To run this repository's current reference tooling locally:

```bash
uv run python python/thuepp.py <program.tpp>
(cd go && go run ./cmd/thuepp ../<program.tpp>)
```

Repository development requirements:

- Python 3.11+
- `uv` for Python dependencies from `pyproject.toml` / `uv.lock`
- Go for the second conformance backend
- `make` for verification targets
- Node.js only for Go-WASM adapter and browser-demo checks

## License

Thue++ is licensed under the GNU Affero General Public License v3.0 or later.

This includes the language documentation, examples, tests, tools, demo code, and reference implementations unless a file states otherwise.

See `LICENSE`.
