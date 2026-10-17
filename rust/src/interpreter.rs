//! The rewrite loop.

use std::collections::{BTreeMap, HashMap};
use std::fs;
use std::io::{self, Write};
use std::path::Path;
use std::time::Duration;

use regex::Regex;
use serde::Serialize;

use crate::builtin::{eval_builtin, is_name, pct_encode};
use crate::limits::parse_atoi;
use crate::pattern::{self, compile_guest, Operator, Rule};
use crate::resource::{ProcessResource, ReadFail, StdinResource};
use crate::template::{expand_mid_pattern, expand_template};

pub const DEFAULT_MAX_EVALS: i64 = 1_000_000;
pub const DEFAULT_MAX_STATE_BYTES: i64 = 8 * 1024 * 1024;
pub const DEFAULT_MAX_STEPS: i64 = 1_000_000;

pub const EXIT_RUNTIME: i32 = 1;
pub const EXIT_STEP_LIMIT: i32 = 10;
pub const EXIT_EVAL_LIMIT: i32 = 11;
pub const EXIT_STATE_LIMIT: i32 = 12;
pub const EXIT_READ_TIMEOUT: i32 = 13;

/// Counters for one run. The same fields as `thue --metrics`.
#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct RunMetrics {
    pub applied_steps: i64,
    pub regex_evals: i64,
    pub regex_matches: i64,
    pub state_bytes: i64,
    pub state_peak: i64,
    pub rule_count: i64,
    pub rule_chars: i64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LimitKind {
    Steps,
    Evals,
    State,
    Timeout,
}

impl LimitKind {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Steps => "steps",
            Self::Evals => "evals",
            Self::State => "state",
            Self::Timeout => "timeout",
        }
    }
}

#[derive(Debug, Clone)]
pub struct LimitError {
    pub kind: LimitKind,
    pub exit_code: i32,
    pub message: String,
}

impl std::fmt::Display for LimitError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for LimitError {}

#[derive(Debug)]
pub enum RunFailure {
    Limit(LimitError),
    Message(String),
}

impl RunFailure {
    pub fn message(&self) -> &str {
        match self {
            Self::Limit(limit) => &limit.message,
            Self::Message(message) => message,
        }
    }

    pub fn exit_code(&self) -> i32 {
        match self {
            Self::Limit(limit) => limit.exit_code,
            Self::Message(_) => EXIT_RUNTIME,
        }
    }

    pub fn limit(&self) -> Option<&LimitError> {
        match self {
            Self::Limit(limit) => Some(limit),
            Self::Message(_) => None,
        }
    }
}

impl std::fmt::Display for RunFailure {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.message())
    }
}

impl std::error::Error for RunFailure {}

#[derive(Debug, Clone)]
pub struct Error {
    pub message: String,
}

