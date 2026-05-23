# C example contract

`examples/c/c.tpp` is the full-C workstream for this repository. The target end state is a C implementation written in Thue++ rewrite rules, with Python and Go providing only the generic Thue++ interpreter, resources, and builtins.

This is not a C-ish command language. The implementation is expected to grow as a real language pipeline:

1. preprocessing-token lexer;
2. preprocessor;
3. parser and AST construction;
4. semantic analysis and type construction;
5. lvalue/rvalue and abstract memory model;
6. statement/function execution;
7. translation-unit/linkage handling;
8. freestanding or documented hosted-library boundary;
9. conformance manifests, documentation sync, full rule coverage, and pipeline merge gate.

The current file contains an intentionally narrow raw-source smoke that now enters the shared lexer and then continues through public parser/sema rules with a narrow continuation, plus public lexer, parser/AST, semantic/type-analysis, execution/memory, preprocessing/linkage, and library-boundary states. Remaining coverage-only probes are quarantined behind the explicit `fixture:` entry so public-looking `exec:`, `pp:`, and `lib:` inputs cannot be mistaken for implemented C semantics.

## Running the scaffold

From the repository root:

```bash
uv run python python/thuepp.py examples/c/c.tpp --input 'int main(void) { return 0; }'
```

Expected output:

```text
0
```

The scaffold also accepts the empty-parameter spelling:

```bash
uv run python python/thuepp.py examples/c/c.tpp --input 'int main() { return 42; }'
```

Expected output:

```text
42
```

The source-driven slice also accepts one declaration-only local `int` before an
integer return and still flows through the lexer/parser/sema/exec pipeline:

```bash
uv run python python/thuepp.py examples/c/c.tpp --input 'int main(void) { int x; return 5; }'
```

Expected output:

```text
5
```

It also accepts one initialized local `int` followed by returning that same
local identifier:

```bash
uv run python python/thuepp.py examples/c/c.tpp --input 'int main(void) { int x = 7; return x; }'
```

Expected output:

```text
7
```

Any C construct outside this scaffold fails loudly. The raw smoke accepts only integer constants (`ICON`: decimal or hexadecimal), not fractions or decimals. The local-declaration slice accepts `int <identifier>;` before an integer return and `int <identifier> = <ICON>; return <same-identifier>;`; multiple declarations, declaration-then-assignment, non-constant initializers, and returning a different local name are not yet source-driven. Supported raw source reaches output through the lexer-backed public parser/sema/exec pipeline rather than a direct raw-source success rule. Downstream cards must extend the staged C pipeline described below, not widen raw regex over source text.


The raw `int main` smoke is source-driven: supported source first tokenizes through the shared lexer, then flows through the public `PARSE_TU` / `PARSE_RETURN_FN` / `PARSE_EXPR` parser and `SEMA` rules using a narrow `@@CPIPE` continuation, and finally the normal `EXEC` state. `CPIPE_TOKENS` is now only a lexer-to-parser routing adapter for this narrow slice; the duplicate `CPIPE_AST`/`CPIPE_TAST` parser/sema bridge has been deleted.

## Running the lexer

The lexer entry point is `lex:<source>`. It prints preprocessing tokens as a semicolon-delimited stream:

```bash
uv run python python/thuepp.py examples/c/c.tpp --input 'lex:int main(void) { return 42; }'
```

Expected output:

```text
KW<int>;ID<main>;PUNC<%28>;KW<void>;PUNC<%29>;PUNC<%7B>;KW<return>;ICON<42>;PUNC<%3B>;PUNC<%7D>;EOF<>;
```

Token kinds currently emitted by the lexer are `KW`, `ID`, `ICON`, `STR`, `CHAR`, `PUNC`, and `EOF`. Every token payload is percent-encoded and the raw `;` record separator is outside the payload alphabet, so downstream parser rules do not have to trust raw user source text.

## Running the parser

The parser entry points consume lexer token streams:

```bash
uv run python python/thuepp.py examples/c/c.tpp --input 'parse:KW<int>;ID<main>;PUNC<%28>;KW<void>;PUNC<%29>;PUNC<%7B>;KW<return>;ICON<42>;PUNC<%3B>;PUNC<%7D>;EOF<>;'
```

Expected output:

```text
TU<FN<RET<int>|NAME<main>|PARAMS<void>|BODY<RETURN<ICON<42>>>>
```

