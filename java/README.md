# thuelang

Java host for Thue++ v0.5. The Gradle package is `org.thuelang:thuelang`. The CLI binary is `thue`.

Package version `0.1.0` matches the other manifests. This repository does not publish the package to Maven Central.

## Library

JDK 21.

```java
import org.thuelang.thuelang.Interpreter;

Interpreter interp = new Interpreter();
interp.loadProgram("hello.thue");
int code = interp.run();
```

`new Interpreter()` binds only `stdin`, `stdout`, and `stderr`. It starts with the default limits: 1000000 evals, 8388608 state bytes, and 1000000 applied steps. `setMaxEvals(null)`, `setMaxStateBytes(null)`, and `setMaxSteps(null)` clear one limit. `0` is a limit of zero. `addProcBinding` is the only process opt-in.

`run` returns the exit code for quiescence and for `::-`. A limit stop throws `LimitException`. `kind()` is `steps` (10), `evals` (11), `state` (12), or `timeout` (13). Any other failure throws `ThueException` and the CLI exits 1. An invalid `::-` code returns 1 and does not throw.

Do not call `run` without an explicit step limit, probe limit, and state limit. The CLI and the conformance runner also put an OS `timeout(1)` and a resident-memory cap around the process.

From a consumer build, include this project:

```kotlin
includeBuild("/path/to/thueplusplus/java")
```

```kotlin
dependencies {
    implementation("org.thuelang:thuelang")
}
```

## CLI

```text
thue <program.thue> [flags...]
```

| Flag | Effect |
| --- | --- |
| `--input TEXT` | Replace the initial state. |
| `--max-evals N` | Probe limit. Default `1000000`. `unlimited` clears it. |
| `--max-state-bytes N` | State UTF-8 byte limit. Default `8388608`. |
| `--max-steps N` | Applied-rewrite limit. Default `1000000`. |
| `--debug` | Diagnostic lines on stderr. Manifests do not compare them. |
| `--trace` | One JSON object per trace event on stderr, before any `Error:` line. |
| `--proc:NAME COMMAND` | Bind `NAME` to a process. The next argument is the command. |
| `--resources PATH` | Replace the bindings with one scripted resource set. |
| `--resource-out PATH` | JSON object of recorded writes. Requires `--resources`. |
| `--rule-coverage PATH` | TSV `source.thue:line<TAB>count`, sorted. |
| `--counts PATH` | `{"applied_steps":N,"probes":N}` after a run. Not written for `--list-rules`. |
| `--metrics PATH` | The shared counters JSON. `Interpreter.metrics()` returns the same value. Not written for `--list-rules`. |
| `--list-rules` | TSV `source.thue:line<TAB>lhs`. Does not run. |

`--flag VALUE` and `--flag=value` both work. No arguments exits 2. An unknown argument exits 1 with `Error: Unknown argument: ...`. A non-integer limit exits 2 and prints the Go `strconv.Atoi` message with no `Error:` prefix. A missing program exits 1 with `Error: File not found: <absolute path>`.

| Code | Stop |
| --- | --- |
| 0 | Quiescence or `::-` |
| 1 | Other runtime error |
| 2 | CLI usage |
| 10 | `Applied step limit (N) exceeded` |
| 11 | `Evaluation step limit (N) exceeded` |
| 12 | `State size (N bytes) exceeds maximum (M bytes)` |
| 13 | `ERR:resource:NAME:timeout` |

Trace keys, in order, with no extra whitespace: `step`, `ruleIndex`, `lineNumber`, `operator`, `matchStart`, `matchEnd`, `error`, `stateBefore`, `replacement`, `stateAfter`, `exitCode`.

## Regex

Patterns use [re2j](https://github.com/google/re2j) 1.8, the Java port of the RE2 syntax the spec asks for. A literal `{` that is not a quantifier is compiled as `\{`, because re2j otherwise rejects a literal brace immediately before a quantifier. `{{`, `{{2}}`, and `a{2}` match the other hosts.

`(?P<name>...)` and `(?<name>...)` both work. Each pattern is compiled with a `(?m)` prefix.

## Build

From the repository root:

```bash
./java/gradlew -p java --no-daemon installDist
./java/build/install/thue/bin/thue program.thue
```

The start script is `thue`. It needs a JDK 21 `java` on `PATH`.

## Conformance

From the repository root, after the install above:

```bash
uv run python tools/example_runner.py --impl java=./java/build/install/thue/bin/thue --tier core --only java --only go --only python
```

`make test-core HOST=java` builds the script and runs the core tier. `make test-full` includes this host in the parity set.