impl Error {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl std::fmt::Display for Error {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for Error {}

#[derive(Debug, Clone)]
pub struct TraceEvent {
    pub step: i64,
    pub rule_index: usize,
    pub source_path: String,
    pub line_number: usize,
    pub operator: Operator,
    pub lhs: String,
    pub match_start: usize,
    pub match_end: usize,
    pub groups: BTreeMap<String, String>,
    pub state_before: String,
    pub replacement: String,
    pub state_after: String,
    pub exit_code: Option<i32>,
    pub error: String,
}

#[derive(Serialize)]
struct TraceWire<'a> {
    step: i64,
    #[serde(rename = "ruleIndex")]
    rule_index: usize,
    #[serde(rename = "lineNumber")]
    line_number: usize,
    operator: &'a str,
    #[serde(rename = "matchStart")]
    match_start: usize,
    #[serde(rename = "matchEnd")]
    match_end: usize,
    error: &'a str,
    #[serde(rename = "stateBefore")]
    state_before: &'a str,
    replacement: &'a str,
    #[serde(rename = "stateAfter")]
    state_after: &'a str,
    #[serde(rename = "exitCode")]
    exit_code: Option<i32>,
}

pub fn format_trace(events: &[TraceEvent]) -> Result<String, Error> {
    if events.is_empty() {
        return Ok(String::new());
    }
    let mut out = String::new();
    for event in events {
        let wire = TraceWire {
            step: event.step,
            rule_index: event.rule_index,
            line_number: event.line_number,
            operator: event.operator.as_str(),
            match_start: event.match_start,
            match_end: event.match_end,
            error: &event.error,
            state_before: &event.state_before,
            replacement: &event.replacement,
            state_after: &event.state_after,
            exit_code: event.exit_code,
        };
        let line = serde_json::to_string(&wire).map_err(|err| Error::new(err.to_string()))?;
        out.push_str(&line);
        out.push('\n');
    }
    Ok(out)
}

#[derive(Clone, Debug)]
pub struct ListedRule {
    pub lhs: String,
    pub line_number: usize,
    pub source_path: String,
}

struct Match {
    start: usize,
    end: usize,
    groups: HashMap<String, String>,
}

enum Binding {
    Stdin(StdinResource),
    Stdout,
    Stderr,
    Process(ProcessResource),
}

pub struct Interpreter {
    rules: Vec<Rule>,
    state: String,
    bindings: HashMap<String, Binding>,
    pub max_evals: Option<i64>,
    pub max_state_bytes: Option<i64>,
    pub max_steps: Option<i64>,
    pub debug: bool,
    pub trace_enabled: bool,
    pub eval_count: i64,
    pub applied_steps: i64,
    regex_evals: i64,
    regex_matches: i64,
    state_bytes: i64,
    state_peak: i64,
    pub trace: Vec<TraceEvent>,
    rule_coverage_path: Option<String>,
    rule_coverage: BTreeMap<String, i64>,
    program_path: String,
    mid_cache: HashMap<String, Regex>,
}

impl Default for Interpreter {
    fn default() -> Self {
        Self::new()
    }
}

impl Interpreter {
    pub fn new() -> Self {
        let mut bindings = HashMap::new();
        bindings.insert("stdin".to_string(), Binding::Stdin(StdinResource::new()));
        bindings.insert("stdout".to_string(), Binding::Stdout);
        bindings.insert("stderr".to_string(), Binding::Stderr);
        Self {
            rules: Vec::new(),
            state: String::new(),
            bindings,
            max_evals: Some(DEFAULT_MAX_EVALS),
            max_state_bytes: Some(DEFAULT_MAX_STATE_BYTES),
            max_steps: Some(DEFAULT_MAX_STEPS),
            debug: false,
            trace_enabled: false,
            eval_count: 0,
            applied_steps: 0,
            regex_evals: 0,
            regex_matches: 0,
            state_bytes: 0,
            state_peak: 0,
            trace: Vec::new(),
            rule_coverage_path: None,
            rule_coverage: BTreeMap::new(),
            program_path: String::new(),
            mid_cache: HashMap::new(),
        }
    }

    pub fn state(&self) -> &str {
        &self.state
    }

    pub fn set_rule_coverage_path(&mut self, path: Option<String>) {
        self.rule_coverage_path = path;
    }

    pub fn add_proc_binding(&mut self, name: impl Into<String>, command: impl Into<String>) {
        self.bindings
            .insert(name.into(), Binding::Process(ProcessResource::new(command)));
    }

    pub fn load_program(&mut self, path: impl AsRef<Path>) -> Result<(), Error> {
        let path = path.as_ref();
        let abs = std::path::absolute(path).map_err(|err| Error::new(err.to_string()))?;
        let bytes = match fs::read(&abs) {
            Ok(bytes) => bytes,
            Err(err) if err.kind() == io::ErrorKind::NotFound => {
                return Err(Error::new(format!("File not found: {}", abs.display())));
            }
            Err(err) => return Err(Error::new(err.to_string())),
        };
        let content =
            String::from_utf8(bytes).map_err(|_| Error::new("program is not valid UTF-8"))?;
        self.program_path = abs.display().to_string();
        self.load_text(&self.program_path.clone(), &content)
    }

    pub fn load_program_text(&mut self, source_path: &str, content: &str) -> Result<(), Error> {
        if source_path.trim().is_empty() {
            return Err(Error::new("source path is required"));
        }
        self.program_path = source_path.to_string();
        self.load_text(source_path, content)
    }