Expression parser entry:

```bash
uv run python python/thuepp.py examples/c/c.tpp --input 'parse-expr:ID<a>;PUNC<%2B>;ID<b>;PUNC<%2A>;ICON<3>;EOF<>;'
```

Expected output:

```text
ADD<ID<a>;|MUL<ID<b>;|ICON<3>;>>
```

The phase-2 AST contract is deliberately framed text for later rewrite phases: `TU`, `FN`, `DECL`, `TYPEDEF`, `RETURN`, `IF`, `WHILE`, `FOR`, `ASSIGN`, `ADD`, `MUL`, `EQ`, `LT`, `CALL`, and primary nodes preserve token payloads without decoding arbitrary source text.

## Running semantic analysis

The semantic analyzer consumes framed AST records and emits typed AST records:

```bash
uv run python python/thuepp.py examples/c/c.tpp --input 'sema:TU<DECL<VAR<int|x>>>'
```

Expected output:

```text
TU<SCOPE<file|BIND<x|object|int>>|DECL<LVAL<int|x>>>
```

Semantic output introduces explicit `SCOPE`, `BIND`, `TYPE`, `LVAL`, and `RVAL` records. It keeps C namespaces explicit by distinguishing ordinary object/function bindings, typedef bindings, and tag bindings.

## Running execution / abstract memory

The execution entry point consumes typed AST / machine records:

```bash
uv run python python/thuepp.py examples/c/c.tpp --input 'exec:ASSIGN<LVAL<int|x>|RVAL<int|7>>'
```

Expected output:

```text
STATE<MEM<OBJ<x|int|7|auto>>>
```

Executable `main`-style typed AST records print their integer return value to stdout, preserving the early scaffold result contract. Non-final memory probes render explicit `STATE`, `OBJ`, `PTR`, `LVAL`, `RVAL`, and `CTRL` records so downstream manifests can assert abstract-machine state without host-side C helpers.

## Target standard and mode

The workstream target is ISO C, progressing toward C17 semantics. The first complete milestone should be freestanding C. Hosted-library behavior is a later, explicitly documented boundary.

Initial exclusions unless a later GLKB card explicitly changes them:

- GNU/Clang/MSVC extensions;
- inline assembly;
- implementation-specific pragmas;
- threads and atomics before the core abstract machine is stable;
- floating point before integer, pointer, aggregate, and call semantics are covered;
- silent fallback for unsupported syntax.

Unsupported input must produce typed diagnostics rather than being ignored, accepted as partial C, or left as a no-match success.

## Execution contract

The mature implementation should model C as a translation unit with an explicit abstract machine:

- `main` is the entry point for executable manifests.
- `return` from `main` is the program result. During the early scaffold this result is printed to stdout to keep manifest expectations simple. A later integration card may document and migrate to dynamic exit-code behavior if the interpreter substrate supports it cleanly.
- stdout-producing library functions such as `putchar`, `puts`, or a documented `printf` subset belong to the library-boundary phase.
- Undefined or unsupported behavior must be documented and fail loudly in manifests until a specific semantic choice is implemented.

## Required internal architecture

Full C support must not be implemented as direct regex matching over raw C source. The sustainable architecture is:

```text
SOURCE
  -> preprocessing tokens
  -> preprocessor token stream
  -> AST
  -> typed AST / symbols
  -> abstract machine state
  -> stdout/stderr/result
```

Recommended internal families include:

```text
TOK<kind|payload>
AST<id|kind|fields>
TYPE<...>
SCOPE<...>
BIND<name|kind|type|addr-or-value>
LVAL<addr|type>
RVAL<type|value>
OBJ<addr|type|storage|lifetime>
PTR<addr|offset|type>
FRAME<...>
K<...>
ERR<typed_error>
```

Arbitrary source text, identifiers, string/char payloads, and nested AST fields must be safely framed, preferably using percent-encoding or another explicit length/value representation. Do not separate arbitrary source payloads with raw delimiters that can appear in user code.

## Feature roadmap

### Phase 0: scaffold

Implemented now:

- `int main(void) { return <number>; }`
- `int main() { return <number>; }`
- `int main(void) { int <identifier>; return <number>; }`
- `int main() { int <identifier>; return <number>; }`
- `int main(void) { int <identifier> = <number>; return <same-identifier>; }`
- `int main() { int <identifier> = <number>; return <same-identifier>; }`
- typed diagnostics for empty input, preprocessor input, and unsupported C constructs.

