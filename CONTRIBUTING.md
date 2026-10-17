# Contributing

## Problems

`problems/<slug>/` is one Rosetta Code problem.

- `README.md` states the contract. Metadata is YAML frontmatter. `title` is required. The body links the Rosetta task and credits that task under the GNU Free Documentation License 1.3.
- `cases/` holds the shared inputs and expected outputs, one `NN-name.json` per case. `problem_test.go` owns the reference that those files must match, including the seeded inputs. A constant answer must fail a seeded case.
- `solutions/<ruleset>/` is one solution. `direct` is Thue++. Any other ruleset is an interpreter in `langs/<ruleset>/`. The folder holds the solution file, `metric.json`, and `README.md`.

A solution `README.md` starts with frontmatter:

```yaml
---
ruleset: direct
entry: solution.thue
author: Name <email>
---
```

The body is the approach notes. `ruleset` matches the directory. `entry` is the solution file (`solution.thue` for direct, or the script named by the language's extension). `author` is required. A `limits` key, or any limit key, fails the check. Limits are not per solution.

`langs/<ruleset>/README.md` frontmatter is `name`, `description`, and `extension`. The body is the language notes.

`make problems` builds the native Go host and runs the problem tests. `make langs` runs the language cases on native Go.

## Limits

Every solution run, on every host, uses `metrics/limits.toml`: `max_steps`, `max_evals`, `max_state_bytes`, `timeout_seconds`, and `memory_cap_bytes`. The process is under `timeout(1)` and that resident-memory cap. `hosts.toml` `timeout_scale` applies to the conformance suite, not to these runs. A solution cannot override the file.

## Languages

`langs/<language>/` holds the current interpreter and its notes. Forth, Lisp, and BASIC are interpreters in this tree. Brainfuck stays in `examples/brainfuck/`. It is an esolang demo, not a ruleset. Hello and factorial scripts live under `problems/<slug>/solutions/<ruleset>/`. `langs/<language>/cases/` keeps that language's other conformance cases, including add.

## Cost

Problem and language cost is a property of the program. Ranking and acceptance use the native Go cost. Every host reports the same number. `--counts` stays `{"applied_steps": N, "probes": N}`. `--metrics PATH` writes `cost` first, then the diagnostic counters: `applied_steps`, `regex_evals`, `regex_matches`, `state_bytes`, `state_peak`, `rule_count`, `rule_chars`. The library returns that value. `make metrics` stores each host's counters beside its time and memory. If a host differs from Go, the check names the host, the program, and the counter. Fix the host. Do not loosen the check.

`cost` is UTF-8 bytes:

```text
cost = 0
for each regex eval:   cost += len(state) + len(lhs)
for each applied step: cost += len(rhs)
```

`state` is the state at that eval. `lhs` is the rule's pattern source. `rhs` is the replacement source. A `::|` eval uses that same rule pattern. A literal-prefix miss is not an eval. An exit rule is not an applied step.

| Counter | Meaning |
| --- | --- |
| `cost` | The ranking metric above |
| `regex_evals` | Regex searches. A literal-prefix miss does not count. Diagnostic |
| `regex_matches` | Searches that find a match. Diagnostic |
| `state_bytes` | Sum of the UTF-8 state length at the start and after every applied rewrite. Diagnostic |
| `state_peak` | Maximum of those lengths. Diagnostic |
| `rule_count` | Trimmed rule rows in the `.thue` source. Aliases and comments are not rows. Diagnostic |
| `rule_chars` | UTF-8 bytes of those rows. Diagnostic |
| `applied_steps` | Applied rewrites. An exit rule does not count. Diagnostic |
| `duration_ms` | Wall clock. Recorded. Not part of cost |

Rule count and rule chars come from the `.thue` source. The Go engine counts them when it parses the file.

A solution's `metric.json` sums the Go case costs. State peak is the maximum. Rule count and rule chars are the program that ran. `commit` in that file stays when a rerun produces the same counters.

A ruleset's cost is the sum of its passing solution costs on the common problems: the problems every ruleset with at least one passing solution also passes. Coverage is how many problems that ruleset passes. The common set can change as solutions are added. The sum is the aggregate because it moves only when a cost moves.

## Acceptance

A changed solution must still pass, and its Go cost must be strictly lower than the committed `metric.json` on the base. A new ruleset folder must pass. An equal cost is not lower.

A change to an interpreter `langs/<ruleset>/*.thue` re-records that ruleset. It must still pass every problem it passed on the previous common set, and the sum of those costs must not go up.

`metrics/accept.py --base SHA` checks a clean tree. `metrics/check_solutions.py` reruns every case on every host and fails when pass or cost differs from `metric.json` or from Go.

Autoresearch prompt:

```text
Lower the Go cost of one solution. Cost is UTF-8 bytes: each regex eval adds len(state)+len(lhs), and each applied step adds len(rhs). A literal-prefix miss is not an eval. An exit rule is not an applied step. A direct entry is solution.thue. Edit problems/<slug>/solutions/<ruleset>/ and its metric.json. Run make problems or make langs, then metrics/check_solutions.py. Keep the edit only when the tests pass and the Go cost is strictly lower. Do not change the reference output. Do not put limits in the README. Limits live in metrics/limits.toml.
```

## Metrics

`make metrics` refuses a dirty work tree. It runs every solution case on every host and writes schema 4 `metrics/latest.json` as `{schema_version, commit, machine, runs}`. Each run is one program, one case, and one host, with `pass`, `cost`, the diagnostic counters, and the global limits. Pass and cost must match Go. The previous file moves to `metrics/YYYY/MM/DD/{sha}/bench.json`. Commit `latest.json` and any changed `metric.json` with the change. Schema 2 and 3 benches stay valid. A schema 4 bench without `runs` is the older problem and language record. The site reads `runs` and ignores the older keys.

## Tests

`make test` runs the static checks, the core host suite, and the guest manifests on native Go. `make test-static` includes the cost acceptance test and the metrics schema check.

`make release-check` builds the Python distributions and runs `twine check`, `npm pack --dry-run`, and `cargo publish --dry-run`. It does not publish. Pull request CI runs it. Set `RELEASE_TAG=vX.Y.Z` to also require every manifest version to equal `X.Y.Z`.

## First release

Package version `0.1.0` is the version in every manifest: `pyproject.toml`, `rust/Cargo.toml`, `js/package.json`, `editors/vscode/package.json`, `cpp/CMakeLists.txt`, `cpp/vcpkg.json`, and `cpp/conanfile.py`. Spec version stays in `SPEC_VERSION`. Nothing is published until a `vX.Y.Z` tag is pushed. The workflow is `.github/workflows/release.yml`. It does not run on pull requests, on branch pushes, or on `workflow_dispatch`.

Do these steps before `git push origin v0.1.0`. The names `thuelang` were free on PyPI, npm, and crates.io when this was written. A pending publisher does not reserve the PyPI name, so create it and tag promptly.

### PyPI trusted publisher

No PyPI token. Do not add a PyPI secret.

1. Sign in at [pypi.org](https://pypi.org/).
2. Open [Account → Publishing](https://pypi.org/manage/account/publishing/) and add a pending publisher.
3. Enter these values exactly:
   - PyPI project name: `thuelang`
   - Owner: `thuelang`
   - Repository name: `thueplusplus`
   - Workflow name: `release.yml`
   - Environment name: `pypi`
4. On GitHub, open the repository **Settings → Environments** and create an environment named `pypi`.
5. Leave required reviewers unset. A reviewer pauses the publish until someone clicks approve.
6. Leave the deployment branch rule at **No restriction**, or add a tag pattern `v*`. Do not choose **Protected branches only**. The workflow runs on the tag ref, not on `main`, and that rule skips the job.

The first successful publish creates the PyPI project and turns the pending publisher into a normal trusted publisher.

### Repository secrets

**Settings → Secrets and variables → Actions → New repository secret.** Both names are exact.

`NPM_TOKEN`

1. Sign in at [npmjs.com](https://www.npmjs.com/) with the account that will own `thuelang`.
2. Create a classic **automation** token (read and write, bypass 2FA). A granular token often cannot create a package that does not exist yet. After `thuelang` exists, you can replace this with a granular token limited to that package.
3. Store the token as `NPM_TOKEN`.

`CARGO_REGISTRY_TOKEN`

1. Sign in at [crates.io](https://crates.io/) with the account that will own `thuelang`.
2. Open [Account Settings → API Tokens](https://crates.io/settings/tokens) and create a token that can publish a new crate.
3. Store the token as `CARGO_REGISTRY_TOKEN`.

The GitHub Release uses the workflow's `GITHUB_TOKEN`. It needs no extra secret. The workflow does not publish the extension to the Marketplace or Open VSX. Those steps stay in `editors/vscode/README.md`. The `.vsix` is attached to the GitHub Release.

### Tag

On the commit that contains manifest version `0.1.0`:

```bash
git tag v0.1.0
git tag go/v0.1.0
git push origin v0.1.0
git push origin go/v0.1.0
```

`v0.1.0` runs the release workflow. `go/v0.1.0` is the module tag for `github.com/thuelang/thueplusplus/go`. Push it at the same commit so `go install github.com/thuelang/thueplusplus/go/cmd/thue@v0.1.0` resolves. The release workflow does not push it, and that tag does not publish the registries again.

A tag that is not `vX.Y.Z`, or whose `X.Y.Z` differs from the manifests, fails before any upload. PyPI, npm, and crates.io reject a second upload of the same version. If one registry succeeds and another fails, bump every manifest, tag a new `vX.Y.Z`, and do not reuse the failed version.