    fn load_text(&mut self, source_path: &str, content: &str) -> Result<(), Error> {
        let parsed = pattern::parse_program(source_path, content).map_err(Error::new)?;
        self.rules = parsed.rules;
        self.state = parsed.state;
        self.mid_cache.clear();
        Ok(())
    }

    pub fn apply_input_override(&mut self, value: &str) {
        self.state = value.to_string();
    }

    pub fn listed_rules(&self) -> Vec<ListedRule> {
        self.rules
            .iter()
            .map(|rule| ListedRule {
                lhs: rule.lhs.clone(),
                line_number: rule.line_number,
                source_path: rule.source_path.clone(),
            })
            .collect()
    }

    pub fn metrics(&self) -> RunMetrics {
        let mut rule_chars = 0i64;
        for rule in &self.rules {
            rule_chars += rule.source.len() as i64;
        }
        RunMetrics {
            applied_steps: self.applied_steps,
            regex_evals: self.regex_evals,
            regex_matches: self.regex_matches,
            state_bytes: self.state_bytes,
            state_peak: self.state_peak,
            rule_count: self.rules.len() as i64,
            rule_chars,
        }
    }

    pub fn run(&mut self) -> Result<i32, RunFailure> {
        self.applied_steps = 0;
        self.regex_evals = 0;
        self.regex_matches = 0;
        self.state_bytes = 0;
        self.state_peak = 0;
        self.trace.clear();
        self.note_state();
        loop {
            let mut applied = false;
            let rule_count = self.rules.len();
            for rule_index in 0..rule_count {
                if let Some(max) = self.max_evals {
                    if self.eval_count >= max {
                        return Err(limit_failure(
                            LimitKind::Evals,
                            EXIT_EVAL_LIMIT,
                            format!("Evaluation step limit ({max}) exceeded"),
                        ));
                    }
                }
                self.eval_count += 1;
                let found = self.find_match(rule_index);
                let Some(mut found) = found else {
                    continue;
                };
                let state_before = self.state.clone();
                let line_number = self.rules[rule_index].line_number;
                let operator = self.rules[rule_index].operator;
                let rhs = self.rules[rule_index].rhs.clone();
                let lhs = self.rules[rule_index].lhs.clone();
                let source_path = self.rules[rule_index].source_path.clone();
                let builtin_name = self.rules[rule_index].builtin_name.clone();
                let builtin_args = self.rules[rule_index].builtin_args.clone();
                let mids: Vec<String> = self.rules[rule_index]
                    .mids
                    .iter()
                    .map(|mid| mid.pattern.clone())
                    .collect();
                let mid = self.apply_mids(line_number, &mids, &found.groups);
                let groups = match mid {
                    Err(message) => {
                        self.record(
                            rule_index,
                            &source_path,
                            line_number,
                            operator,
                            &lhs,
                            &found,
                            &state_before,
                            "",
                            None,
                            &message,
                        );
                        return Err(RunFailure::Message(message));
                    }
                    Ok(None) => continue,
                    Ok(Some(groups)) => groups,
                };
                found.groups = groups;
                applied = true;
                if self.debug {
                    self.debug_match(line_number, &lhs, &found, &state_before);
                }
                if operator != Operator::Exit {
                    if let Some(max) = self.max_steps {
                        if self.applied_steps >= max {
                            return Err(limit_failure(
                                LimitKind::Steps,
                                EXIT_STEP_LIMIT,
                                format!("Applied step limit ({max}) exceeded"),
                            ));
                        }
                    }
                }
                let mut extra = HashMap::new();
                extra.insert("rule_index".to_string(), rule_index.to_string());
                let replacement = match operator {
                    Operator::Substitute => match expand_template(&rhs, &found.groups, &extra) {
                        Ok(text) => {
                            self.record_coverage(&source_path, line_number);
                            text
                        }
                        Err(message) => {
                            self.record(
                                rule_index,
                                &source_path,
                                line_number,
                                operator,
                                &lhs,
                                &found,
                                &state_before,
                                "",
                                None,
                                &message,
                            );
                            return Err(RunFailure::Message(message));
                        }
                    },
                    Operator::Read => match self.read_operator(line_number, &rhs) {
                        Ok(text) => {
                            self.record_coverage(&source_path, line_number);
                            text
                        }
                        Err(failure) => {
                            self.record(
                                rule_index,
                                &source_path,
                                line_number,
                                operator,
                                &lhs,
                                &found,
                                &state_before,
                                "",
                                None,
                                failure.message(),
                            );
                            return Err(failure);
                        }
                    },
                    Operator::Write => match expand_template(&rhs, &found.groups, &extra) {
                        Ok(expanded) => {
                            let (resource, content) = split_resource(&expanded);
                            let (replacement, ok) = self.write_operator(resource, content);
                            if ok {
                                self.record_coverage(&source_path, line_number);
                            }
                            replacement
                        }
                        Err(message) => {
                            self.record(
                                rule_index,
                                &source_path,
                                line_number,
                                operator,
                                &lhs,
                                &found,
                                &state_before,
                                "",
                                None,
                                &message,
                            );
                            return Err(RunFailure::Message(message));
                        }
                    },
                    Operator::Builtin => {
                        let mut values = Vec::new();
                        for arg in &builtin_args {
                            let Some(value) = found.groups.get(arg) else {
                                let message = format!(
                                    "Line {line_number}: ::! argument '{arg}' was not captured"
                                );
                                self.record(
                                    rule_index,
                                    &source_path,
                                    line_number,
                                    operator,
                                    &lhs,
                                    &found,
                                    &state_before,
                                    "",
                                    None,
                                    &message,
                                );
                                return Err(RunFailure::Message(message));
                            };
                            values.push(value.clone());
                        }
                        match eval_builtin(&builtin_name, &values) {
                            Ok(text) => {
                                self.record_coverage(&source_path, line_number);
                                text
                            }
                            Err(message) => {
                                self.record(
                                    rule_index,
                                    &source_path,
                                    line_number,
                                    operator,
                                    &lhs,
                                    &found,
                                    &state_before,
                                    "",
                                    None,
                                    &message,
                                );
                                return Err(RunFailure::Message(message));
                            }
                        }
                    }
                    Operator::Exit => {
                        self.record_coverage(&source_path, line_number);
                        let code = parse_exit_code(&rhs);
                        self.record(
                            rule_index,
                            &source_path,
                            line_number,
                            operator,
                            &lhs,
                            &found,
                            &state_before,
                            "",
                            code,
                            "",
                        );
                        return match code {
                            Some(code) => Ok(code),
                            None => Ok(EXIT_RUNTIME),
                        };
                    }
                };
                let new_state = splice(&state_before, found.start, found.end, &replacement);
                if let Err(failure) = self.set_state(new_state) {
                    self.record(
                        rule_index,
                        &source_path,
                        line_number,
                        operator,
                        &lhs,
                        &found,
                        &state_before,
                        &replacement,
                        None,
                        failure.message(),
                    );
                    return Err(failure);
                }
                self.note_state();
                self.record(
                    rule_index,
                    &source_path,
                    line_number,
                    operator,
                    &lhs,
                    &found,
                    &state_before,
                    &replacement,
                    None,
                    "",
                );
                self.applied_steps += 1;
                if let Some(max) = self.max_steps {
                    if self.applied_steps >= max {
                        return Err(limit_failure(
                            LimitKind::Steps,
                            EXIT_STEP_LIMIT,
                            format!("Applied step limit ({max}) exceeded"),
                        ));
                    }
                }
                if self.debug {
                    let _ = writeln!(
                        io::stderr(),
                        "[{}] RESULT: {}\n",
                        self.eval_count,
                        self.state.replace('\n', r"\n")
                    );
                }
                break;
            }
            if !applied {
                return Ok(0);
            }
        }
    }