### Phase 1: preprocessing-token lexer

Implemented now:

- insignificant whitespace, line comments, and block comments are skipped;
- identifiers and the C keyword set are tokenized separately, including keyword tokens that appear immediately before EOF;
- decimal and hexadecimal integer constants are tokenized as `ICON`;
- string and char literals are tokenized with safely encoded payloads;
- one-, two-, and three-character C punctuators/operators are tokenized as `PUNC`;
- every successful lex emits an explicit `EOF<>;` marker;
- unterminated comments, unterminated strings/chars, invalid `\\q` escapes, and unknown source characters fail loudly.

Required coverage:

- whitespace and comments;
- identifiers and keywords;
- integer constants;
- string literals and char literals;
- all C punctuators/operators needed by later parser phases;
- EOF marker;
- fail-loud unterminated comments/strings, invalid escapes, and invalid tokens.

### Phase 2: parser and AST

Implemented now:

- `parse:<token-stream>` parses tokenized translation units into framed AST records;
- `parse-expr:<token-stream>` parses expression token streams for expression-focused tests;
- function definitions support `int` return type, `void` or empty parameter lists, single `int` parameters, local `int` declarations, and `return` statements;
- source-driven `main` definitions support a single declaration-only local `int` before an integer return, plus a single initialized local `int` before returning that same local identifier;
- declarations support plain `int x;` and an explicit typedef-name ambiguity case `typedef int T; T x;`;
- statement shells cover `if/else`, `while`, and `for` forms needed by later semantic/execution work;
- expression parsing covers assignment, equality, relational comparison, additive/multiplicative precedence, calls, and primary identifiers/constants/string/char literals;
- malformed token streams fail loudly with `syntax_error`.

Required coverage:

- expression precedence and associativity;
- declarations, declarators, and function definitions;
- compound statements and control-flow statements;
- translation-unit structure;
- typed syntax errors.

Use parser states over token streams. Do not grow a rule per C surface spelling.

### Phase 3: semantic analysis and types

Implemented now:

- `sema:<AST>` consumes framed parser output or equivalent AST fixtures;
- file-scope bindings distinguish objects, functions, typedef names, and tags;
- scalar `int`, pointer, array, function, struct, union, enum, and typedef-name type records are represented explicitly;
- declarations produce `LVAL<type|name>` records while expression values produce `RVAL<type|value-or-load>` records;
- assignment and arithmetic examples annotate lvalue/rvalue boundaries and integer conversions;
- fail-loud diagnostics cover duplicate/invalid declarations, undefined identifiers including identifier returns hidden inside function ASTs, type errors, invalid lvalues, unsupported constructs, and malformed AST.

Required coverage:

- scalar types;
- pointers and arrays;
- functions and prototypes;
- structs, unions, and enums;
- typedef names;
- block/file scopes and C namespaces;
- conversions and compatibility checks;
- lvalue/rvalue classification.

### Phase 4: abstract memory and execution

Implemented now:

- `exec:<typed-AST-or-machine-form>` consumes semantic output / machine records;
- object storage records include object name, type, value, and automatic lifetime;
- assignment through lvalues mutates explicit memory records;
- address-of, dereference, array decay, and aggregate field selection produce pointer/lvalue records;
- `if`, `while`, `for`, `break`, `continue`, and compound block records establish control-flow contracts;
- typed `main` return records print the integer return value to stdout only when the surrounding typed-AST frame is exact and the function binding/name agree;
- malformed function-shaped frames with garbage prefixes or junk `RETURN` substrings fail loudly instead of executing a valid-looking substring;
- fail-loud diagnostics cover division by zero, invalid lvalue assignment, and unsupported machine forms.

Required coverage:

- object storage and lifetimes;
- addresses, pointers, offsets, dereference, address-of, pointer arithmetic;
- array decay;
- assignment through lvalues;
- control flow: if/else, while, do/while, for, break, continue, return;
- functions, parameters, recursion, and call frames;
- aggregate field access with `.` and `->`.

### Phase 5: preprocessor, linkage, and library boundary

Implemented now:

