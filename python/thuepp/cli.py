"""Command-line host. It uses only the public interpreter API."""

import argparse
import json
import sys
from pathlib import Path

from thuepp import LimitExceeded, ThueppInterpreter
from thuepp.interpreter import format_trace


class _Unset:
    pass


UNSET = _Unset()


def parse_limit(text: str):
    if text == "unlimited":
        return None
    digits = text[1:] if text.startswith("-") else text
    if digits and digits.isascii() and digits.isdigit():
        return int(text)
    print(f'strconv.Atoi: parsing "{text}": invalid syntax', file=sys.stderr)
    raise SystemExit(2)


def _write_counts(path: str, applied_steps: int, probes: int) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = {"applied_steps": applied_steps, "probes": probes}
    target.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")


def _write_metrics(path: str, metrics) -> None:
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "cost": metrics.cost,
        "applied_steps": metrics.applied_steps,
        "regex_evals": metrics.regex_evals,
        "regex_matches": metrics.regex_matches,
        "state_bytes": metrics.state_bytes,
        "state_peak": metrics.state_peak,
        "rule_count": metrics.rule_count,
        "rule_chars": metrics.rule_chars,
    }
    target.write_text(json.dumps(payload, separators=(",", ":")) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(
        description="thue++ interpreter",
        usage="thuepp <program> [--proc:<name> <command>]... [--input <state>] [options]",
    )
    parser.add_argument("program", help="Path to the thue++ program")
    parser.add_argument(
        "--max-evals",
        type=parse_limit,
        default=UNSET,
        help=(
            "Maximum evaluation steps before aborting "
            "(each rule inspected in the inner loop counts as one step, including non-matching rules). "
            "Omit for the default. 'unlimited' clears it."
        ),
    )
    parser.add_argument(
        "--max-state-bytes",
        type=parse_limit,
        default=UNSET,
        help="Maximum state size in bytes before aborting. Omit for the default. 'unlimited' clears it.",
    )
    parser.add_argument(
        "--max-steps",
        type=parse_limit,
        default=UNSET,
        help="Maximum applied rewrites. Omit for the default. 'unlimited' clears it. 0 applies nothing.",
    )
    parser.add_argument("--input", type=str, help="Override initial state with this value")
    parser.add_argument("--debug", action="store_true", help="Enable debug logging of rule evaluation")
    parser.add_argument(
        "--trace",
        action="store_true",
        help="Write one JSON object per trace event to stderr, before any Error line",
    )
    parser.add_argument(
        "--rule-coverage",
        type=str,
        help="Write successful rule application counts as TSV to this path",
    )
    parser.add_argument(
        "--list-rules",
        action="store_true",
        help="List compiled rule source IDs and source text as TSV, then exit",
    )
    parser.add_argument(
        "--counts",
        type=str,
        help='After a run, write {"applied_steps": N, "probes": N} JSON to this path',
    )
    parser.add_argument(
        "--metrics",
        type=str,
        help=(
            "After a run, write cost, applied_steps, regex_evals, regex_matches, "
            "state_bytes, state_peak, rule_count, and rule_chars JSON to this path"
        ),
    )
    args, remaining = parser.parse_known_args()

    limits = {}
    if args.max_evals is not UNSET:
        limits["max_evals"] = args.max_evals
    if args.max_state_bytes is not UNSET:
        limits["max_state_bytes"] = args.max_state_bytes
    if args.max_steps is not UNSET:
        limits["max_steps"] = args.max_steps
    interpreter = ThueppInterpreter(
        debug=args.debug,
        trace_enabled=args.trace,
        rule_coverage_path=args.rule_coverage,
        **limits,
    )

    index = 0
    while index < len(remaining):
        arg = remaining[index]
        if arg.startswith("--proc:"):
            name = arg[len("--proc:") :]
            if index + 1 >= len(remaining):
                print(f"Error: --proc:{name} requires a command argument", file=sys.stderr)
                sys.exit(1)
            interpreter.add_proc_binding(name, remaining[index + 1])
            index += 2
        else:
            print(f"Error: Unknown argument: {arg}", file=sys.stderr)
            sys.exit(1)

    exit_code = 0
    ran = False
    error_message = None
    interrupted = False
    try:
        interpreter.load_program(args.program)
        if args.list_rules:
            for rule in interpreter.rules:
                source = Path(rule.source_path)
                try:
                    display = source.resolve().relative_to(Path.cwd().resolve()).as_posix()
                except ValueError:
                    display = source.resolve().as_posix()
                print(f"{display}:{rule.line_number}\t{rule.lhs}")
        else:
            if args.input is not None:
                interpreter.apply_input_override(args.input)
            ran = True
            exit_code = interpreter.run()
    except LimitExceeded as exc:
        error_message = str(exc)
        exit_code = exc.code
    except RuntimeError as exc:
        error_message = str(exc)
        exit_code = 1
    except KeyboardInterrupt:
        interrupted = True
        exit_code = 130
    finally:
        coverage_error = None
        counts_error = None
        metrics_error = None
        try:
            interpreter.write_rule_coverage()
        except OSError as exc:
            coverage_error = exc
        if ran and args.counts:
            try:
                _write_counts(args.counts, interpreter.applied_steps, interpreter.eval_count)
            except OSError as exc:
                counts_error = exc
        if ran and args.metrics:
            try:
                _write_metrics(args.metrics, interpreter.metrics())
            except OSError as exc:
                metrics_error = exc
        interpreter.cleanup()

    if args.trace:
        sys.stderr.write(format_trace(interpreter.trace))
    if error_message is not None:
        print(f"Error: {error_message}", file=sys.stderr)
    if interrupted:
        print("\nInterrupted", file=sys.stderr)
    if coverage_error is not None:
        print(f"Error: failed to write rule coverage: {coverage_error}", file=sys.stderr)
        exit_code = 1
    if counts_error is not None:
        print(f"Error: failed to write counts: {counts_error}", file=sys.stderr)
        exit_code = 1
    if metrics_error is not None:
        print(f"Error: failed to write metrics: {metrics_error}", file=sys.stderr)
        exit_code = 1
    sys.exit(exit_code)