    fn note_state(&mut self) {
        let size = self.state.len() as i64;
        self.state_bytes += size;
        if size > self.state_peak {
            self.state_peak = size;
        }
    }

    fn find_match(&mut self, rule_index: usize) -> Option<Match> {
        let prefix = self.rules[rule_index].literal_prefix.clone();
        if !prefix.is_empty() && !self.state.contains(&prefix) {
            return None;
        }
        self.regex_evals += 1;
        let found = find_match_rule(&self.rules[rule_index], &self.state);
        if found.is_some() {
            self.regex_matches += 1;
        }
        found
    }

    pub fn write_rule_coverage(&self) -> Result<(), Error> {
        let Some(path) = &self.rule_coverage_path else {
            return Ok(());
        };
        if let Some(parent) = Path::new(path).parent() {
            if !parent.as_os_str().is_empty() {
                fs::create_dir_all(parent).map_err(|err| Error::new(err.to_string()))?;
            }
        }
        let mut text = String::new();
        for (id, count) in &self.rule_coverage {
            text.push_str(id);
            text.push('\t');
            text.push_str(&count.to_string());
            text.push('\n');
        }
        fs::write(path, text).map_err(|err| Error::new(err.to_string()))
    }

    pub fn cleanup(&mut self) {
        for binding in self.bindings.values_mut() {
            if let Binding::Process(process) = binding {
                process.cleanup();
            }
        }
    }

