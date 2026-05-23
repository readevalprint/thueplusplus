# Scheme R5RS conformance manifests

This directory is the R5RS debt gate. It is intentionally outside the default `examples/**/tests/*.toml` sweep because the cases here describe required R5RS behavior that the current scaffold must not pretend to support yet.

The gate is still shared-runner based:

```bash
uv run python tools/scheme_conformance.py
```

`tools/scheme_conformance.py` validates each `*-red.toml` file with `tools/example_runner.py`'s manifest schema, then runs every RED case through the shared runner's external-command case path with Python/Go parity. A RED case must fail today. If it starts passing, the gate fails and the case must be promoted into an executable green manifest under `examples/scheme/tests/` or deleted if superseded by a broader green fixture.

Rules:

- Keep manifests pure shared-runner TOML: top-level `program`, shared `args`, and `[[case]]` tables with ordinary `[case.expect]` expectations.
- Do not add per-case `program`, opt-outs, host-eval snippets, or implementation-specific metadata.
- RED expectations should state the intended R5RS result or typed error, not the current scaffold's broken output.
- RED cases should be adversarial and accretive: they should expose a real architecture gap, conformance requirement, or deletion-first cleanup target.
- When an implementation card turns a RED case green, promote it to `examples/scheme/tests/<topic>.toml`, keep Python/Go parity and rule coverage, then remove it from this directory.
