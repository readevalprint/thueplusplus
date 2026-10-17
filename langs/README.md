# Languages

`langs/<language>/` holds the current interpreter, its notes, and `cases/`.

The interpreter is one `.tpp` program. `cases/` holds that language's conformance manifests and the scripts for the shared Go cases: hello, add two integers, and factorial. Those shared cases are the same stdin and the same reference output for every language. The Go test measures them on the native Go host.

Forth, Lisp, and BASIC are the languages in this comparison. Brainfuck stays in `examples/brainfuck/`. It is an esolang demo, not a language in this set.

`make langs` runs the shared cases. A language with more than one `.tpp` program keeps a file only when that file passes and its Go cost is strictly lower than every other passing program in the directory.
