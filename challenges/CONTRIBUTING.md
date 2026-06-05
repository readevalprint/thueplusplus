<!-- SPDX-License-Identifier: AGPL-3.0-or-later -->
# Contributing to Thue++ Challenges

Challenges are small executable rewrite lessons. Public contributors should use GitLab.com:

```text
https://gitlab.com/thuelang/thueplusplus
```

Open merge requests targeting `develop`. GitLab calls these merge requests; `PR` is only used colloquially.

## Challenges

Use this path to add a new challenge or change an existing challenge's text/scaffold.

Directory contract:

```text
challenges/
  NN_<challenge-slug>/
    readme.md
    tests/
      <name>.json
    hint.tpp
    solutions/
      readme.md
      YYYY-MM-DD-<solution-slug>.tpp
      YYYY-MM-DD-<solution-slug>.json
```

Challenge directory names carry a two-digit order prefix plus the slug, for example `01_core-rewrite-model`.

- `readme.md` is the human/cultural artifact: front matter metadata, problem statement, monk wisdom, notes, and rendered `thue` code fences.
- `hint.tpp` is the learner scaffold auto-loaded by the playground when the attempt editor is empty. It is a plain Thue++ program with comments and optional blanks/partial rules; it must not contain solution front matter, is not ranked, and should be treated as attempt text rather than a source file path.
- `tests/*.json` are the executable behavior contract. See [Test cases](#test-cases).
- `solutions/readme.md` and `solutions/*.json` are generated leaderboard artifacts. Do not hand-edit them in ordinary challenge MRs.

Challenge MRs are normal reviewed MRs, not one-file solution submissions. They may touch challenge descriptions, hints, tests, and related docs as needed. Keep the diff focused and include verification output.

Recommended verification:

```bash
uv run python tools/challenge_generator.py --check --challenge NN_<challenge-slug>
make challenge-test
make test
```

## Test cases

Use this path if you found a bad test case, want to add coverage, or want to change challenge fixture behavior.

Challenge manifests use a top-level `cases` array. The canonical machine-readable schema lives in `challenges/test-schema.json`; the Python generator and browser import path both load that file and enforce the same keys.

All IO assertions are resource-shaped:

- Use normal `stdin`, `stdout`, and `stderr` resource names.
- `buffer` feeds an input resource.
- `expected_output` asserts `stdout` or `stderr` only.
- `stderr.expected_output` compares the raw user-visible stderr bytes from a normal non-debug run, matching the browser worker policy.
- Generator debug traces are collected in a separate metrics-only run and are never stripped out of, added to, or otherwise normalized into the stderr expectation path.
- There is no per-case `state` key; use `stdin.buffer` for case input or the `.tpp` source's own final `::=` state for a shared starting state.
- There are no per-case `args` or `timeout` keys; challenges should be reproducible through resource buffers and normal program rules.

Manifest shape:

```json
{
  "cases": [
    {
      "name": "basic",
      "resources": {
        "stdin": {
          "buffer": "input\n"
        },
        "stdout": {
          "expected_output": "expected\n"
        }
      },
      "exit_code": 0
    }
  ]
}
```

Test-case MRs are normal reviewed MRs. They are not eligible for the one-file solution auto-merge path. Include a short rationale for the fixture: what behavior it protects, why the existing cases miss it, and whether existing published solutions are expected to keep passing.

Recommended verification:

```bash
uv run python tools/challenge_generator.py --check --challenge NN_<challenge-slug>
make challenge-test
make test
```

## Solutions

Use this path if you passed a challenge and want to publish a ranked solution.

For non-maintainer solution submissions, an MR may add exactly one file:

```text
challenges/NN_<challenge-slug>/solutions/YYYY-MM-DD-<solution-slug>.tpp
```

The filename date records the submission day. The filename slug must match the solution front matter `slug`. The MR must touch nothing else. Do not include generated JSON, generated leaderboard files, challenge text, tests, tooling, CI, or site code in a ranked solution submission.

On GitLab.com, merge-request pipelines run the submission precheck for public same-project and fork MRs. Generated metrics and leaderboard files are produced by the trusted CI/build flow after merge.

### Exact solution front matter

The file must start at byte 0 with an LF-only front matter block:

```text
---
title: Café Solver 😀
slug: cafe-solver
author: José
website: https://example.com
summary: Uses a tiny state machine 😀
---
```

Allowed keys are exactly `title`, `slug`, `author`, `website`, and optional `summary`. Required keys are exactly `title`, `slug`, `author`, and `website`. Unknown keys, duplicate keys, blank lines, nested YAML values, arrays, anchors, multiline values, comments on delimiter lines, CRLF, NUL, and control/invisible characters are rejected.

Whole-file limit: at most 100,000 UTF-8 characters. The file must be valid UTF-8 and must not start with a UTF-8 BOM.

Unicode is allowed only in display metadata fields:

- `title`: max 80 Unicode code points and 240 UTF-8 bytes.
- `author`: max 80 Unicode code points and 240 UTF-8 bytes.
- `summary`: optional, max 280 Unicode code points and 1000 UTF-8 bytes.

Unicode display metadata must already be NFC-normalized. The validator does not silently normalize. Latin letters with accents and simple standalone emoji are allowed; bidi controls, zero-width characters, non-breaking spaces, ZWJ emoji sequences, private-use characters, raw HTML, and Markdown image/link syntax are rejected.

These fields remain ASCII-only:

- `slug`: max 64 characters, matching `[a-z0-9][a-z0-9-]*`, and equal to the filename slug.
- `website`: max 200 characters, `https://` URL, no credentials, whitespace, raw Unicode hostnames, or unsafe schemes.
- Thue++ body: LF plus printable ASCII only for this submission contract.

Validate a one-file solution submission diff locally with a `git diff --name-status` file:

```bash
git diff --name-status origin/develop...HEAD > /tmp/challenge-submission.diff
uv run python tools/challenge_generator.py --check-submission --diff-name-status /tmp/challenge-submission.diff
```

A ranked solution must pass every test case on the Go backend and achieve 100% rule coverage. There is no per-challenge opt-out.

## Ranking

The main leaderboard sort is deterministic:

1. fewest rules;
2. fewest successful rewrite applications;
3. lowest total evals / rule checks;
4. lowest cumulative state bytes;
5. lexical order by solution filename id.

The generator records deterministic metrics in each solution JSON and renders a short best-in-class records section in the leaderboard block.

## Generated artifacts

`solutions/*.json` files are generated by `tools/challenge_generator.py`. Each generated record is a strict display/ranking artifact with only the fields loaded by the browser metric type: challenge, rank, solution identity/path/SHA/metadata, rule count, successful rewrites, eval checks, and cumulative state bytes.

`solutions/readme.md` is the generated leaderboard page for the challenge's ranked solutions. It owns the `challenges:leaderboard` marker block.

Generator commands:

```bash
uv run python tools/challenge_generator.py --check
uv run python tools/challenge_generator.py --all
uv run python tools/challenge_generator.py --missing
```

- `--check` fails if any generated JSON or `solutions/readme.md` leaderboard block is stale.
- `--all` regenerates only files under `challenges/**`.
- `--missing` reports challenges with no qualifying ranked solution.

## Maintainer notes: GitLab.com trusted auto-merge

GitLab.com can automatically approve and merge valid public solution MRs through the trusted default-branch `submission-automerge` CI job. The merge bot is deliberately separate from MR pipelines: learner MR code runs validation only, while the approve-and-merge token is available only to protected scheduled/API/web default-branch pipelines.

Required GitLab.com CI/CD variables:

- `THUEPP_AUTOMERGE_ENABLED=1`
- `THUEPP_AUTOMERGE_TOKEN`: masked/protected project or bot token with permission to read MRs, approve MRs, and merge into `develop`

Run the trusted job from the scheduled GitLab.com pipeline, or trigger a trusted default-branch API/web pipeline after an MR pipeline succeeds. The schedule is intentionally retained as the trusted polling bridge for now: untrusted MR pipelines validate only, and the recurring protected default-branch job performs idempotent comments/approvals/merges. The script scans open MRs targeting `develop`, approves each eligible MR, then merges it. Candidates must be open, non-draft, mergeable, have a successful latest head pipeline for the MR SHA, and have a diff that is exactly one newly-added solution file matching the submission path contract. Rename, delete, modify, generated JSON, leaderboard, docs, code, and multi-file MRs are skipped.

When a one-file submission fails validation, the trusted job may post one de-duplicated comment for the failed SHA/path. That comment links to the failed job and pipeline, but it deliberately does not copy raw CI trace output into the bot-authored note; untrusted job logs stay in GitLab's job log UI. If job lookup fails, the comment falls back to pipeline/static guidance. If comment posting fails, the trusted run logs the best-effort failure and keeps processing later MRs.

The bot merge pushes to `develop`. The normal default-branch `pages` job regenerates public challenge metrics/leaderboards directly into the deployed site artifact. No trusted CI job commits generated metrics back to the repository; protected merge credentials are not exposed to untrusted code.

End-to-end public verification after the bot merges:

```bash
curl -fsSL https://thuelang.org/deploy.json | jq '{commit_sha, branch, pipeline_id, pipeline_url, job_id, job_url, source_host, project_path}'
```

The deployed `commit_sha` must match the GitLab.com bot merge commit, and the `pipeline_id`/`job_id` must match the successful Pages pipeline/job that regenerated public solution metrics into the site artifact.

## Safety

Do not run untrusted contributor solutions with write credentials. Read-only validation and trusted generation must stay separate.