    fn apply_mids(
        &mut self,
        line_number: usize,
        mids: &[String],
        groups: &HashMap<String, String>,
    ) -> Result<Option<HashMap<String, String>>, String> {
        if mids.is_empty() {
            return Ok(Some(groups.clone()));
        }
        let mut out = groups.clone();
        for pattern in mids {
            let expanded = expand_mid_pattern(pattern, &out)
                .map_err(|err| format!("Line {line_number}: {err}"))?;
            let compiled = if let Some(cached) = self.mid_cache.get(&expanded) {
                cached.clone()
            } else {
                match compile_guest(&expanded) {
                    Ok(compiled) => {
                        self.mid_cache.insert(expanded.clone(), compiled.clone());
                        compiled
                    }
                    Err(_) => {
                        return Err(format!(
                            "Line {line_number}: Invalid ::| regex '{expanded}'"
                        ));
                    }
                }
            };
            self.regex_evals += 1;
            let Some(caps) = compiled.captures(&self.state) else {
                return Ok(None);
            };
            self.regex_matches += 1;
            for name in compiled.capture_names().flatten() {
                if let Some(found) = caps.name(name) {
                    out.insert(name.to_string(), found.as_str().to_string());
                }
            }
        }
        Ok(Some(out))
    }

    fn read_operator(&mut self, line_number: usize, rhs: &str) -> Result<String, RunFailure> {
        let parts: Vec<&str> = rhs.split_whitespace().collect();
        if parts.len() != 2 {
            return Err(RunFailure::Message(format!(
                "Line {line_number}: ::< requires read_spec and literal resource"
            )));
        }
        let seconds: f64 = parts[0].parse().unwrap_or(f64::NAN);
        if !seconds.is_finite() || seconds <= 0.0 {
            return Err(RunFailure::Message(format!(
                "Line {line_number}: invalid read timeout '{}'",
                parts[0]
            )));
        }
        if !is_name(parts[1]) {
            return Err(RunFailure::Message(format!(
                "Line {line_number}: ::< resource must be a literal binding name"
            )));
        }
        let nanos = seconds * 1_000_000_000.0;
        if !nanos.is_finite() || nanos < 0.0 {
            return Err(RunFailure::Message(format!(
                "Line {line_number}: invalid read timeout '{}'",
                parts[0]
            )));
        }
        let timeout = Duration::from_nanos(nanos.min(u64::MAX as f64) as u64);
        let name = parts[1].to_string();
        let read = match self.bindings.get_mut(&name) {
            None => return Err(RunFailure::Message(format!("Unknown resource '{name}'"))),
            Some(Binding::Stdout | Binding::Stderr) => {
                return Err(RunFailure::Message(
                    "ERR:resource:cannot_read_output_stream".to_string(),
                ));
            }
            Some(Binding::Stdin(stdin)) => stdin.read_line(timeout),
            Some(Binding::Process(process)) => process.read_line(timeout),
        };
        match read {
            Ok(line) => Ok(pct_encode(&line)),
            Err(ReadFail::Timeout) => Err(limit_failure(
                LimitKind::Timeout,
                EXIT_READ_TIMEOUT,
                format!("ERR:resource:{name}:timeout"),
            )),
            Err(ReadFail::Message(message)) => Err(RunFailure::Message(format!(
                "ERR:resource:{name}:{message}"
            ))),
        }
    }

