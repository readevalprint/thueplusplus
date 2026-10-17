//! Thin CLI over the `thue` library.

use std::env;
use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::process::ExitCode;

use thue::{display_path, format_trace, parse_limit, Interpreter, RunMetrics};

fn main() -> ExitCode {
    match run() {
        Ok(code) => ExitCode::from(code as u8),
        Err(code) => ExitCode::from(code as u8),
    }
}

fn run() -> Result<u8, u8> {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.is_empty() {
        let _ = writeln!(
            io::stderr(),
            "usage: thue <program> [--proc:<name> <command>]... [--input <state>] [options]"
        );
        return Err(2);
    }
    let mut interp = Interpreter::new();
    let mut input_override = None;
    let mut rule_coverage_path = None;
    let mut counts_path = None;
    let mut metrics_path = None;
    let mut list_rules = false;
    let mut index = 1;
    while index < args.len() {
        let arg = args[index].as_str();
        if arg == "--debug" {
            interp.debug = true;
            index += 1;
        } else if arg == "--trace" {
            interp.trace_enabled = true;
            index += 1;
        } else if arg == "--list-rules" {
            list_rules = true;
            index += 1;
        } else if let Some(value) = take_value(&args, &mut index, "--rule-coverage") {
            rule_coverage_path = Some(value);
        } else if let Some(value) = take_value(&args, &mut index, "--counts") {
            counts_path = Some(value);
        } else if let Some(value) = take_value(&args, &mut index, "--metrics") {
            metrics_path = Some(value);
        } else if let Some(value) = take_value(&args, &mut index, "--input") {
            input_override = Some(value);
        } else if let Some(value) = take_value(&args, &mut index, "--max-evals") {
            interp.max_evals = require_limit(&value)?;
        } else if let Some(value) = take_value(&args, &mut index, "--max-state-bytes") {
            interp.max_state_bytes = require_limit(&value)?;
        } else if let Some(value) = take_value(&args, &mut index, "--max-steps") {
            interp.max_steps = require_limit(&value)?;
        } else if let Some(name) = arg.strip_prefix("--proc:") {
            if index + 1 >= args.len() {
                let _ = writeln!(
                    io::stderr(),
                    "Error: --proc:{name} requires a command argument"
                );
                return Err(1);
            }
            interp.add_proc_binding(name, args[index + 1].clone());
            index += 2;
        } else {
            let _ = writeln!(io::stderr(), "Error: Unknown argument: {arg}");
            return Err(1);
        }
    }

    interp.set_rule_coverage_path(rule_coverage_path);
    if let Err(err) = interp.load_program(&args[0]) {
        let _ = writeln!(io::stderr(), "Error: {err}");
        interp.cleanup();
        return Err(1);
    }
    let mut exit_code = 0u8;
    let mut error_message = None;
    let mut ran = false;
    if list_rules {
        for rule in interp.listed_rules() {
            println!(
                "{}\t{}",
                format!("{}:{}", display_path(&rule.source_path), rule.line_number),
                rule.lhs
            );
        }
    } else {
        if let Some(input) = input_override {
            interp.apply_input_override(&input);
        }
        ran = true;
        match interp.run() {
            Ok(code) => exit_code = code as u8,
            Err(err) => {
                error_message = Some(err.message().to_string());
                exit_code = err.exit_code() as u8;
            }
        }
    }
    if interp.trace_enabled {
        match format_trace(&interp.trace) {
            Ok(text) => {
                let _ = io::stderr().write_all(text.as_bytes());
            }
            Err(err) => {
                let _ = writeln!(io::stderr(), "Error: {err}");
                interp.cleanup();
                return Err(1);
            }
        }
    }
    if let Some(message) = error_message {
        let _ = writeln!(io::stderr(), "Error: {message}");
    }
    if ran {
        if let Some(path) = counts_path {
            if let Err(err) = write_counts(&path, interp.applied_steps, interp.eval_count) {
                let _ = writeln!(io::stderr(), "Error: failed to write counts: {err}");
                exit_code = 1;
            }
        }
        if let Some(path) = metrics_path {
            if let Err(err) = write_metrics(&path, &interp.metrics()) {
                let _ = writeln!(io::stderr(), "Error: failed to write metrics: {err}");
                exit_code = 1;
            }
        }
    }
    if let Err(err) = interp.write_rule_coverage() {
        let _ = writeln!(io::stderr(), "Error: failed to write rule coverage: {err}");
        exit_code = 1;
    }
    interp.cleanup();
    if exit_code == 0 {
        Ok(0)
    } else {
        Err(exit_code)
    }
}

fn take_value(args: &[String], index: &mut usize, flag: &str) -> Option<String> {
    let arg = args.get(*index).map(String::as_str).unwrap_or("");
    let equals = format!("{flag}=");
    if arg == flag {
        if *index + 1 >= args.len() {
            let _ = writeln!(io::stderr(), "Error: {flag} requires an argument");
            std::process::exit(1);
        }
        let value = args[*index + 1].clone();
        *index += 2;
        return Some(value);
    }
    if let Some(value) = arg.strip_prefix(&equals) {
        *index += 1;
        return Some(value.to_string());
    }
    None
}

fn require_limit(text: &str) -> Result<Option<i64>, u8> {
    match parse_limit(text) {
        Ok(value) => Ok(value),
        Err(err) => {
            let _ = writeln!(io::stderr(), "{err}");
            Err(2)
        }
    }
}

fn write_metrics(path: &str, metrics: &RunMetrics) -> Result<(), String> {
    if let Some(parent) = Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
    }
    let mut text = serde_json::to_string(metrics).map_err(|err| err.to_string())?;
    text.push('\n');
    fs::write(path, text).map_err(|err| err.to_string())
}

fn write_counts(path: &str, applied_steps: i64, probes: i64) -> Result<(), String> {
    if let Some(parent) = Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
    }
    let text = format!("{{\"applied_steps\":{applied_steps},\"probes\":{probes}}}\n");
    fs::write(path, text).map_err(|err| err.to_string())
}
