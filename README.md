> We do this not because it is easy, but because we thought it would be easy

# thue++

Start with a string and rules that rewrite it:

```text
lhs ::= rhs
```

This is the semi-Thue process, named after Axel Thue: replace substrings by rule, and repeat. It fits in one line, but it is expressive enough to be Turing complete.

Thue++, based on John Colagioia's esolang [Thue](https://github.com/jcolag/Thue), extends the idea with regex captures and templates:

```thuepp
^hello (?<name>[A-Za-z]+)$ ::= hi {{name}}
```

A rule sees text. If the pattern matches, it rewrites with the template. Then the machine starts over.

The rest of this README builds up from there: one rule, then captures, then IO, then state machines, then Lisp.

## One rule

```thuepp
^hello$ ::= world

::=
hello
```

The final separator row `::=` introduces the optional source-provided initial state. The separator itself is not part of state; all text after it is the initial state, preserving newlines. The rule rewrites `hello` to `world`.

Rules scan top to bottom; after a match, scanning restarts.

## Captures and templates

Named regex captures become template fields:

```thuepp
^hello (?<name>[A-Za-z]+)$ ::= hi {{name}}

::=
hello Ada
```

The state `hello Ada` rewrites to `hi Ada`.

## Pattern aliases

Large rule programs stay readable by naming regex fragments:

```thuepp
NAME_ALIAS <- [A-Za-z_][A-Za-z0-9_]*
^hello (?<name>$NAME_ALIAS)$ ::= hi {{name}}
```

Aliases just name regex fragments, so the rule can stay readable.

## IO, resources, and builtins

The basic operators are:

```text
::=   rewrite state
::>   write to a resource
::<   read from a resource
::-   exit with a code
::!   call a builtin
```

Predefined resources are `stdin`, `stdout`, and `stderr`. Runners can also bind names to processes, browser callbacks, or other streams.

## Hello world

Hello world writes, then exits:

<!-- thuepp-readme-example: source=examples/hello/hello.tpp expected-output=examples/hello/tests/basic.toml -->
<!-- thuepp-readme-example:start -->
Example source (`examples/hello/hello.tpp`):

```thuepp

^START$ ::= hello\ndone
hello ::> stdout Hello, World!\n
done ::- 0

::=
START
```

Run it:

```bash
./python/thuepp.py examples/hello/hello.tpp
```

Expected output:

```text
Hello, World!
```
<!-- thuepp-readme-example:end -->

The command uses the Python backend because it is convenient for local demos. It is not a language-level dependency.

## Input and processes

Line reads use `::< timeout resource`. The payload is newline-delimited and PCT-encoded before it enters state. Writes use `::> resource text`.

```thuepp
PCT <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

^START$ ::= @PROMPT@NAME<@READ@>
@PROMPT@ ::> stdout What is your name?\n
@READ@ ::< 30 stdin
^NAME<(?<name>$PCT)>$ ::> stdout hello {{name|pctdec}}!\n
START
```

Process bindings use the same resource interface. The runner binds a name to a process, and thue++ reads or writes through that name.

## Conditionals by rewriting: guess the number

There is no separate `if` syntax in core thue++. Programs encode branches into state and let ordinary ordered rules handle them. `examples/guess-number/guess-number.tpp` reads a secret number from a bound process, prompts on stdin, validates guesses before numeric builtins see them, and branches through states such as `CHECK<...|1>` and `CHECK<...|0>`.

Run it interactively with a real random-number process:

```bash
./python/thuepp.py examples/guess-number/guess-number.tpp --proc:random "python3 -c 'import random; print(random.randint(1, 10))'"
```

The deterministic fixture below scripts the random number and user guesses so it can be checked by `make test`:

<!-- thuepp-readme-example: source=examples/guess-number/guess-number.tpp source-lines=1-31 expected-output=examples/guess-number/tests/basic.toml -->
<!-- thuepp-readme-example:start -->
Example source excerpt (`examples/guess-number/guess-number.tpp`, lines 1-31):

