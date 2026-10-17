# Languages

`langs/<language>/` holds the current interpreter, its notes, and `cases/`.

The interpreter is one `.thue` program. `cases/` holds that language's conformance manifests and the scripts for the shared Go cases: hello, add two integers, and factorial. Those shared cases are the same stdin and the same reference output for every language. The Go test measures them on the native Go host.

Forth, Lisp, and BASIC are the languages in this comparison. Brainfuck stays in `examples/brainfuck/`. It is an esolang demo, not a language in this set, and it is not on the common-case Pareto front.

`make langs` runs the shared cases. A language with more than one `.thue` program is accepted only when no program's aggregate counters are dominated.