    fn write_operator(&mut self, resource: &str, content: &str) -> (String, bool) {
        if !self.bindings.contains_key(resource) {
            return (format!("ERR:resource:{resource}"), false);
        }
        let result = match self.bindings.get_mut(resource).unwrap() {
            Binding::Stdout => write_std(&mut io::stdout(), content),
            Binding::Stderr => write_std(&mut io::stderr(), content),
            Binding::Stdin(_) => Err("write requires process or output stream binding".to_string()),
            Binding::Process(process) => process.write(content),
        };
        match result {
            Ok(()) => (String::new(), true),
            Err(message) => {
                if message == "cannot_read_output_stream" {
                    (format!("ERR:resource:{message}"), false)
                } else {
                    (format!("ERR:resource:{resource}:{message}"), false)
                }
            }
        }
    }

    fn set_state(&mut self, new_state: String) -> Result<(), RunFailure> {
        if let Some(max) = self.max_state_bytes {
            if exceeds(new_state.len(), max) {
                return Err(limit_failure(
                    LimitKind::State,
                    EXIT_STATE_LIMIT,
                    format!(
                        "State size ({} bytes) exceeds maximum ({max} bytes)",
                        new_state.len()
                    ),
                ));
            }
        }
        self.state = new_state;
        Ok(())
    }

    fn record_coverage(&mut self, source_path: &str, line_number: usize) {
        if self.rule_coverage_path.is_none() {
            return;
        }
        let id = format!("{}:{line_number}", display_path(source_path));
        *self.rule_coverage.entry(id).or_insert(0) += 1;
    }

    fn record(
        &mut self,
        rule_index: usize,
        source_path: &str,
        line_number: usize,
        operator: Operator,
        lhs: &str,
        found: &Match,
        state_before: &str,
        replacement: &str,
        exit_code: Option<i32>,
        error: &str,
    ) {
        if !self.trace_enabled {
            return;
        }
        let groups = found
            .groups
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect();
        self.trace.push(TraceEvent {
            step: self.eval_count,
            rule_index,
            source_path: source_path.to_string(),
            line_number,
            operator,
            lhs: lhs.to_string(),
            match_start: found.start,
            match_end: found.end,
            groups,
            state_before: state_before.to_string(),
            replacement: replacement.to_string(),
            state_after: self.state.clone(),
            exit_code,
            error: error.to_string(),
        });
    }