```thuepp

NUMBER <- [0-9]+

PAYLOAD <- (?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*

@RANDOM_NUMBER@ ::< 5 random

@PROMPT@ ::> stdout Guess:\n
@USER_GUESS@ ::< 30 stdin

@INVALID_NUMBER@ ::> stdout Please enter digits only.\n
@TOO_LOW@ ::> stdout Too low.\n
@TOO_HIGH@ ::> stdout Too high.\n

@EQUAL\[(?<guess>$NUMBER),(?<secret>$NUMBER)\]@ ::! numeq guess secret
@LESS_THAN\[(?<guess>$NUMBER),(?<secret>$NUMBER)\]@ ::! lt guess secret

^SECRET<(?<secret>$NUMBER)>$ ::= @PROMPT@GUESS<{{secret}}|@USER_GUESS@>

^GUESS<(?<secret>$NUMBER)\|(?<guess>$NUMBER)>$ ::= CHECK<{{secret}}|{{guess}}|@EQUAL[{{guess}},{{secret}}]@>

^GUESS<(?<secret>$NUMBER)\|(?<bad>$PAYLOAD)>$ ::= @INVALID_NUMBER@SECRET<{{secret}}>

^CHECK<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|1>$ ::> stdout Correct!\n
^CHECK<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|0>$ ::= DIRECTION<{{secret}}|{{guess}}|@LESS_THAN[{{guess}},{{secret}}]@>

^DIRECTION<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|1>$ ::= @TOO_LOW@SECRET<{{secret}}>
^DIRECTION<(?<secret>$NUMBER)\|(?<guess>$NUMBER)\|0>$ ::= @TOO_HIGH@SECRET<{{secret}}>

::=
SECRET<@RANDOM_NUMBER@>
```

Run it:

```bash
printf 'x\n3\n8\n7\n' | ./python/thuepp.py examples/guess-number/guess-number.tpp --proc:random 'printf 7; echo'
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

The copy-on-write KV example shows state as a small transactional database. Input is a semicolon-separated command stream:

```text
begin; set KEY VALUE; get KEY; commit; discard; del KEY
```

Transactions are represented as stacked overlay frames. Writes inside a transaction touch only the top overlay. Reads scan top overlay, then parents, then base. `commit` merges the top overlay down; `discard` drops it.

```bash
uv run python python/thuepp.py examples/cow-kv/cow-kv.tpp --input 'set a base; begin; set a child; commit; get a'
```

Expected output:

```text
child
```

The point is not that thue++ is a database language. The point is that plain rewrite state can encode protocols, stacks, tombstones, lookup order, and transactional boundaries while remaining executable text.

## A language inside the language: Lisp with a sandbox.

Apparently, you can write a powerful Lisp in under 500 lines of regex.

Go check out [`examples/lisp/lisp.tpp`](examples/lisp/lisp.tpp) real quick. It is a Lisp evaluator implemented entirely as thue++ rewrite rules. The backend provides only the generic thue++ interpreter and simple math builtins; the Lisp reader, typed runtime values, lexical environments, closures, lists, association-list helpers, parse/unparse, and explicit `eval` contract live in `.tpp` rules.

```bash
uv run python python/thuepp.py examples/lisp/lisp.tpp --input '(add (mul 2 3) 4)'
```

Expected output:

```text
10
```

## Yo dawg, I heard you like lisp...

This Lisp example can parse source strings into code-as-data and evaluate them with an explicit association-list scope. This is the sandbox boundary: evaluated user code gets exactly the names supplied by the scope.

`(eval code scope)` evaluates `code` with the `scope` as the explicit environment.

This demo sandbox can take a source string, build its allowed scope internally, eval the parsed code, and return the value:

```lisp
(let ((sandbox
        (fn (source)
          (eval
            (parse source)
            (dict
              ((quote square) (fn (x) (mul x x)))
              ((quote safe-add) (fn (a b) (add a b))))))))
  (sandbox "(square 6)"))
```

That returns `36`. The same helper accepts only the API it installed:

```lisp
(sandbox "(safe-add 1 2)") ; returns 3
(sandbox "(add 1 2)")      ; fails with unbound_name
```

`add` is available while constructing `safe-add`, but it is not available to user code unless the scope exposes it. Caller locals are not ambient capabilities either: if the caller binds `secret`, `(sandbox "secret")` still fails with `unbound_name` unless `secret` is placed in the scope.

The executable fixture is `examples/lisp/tests/sandbox_demo.toml`.

This is all with humble `lhs ::= rhs` rewrite rules.

## Current reference runners

Python and Go are current conformance backends. Use whichever is convenient for local runs:

```bash
# Python backend
uv run python python/thuepp.py <program.tpp>