- object-like macro fixtures compare the defined and used macro name exactly before expansion;
- conditional preprocessing fixtures use explicit `DEFINED<name>` / `UNDEFINED<name>` state records for `IFDEF` and `IFNDEF` branch selection;
- mismatched object macro use fails loudly with `undefined_identifier` instead of expanding a different macro's body;
- include, stringify, token paste, predefined line, linkage, and minimal library-boundary records remain explicit framed contracts;
- coverage-only function-like macro, hard-coded recursive-call, and one-integer printf probes are quarantined behind `fixture:` and are not advertised as `pp:`, `exec:`, or `lib:` semantics.

Required coverage:

- object-like and function-like macros;
- `#define`, `#undef`, conditionals, and include contract;
- stringification and token paste;
- predefined macro decisions;
- file-scope declarations, linkage, tentative definitions, and global initialization;
- documented freestanding/hosted library surface.

### Phase 6: conformance and closeout

Required coverage:

- executable TOML manifests for every accepted feature;
- fail-loud diagnostic cases;
- Python/Go parity;
- full rule coverage for `examples/c/c.tpp`;
- documentation synchronized with executable fixtures where examples are shown;
- full repository pipeline passing;
- all GLKB child MRs merged before the umbrella closes.

## Error behavior

Diagnostics are stable stderr strings with exit code 2 for language-level failures. Current diagnostics:

- `empty_translation_unit`
- `unsupported_c_construct`
- `invalid_token`
- `unterminated_comment`
- `unterminated_string`
- `unterminated_char`
- `invalid_escape`
- `syntax_error`
- `invalid_declaration`
- `undefined_identifier`
- `type_error`
- `invalid_lvalue`
- `division_by_zero`

## Validation

Focused scaffold validation:

```bash
uv run python tools/example_runner.py examples/c/tests/scaffold.toml
```

Focused lexer validation:

```bash
uv run python tools/example_runner.py examples/c/tests/lexer.toml
```

Focused parser validation:

```bash
uv run python tools/example_runner.py examples/c/tests/parser.toml
```

Focused semantic/type validation:

```bash
uv run python tools/example_runner.py examples/c/tests/sema.toml
```

Focused execution/memory validation:

```bash
uv run python tools/example_runner.py examples/c/tests/execution.toml
```

Focused preprocessing/linkage/library validation:

```bash
uv run python tools/example_runner.py examples/c/tests/preprocessor_linkage.toml
```

Release/conformance validation for the current C workstream:

```bash
uv run python tools/example_runner.py examples/c/tests/conformance.toml
```

The conformance manifest is the checklist gate for this example. It is expected to maintain Python/Go parity and 100% rule coverage for `examples/c/c.tpp`.

## Running preprocessing, linkage, and library fixtures

Phase 5 adds three explicit entry points:

- `pp:<form>` for preprocessing fixture records;
- `link:<form>` for translation-unit linkage records;
- `lib:<form>` for the minimal library boundary used by examples.

Example:

```bash
uv run python python/thuepp.py examples/c/c.tpp --input 'pp:DEFINE<N|ICON<7>;>|USE<N>'
```

Expected output:

```text
TOKENS<ICON<7>;>
```

Implemented coverage includes object-like macro expansion, `#undef`, `#ifdef`/`#ifndef`, includes, stringify, token paste, `__LINE__`, external/internal/tentative linkage, and `putchar`/`puts` boundary records. Coverage-only function-like macro, hard-coded call, and single-integer printf probes use `fixture:<form>`; stale public forms such as `pp:FNADD1<...>`, `exec:CALL<fact|...>`, and `lib:printf1|...` fail loudly.

## Completion checklist

Before marking the C workstream complete:

- `uv run python tools/example_runner.py examples/c/tests/conformance.toml` passes;
- `uv run python tools/example_runner.py` passes;
- `uv run python tools/check_contract.py` passes;
- `make test` passes;
- `git diff --check` passes;
- the C example reports 100% rule coverage for both Python and Go;
- the merge request pipeline and post-merge target-branch pipeline both pass.

Full repository validation before any C MR is marked review-ready/done:

```bash
uv run python tools/example_runner.py
uv run python tools/check_contract.py
make test
git diff --check
```

Every downstream card must use a dedicated worktree named like `../thuepp-glkb-<iid>-<slug>` and must include validation and merge evidence in its GLKB completion note.