    fn debug_match(&self, line_number: usize, lhs: &str, found: &Match, state_before: &str) {
        let _ = writeln!(
            io::stderr(),
            "[{}] STATE: {}",
            self.eval_count,
            state_before.replace('\n', r"\n")
        );
        let _ = writeln!(
            io::stderr(),
            "[{}] RULE {line_number} MATCHES STATE AT {}:{}: {lhs}",
            self.eval_count,
            found.start,
            found.end
        );
        let _ = writeln!(
            io::stderr(),
            "[{}] GROUPS: {}",
            self.eval_count,
            format_groups(&found.groups)
        );
    }
}

impl Drop for Interpreter {
    fn drop(&mut self) {
        self.cleanup();
    }
}

fn limit_failure(kind: LimitKind, exit_code: i32, message: String) -> RunFailure {
    RunFailure::Limit(LimitError {
        kind,
        exit_code,
        message,
    })
}

fn exceeds(len: usize, max: i64) -> bool {
    if max < 0 {
        true
    } else {
        (len as u128) > (max as u128)
    }
}

fn find_match_rule(rule: &Rule, state: &str) -> Option<Match> {
    let caps = rule.pattern.captures(state)?;
    let whole = caps.get(0)?;
    let mut groups = HashMap::new();
    for name in rule.pattern.capture_names().flatten() {
        if let Some(found) = caps.name(name) {
            groups.insert(name.to_string(), found.as_str().to_string());
        }
    }
    Some(Match {
        start: whole.start(),
        end: whole.end(),
        groups,
    })
}

fn splice(state: &str, start: usize, end: usize, replacement: &str) -> String {
    let mut out = String::with_capacity(state.len() - (end - start) + replacement.len());
    out.push_str(&state[..start]);
    out.push_str(replacement);
    out.push_str(&state[end..]);
    out
}

fn split_resource(expanded: &str) -> (&str, &str) {
    for (index, ch) in expanded.char_indices() {
        if ch == ' ' || ch == '\t' {
            return (&expanded[..index], &expanded[index + ch.len_utf8()..]);
        }
    }
    (expanded, "")
}

fn parse_exit_code(rhs: &str) -> Option<i32> {
    let trimmed = rhs.trim();
    let code = if trimmed.starts_with('{') && trimmed.ends_with('}') && trimmed.len() >= 2 {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    };
    let value = parse_atoi(code).ok()?;
    i32::try_from(value).ok()
}

fn write_std(mut writer: impl Write, content: &str) -> Result<(), String> {
    writer
        .write_all(content.as_bytes())
        .map_err(|err| err.to_string())?;
    writer.flush().map_err(|err| err.to_string())
}

pub fn display_path(path: &str) -> String {
    let path = Path::new(path);
    if let Ok(cwd) = std::env::current_dir() {
        if let Ok(relative) = path.strip_prefix(&cwd) {
            return relative.to_string_lossy().replace('\\', "/");
        }
    }
    path.to_string_lossy().replace('\\', "/")
}

fn format_groups(groups: &HashMap<String, String>) -> String {
    let mut keys: Vec<&String> = groups.keys().collect();
    keys.sort();
    let parts: Vec<String> = keys
        .into_iter()
        .map(|key| {
            let value = groups[key].replace('\n', r"\n").replace('\r', r"\r");
            format!("{key}:{value}")
        })
        .collect();
    format!("map[{}]", parts.join(" "))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn drive(source: &str, input: &str) -> Result<i32, RunFailure> {
        let mut interp = Interpreter::new();
        interp.max_steps = Some(1000);
        interp.max_evals = Some(10_000);
        interp.max_state_bytes = Some(1_000_000);
        interp.load_program_text("t.thue", source).unwrap();
        interp.apply_input_override(input);
        interp.run()
    }

    #[test]
    fn hello_rewrite_quiesces() {
        let code = drive("^hello$ ::= world\n::=\n", "hello").unwrap();
        assert_eq!(code, 0);
    }

    #[test]
    fn step_limit_trace_and_message() {
        let mut interp = Interpreter::new();
        interp.max_steps = Some(1);
        interp.max_evals = Some(100);
        interp.max_state_bytes = Some(100);
        interp.trace_enabled = true;
        interp
            .load_program_text("state-limit.thue", "^a$ ::= bb\n::=\n")
            .unwrap();
        interp.apply_input_override("a");
        interp.max_state_bytes = Some(1);
        let err = interp.run().unwrap_err();
        assert_eq!(err.exit_code(), 12);
        assert_eq!(interp.state(), "a");
        assert_eq!(interp.applied_steps, 0);
        let text = format_trace(&interp.trace).unwrap();
        assert_eq!(
            text,
            "{\"step\":1,\"ruleIndex\":0,\"lineNumber\":1,\"operator\":\"::=\",\"matchStart\":0,\"matchEnd\":1,\"error\":\"State size (2 bytes) exceeds maximum (1 bytes)\",\"stateBefore\":\"a\",\"replacement\":\"bb\",\"stateAfter\":\"a\",\"exitCode\":null}\n"
        );
    }

    #[test]
    fn zero_steps_apply_nothing() {
        let mut interp = Interpreter::new();
        interp.max_steps = Some(0);
        interp.max_evals = Some(10);
        interp.max_state_bytes = Some(100);
        interp
            .load_program_text("t.thue", "^a$ ::= b\n::=\n")
            .unwrap();
        interp.apply_input_override("a");
        let err = interp.run().unwrap_err();
        assert_eq!(err.exit_code(), 10);
        assert_eq!(err.message(), "Applied step limit (0) exceeded");
        assert!(interp.trace.is_empty());
    }
}