# Go backend
(cd go && go run ./cmd/thuepp ../<program.tpp>)
```

The stable Python entry point remains `python/thuepp.py`. Direct `./python/thuepp.py ...` examples assume dependencies have already been installed or the command is running under `uv`.

JavaScript support is currently Go-WASM based. The JavaScript files under `js/wasm/` load the WASM artifact and adapt runner resources for Node, browser, and worker environments; they are not a separate JavaScript implementation of the language. Browser resources are callbacks (`readLine`, `write`, and optional `close`). Browser and `GOOS=js/wasm` runs do not support OS subprocesses; attempts to bind subprocess-style resources fail loudly instead of emulating shell processes.

## Verification

Use the repository-root truth-engine command before sending changes for review:

```bash
make test
```

`make test` runs the repository conformance check and the shared manifest truth engine. The manifest runner invokes the current reference backends as external commands (`uv run python python/thuepp.py` and a freshly built Go binary), checks backend parity, exposes per-program rule match counts, and enforces rule coverage for all manifest-declared example programs.

For focused debugging, pass explicit manifest paths directly to the runner:

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

Generated README examples are checked by `tools/check_contract.py`. Maintainers can regenerate them with:

```bash
uv run python tools/check_contract.py --update-readme
```

## Language features

- v0.2 semantics checked by shared executable manifests
- ordered rewrite rules over text state
- RE2-compatible regex subset for portable implementations
- pattern aliases with `$NAME` references
- named captures and `{{group}}` templates
- operators: `::=` rewrite, `::<` read, `::>` write, `::-` exit, `::!` builtin
- predefined resources: `stdin`, `stdout`, `stderr`
- runner-provided process/resource bindings
- source rules are parsed once; execution rewrites only the mutable state string
- state is one string and may contain newlines; matching scans the whole state string in multiline regex mode
- source-provided initial state is an optional final section: a final separator row `::=` makes all following text the initial state; without that separator the initial state is empty
- `#` has no special language meaning: a source row is a rule only when it contains a valid operator, and runtime state text beginning with `#` is ordinary matchable text
- `--input` replaces the entire source-provided state string for runners that expose the CLI contract
- resource reads: `::< {timeout} name` reads one newline-delimited message and PCT-encodes the payload; timeout must be positive
- execution limits such as `--max-evals` and `--max-state-bytes`
- exact rational numeric builtins, not floating-point approximation
- generic string escape/unescape builtins over PCT payloads

## Rule coverage counts

Backends can write successful rule application counts:

```bash
./python/thuepp.py examples/lisp/lisp.tpp --input '(add 1 2)' --rule-coverage /tmp/lisp.coverage.tsv
(cd go && go run ./cmd/thuepp ../examples/lisp/lisp.tpp --input '(add 1 2)' --rule-coverage /tmp/lisp.go.coverage.tsv)
```

Coverage files are minimal TSV, one applied rule per row, with no header:

```text
examples/lisp/lisp.tpp:97	1
examples/lisp/lisp.tpp:156	1
```

Rules are counted only after a rule successfully applies. Failed probes, failed builtins, missing resources, and failed writes do not count. Coverage ignores are intentionally unsupported. Every surviving rule in manifest-declared examples must be covered by shared fixtures; otherwise add a fixture or delete the rule.

## Repository layout

```text
examples/        Shared thue++ programs and manifest tests
python/          Current Python conformance backend
go/              Current Go conformance backend and Go-WASM export package
js/wasm/         JavaScript adapters for loading the Go-WASM module
docs/            Language contracts for builtins and typed values
tools/           Repository conformance checker and shared manifest runner
learnings/       Preserved design notes and failed attempts worth not repeating
```

## Further reading

- `examples/forth/README.md` — compact stack-language example
- `examples/lisp/README.md` — Lisp evaluator contract
- `examples/lisp/tests/sandbox_demo.toml` — explicit-scope sandbox demo
- `docs/rfc-language.md` — standalone thue++ language contract
- `docs/numeric-builtins.md` — exact numeric grammar and display policy
- `docs/string-escape-builtins.md` — escape/unescape contract
- `docs/typed-values.md` — readable typed value wrappers
- `js/wasm/README.md` — WASM adapter API

## Installation

There is no package to install. The intended installation path is transposition: give this repository to your coding agent, pick the target language/runtime you need, and ask it to implement thue++ semantics in your project against these examples.

Copy-pasteable agent prompt:

```text
Implement thue++ in this project. Use this repository as the reference. Preserve .tpp semantics, especially ordered rewrites, template captures, explicit resources, builtins, execution limits, and fail-loud errors. Port only what the project needs, but verify it against equivalent examples/manifests from examples/**/tests/*.toml. Do not silently degrade unsupported behavior.
```

If you want to run this repository's current reference tooling locally:

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
