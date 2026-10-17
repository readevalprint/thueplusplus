//! Thue++ interpreter.
//!
//! A new [`Interpreter`] binds only `stdin`, `stdout`, and `stderr`, and it
//! starts with the v0.5 limits: 1_000_000 applied steps, 1_000_000 rule probes,
//! and 8 MiB of state. `None` clears a limit. `Some(0)` is a real limit of zero.
//! Process resources exist only after [`Interpreter::add_proc_binding`].

mod builtin;
mod interpreter;
mod limits;
mod pattern;
mod prefix;
mod resource;
mod template;

pub use interpreter::{
    display_path, format_trace, Error, Interpreter, LimitError, LimitKind, ListedRule, RunFailure,
    RunMetrics, TraceEvent, DEFAULT_MAX_EVALS, DEFAULT_MAX_STATE_BYTES, DEFAULT_MAX_STEPS,
    EXIT_EVAL_LIMIT, EXIT_READ_TIMEOUT, EXIT_RUNTIME, EXIT_STATE_LIMIT, EXIT_STEP_LIMIT,
};
pub use limits::{parse_atoi, parse_limit};
pub use pattern::Operator;
