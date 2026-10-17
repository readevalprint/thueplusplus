//! Source splitting, pattern aliases, and RE2-to-`regex` compilation.

use std::collections::HashMap;
use std::sync::OnceLock;

use regex::{Regex, RegexBuilder};

pub const MAX_PATTERN_ALIAS_SUBSTITUTIONS_PER_LINE: usize = 10_000;
pub const MAX_EXPANDED_PATTERN_BYTES: usize = 1_000_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Operator {
    Substitute,
    Read,
    Write,
    Exit,
    Builtin,
}

impl Operator {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Substitute => "::=",
            Self::Read => "::<",
            Self::Write => "::>",
            Self::Exit => "::-",
            Self::Builtin => "::!",
        }
    }

    fn from_byte(op: u8) -> Option<Self> {
        match op {
            b'=' => Some(Self::Substitute),
            b'<' => Some(Self::Read),
            b'>' => Some(Self::Write),
            b'-' => Some(Self::Exit),
            b'!' => Some(Self::Builtin),
            _ => None,
        }
    }
}

#[derive(Clone, Debug)]
pub struct Mid {
    pub pattern: String,
}

#[derive(Clone, Debug)]
pub struct Rule {
    pub lhs: String,
    pub pattern: Regex,
    pub mids: Vec<Mid>,
    pub operator: Operator,
    pub rhs: String,
    pub line_number: usize,
    pub source_path: String,
    pub builtin_name: String,
    pub builtin_args: Vec<String>,
}

#[derive(Clone, Debug)]
struct SourceRow {
    text: String,
    source_path: String,
    source_line: usize,
}

pub struct ParsedProgram {
    pub rules: Vec<Rule>,
    pub state: String,
}

pub fn source_lines(content: &str) -> Vec<&str> {
    if content.is_empty() {
        return Vec::new();
    }
    let trimmed = content.strip_suffix('\n').unwrap_or(content);
    if trimmed.is_empty() {
        return vec![""];
    }
    trimmed
        .split('\n')
        .map(|line| line.strip_suffix('\r').unwrap_or(line))
        .collect()
}

fn alias_def() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^\s*([A-Z][A-Z0-9_]*)\s*<-\s*(.*)$").expect("alias def regex"))
}

fn invalid_alias_token() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"<\|([A-Z][A-Z0-9_]*)\|>").expect("alias token regex"))
}

fn named_capture() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        Regex::new(r"\(\?(?:<|P<)([A-Za-z_][A-Za-z0-9_]*)>").expect("named capture regex")
    })
}

fn structural_op_at(line: &str, index: usize) -> Option<u8> {
    let bytes = line.as_bytes();
    if index + 2 >= bytes.len() || bytes[index] != b':' || bytes[index + 1] != b':' {
        return None;
    }
    if index > 0 && bytes[index - 1] == b'\\' {
        return None;
    }
    let op = bytes[index + 2];
    if matches!(op, b'|' | b'=' | b'<' | b'>' | b'-' | b'!') {
        Some(op)
    } else {
        None
    }
}

fn has_terminal_operator(line: &str) -> bool {
    let mut index = 0;
    while index + 2 < line.len() {
        if let Some(op) = structural_op_at(line, index) {
            if op != b'|' {
                return true;
            }
        }
        index += 1;
    }
    false
}

struct RuleSplit {
    lhs: String,
    mids: Vec<String>,
    op: u8,
    rhs: String,
}

fn split_rule_line(line: &str) -> Result<Option<RuleSplit>, String> {
    let mut saw_mid = false;
    let mut lhs = String::new();
    let mut mids = Vec::new();
    let mut index = 0;
    while index + 2 < line.len() {
        let Some(op) = structural_op_at(line, index) else {
            index += 1;
            continue;
        };
        if op == b'|' {
            if !saw_mid {
                lhs = line[..index].to_string();
                saw_mid = true;
            }
            let mut next_at = index + 3;
            let mut found = false;
            let mut next_op = 0;
            while next_at + 2 < line.len() {
                if let Some(op) = structural_op_at(line, next_at) {
                    found = true;
                    next_op = op;
                    break;
                }
                next_at += 1;
            }
            if !found {
                return Err("::| requires a terminal operator".to_string());
            }
            mids.push(line[index + 3..next_at].to_string());
            if next_op == b'|' {
                index = next_at;
                continue;
            }
            return Ok(Some(RuleSplit {
                lhs,
                mids,
                op: next_op,
                rhs: line[next_at + 3..].to_string(),
            }));
        }
        if !saw_mid {
            lhs = line[..index].to_string();
        }
        return Ok(Some(RuleSplit {
            lhs,
            mids,
            op,
            rhs: line[index + 3..].to_string(),
        }));
    }
    if saw_mid {
        return Err("::| requires a terminal operator".to_string());
    }
    Ok(None)
}

fn has_invalid_operator(line: &str) -> bool {
    let bytes = line.as_bytes();
    let mut index = 0;
    while index + 2 < bytes.len() {
        if bytes[index] == b':'
            && bytes[index + 1] == b':'
            && (index == 0 || bytes[index - 1] != b'\\')
        {
            let ch = bytes[index + 2];
            let word = ch.is_ascii_alphanumeric() || ch == b'_';
            let whitespace = matches!(ch, b' ' | b'\t' | b'\n' | b'\r' | 0x0c);
            let op = matches!(ch, b'=' | b'<' | b'>' | b'!' | b'-');
            if !word && !whitespace && !op {
                return true;
            }
        }
        index += 1;
    }
    false
}

fn expand_alias_refs(
    pattern: &str,
    aliases: &HashMap<String, String>,
    line_number: usize,
) -> Result<String, String> {
    if let Some(found) = invalid_alias_token().captures(pattern) {
        let name = found.get(1).map(|m| m.as_str()).unwrap_or("");
        return Err(format!(
            "Line {line_number}: Invalid pattern alias token '<|{name}|>'; use '${name}' aliases"
        ));
    }
    let chars: Vec<(usize, char)> = pattern.char_indices().collect();
    let mut out = String::new();
    let mut substitutions = 0;
    let mut index = 0;
    while index < chars.len() {
        let (_, ch) = chars[index];
        let escaped = index > 0 && chars[index - 1].1 == '\\';
        if ch != '$' || escaped {
            out.push(ch);
            index += 1;
            continue;
        }
        let mut end = index + 1;
        if end >= chars.len() || !chars[end].1.is_ascii_uppercase() {
            out.push('$');
            index += 1;
            continue;
        }
        end += 1;
        while end < chars.len() {
            let c = chars[end].1;
            if c.is_ascii_uppercase() || c.is_ascii_digit() || c == '_' {
                end += 1;
            } else {
                break;
            }
        }
        let name_start = chars[index + 1].0;
        let name_end = if end < chars.len() {
            chars[end].0
        } else {
            pattern.len()
        };
        let name = &pattern[name_start..name_end];
        let Some(alias) = aliases.get(name) else {
            return Err(format!(
                "Line {line_number}: Unknown pattern alias '${name}'"
            ));
        };
        substitutions += 1;
        if substitutions > MAX_PATTERN_ALIAS_SUBSTITUTIONS_PER_LINE {
            return Err(format!(
                "Line {line_number}: Pattern alias expansion exceeded substitution limit ({MAX_PATTERN_ALIAS_SUBSTITUTIONS_PER_LINE})"
            ));
        }
        out.push_str(alias);
        index = end;
    }
    if out.len() > MAX_EXPANDED_PATTERN_BYTES {
        return Err(format!(
            "Line {line_number}: Pattern alias expansion exceeded byte limit ({MAX_EXPANDED_PATTERN_BYTES})"
        ));
    }
    Ok(out)
}

fn annotate(source_path: &str, content: &str) -> String {
    let mut out = String::new();
    for (index, line) in source_lines(content).into_iter().enumerate() {
        out.push_str("# thue-source: ");
        out.push_str(source_path);
        out.push(':');
        out.push_str(&(index + 1).to_string());
        out.push('\n');
        out.push_str(line);
        out.push('\n');
    }
    out
}

fn iter_source_rows(content: &str, program_path: &str) -> Vec<SourceRow> {
    let mut rows = Vec::new();
    let mut current_path = program_path.to_string();
    let mut current_line = 0usize;
    for (index, line) in source_lines(content).into_iter().enumerate() {
        let trimmed = line.trim();
        if let Some(marker) = trimmed.strip_prefix("# thue-source: ") {
            if let Some((path, line_text)) = marker.rsplit_once(':') {
                if let Ok(source_line) = line_text.parse::<usize>() {
                    if source_line > 0 {
                        current_path = path.to_string();
                        current_line = source_line;
                    }
                }
            }
            continue;
        }
        let source_line = if current_line == 0 {
            index + 1
        } else {
            current_line
        };
        rows.push(SourceRow {
            text: line.to_string(),
            source_path: current_path.clone(),
            source_line,
        });
    }
    rows
}

fn annotated_from_rows(rows: &[SourceRow]) -> String {
    let mut out = String::new();
    for (index, row) in rows.iter().enumerate() {
        if index > 0 {
            out.push('\n');
        }
        out.push_str("# thue-source: ");
        out.push_str(&row.source_path);
        out.push(':');
        out.push_str(&row.source_line.to_string());
        out.push('\n');
        out.push_str(&row.text);
    }
    out
}

fn expand_patterns(content: &str) -> Result<String, String> {
    let mut aliases: HashMap<String, String> = HashMap::new();
    let mut out = Vec::new();
    let mut current_source_line = 0usize;
    for (index, line) in source_lines(content).into_iter().enumerate() {
        let line_number = index + 1;
        let stripped = line.trim();
        if let Some(marker) = stripped.strip_prefix("# thue-source: ") {
            if let Some((_, source_line)) = marker.rsplit_once(':') {
                if let Ok(parsed) = source_line.parse::<usize>() {
                    current_source_line = parsed;
                }
            }
            out.push(line.to_string());
            continue;
        }
        let effective = if current_source_line == 0 {
            line_number
        } else {
            current_source_line
        };
        if stripped.is_empty() {
            out.push(line.to_string());
            continue;
        }
        if let Some(found) = alias_def().captures(line) {
            if !has_terminal_operator(line) {
                let name = found.get(1).unwrap().as_str().to_string();
                let body = found.get(2).unwrap().as_str().trim().to_string();
                if aliases.contains_key(&name) {
                    return Err(format!(
                        "Line {effective}: Duplicate pattern alias '{name}'"
                    ));
                }
                if named_capture().is_match(&body) {
                    return Err(format!(
                        "Line {effective}: Pattern alias '{name}' must not contain named captures"
                    ));
                }
                let expanded = expand_alias_refs(&body, &aliases, effective)?;
                aliases.insert(name, format!("(?:{expanded})"));
                continue;
            }
        }
        match split_rule_line(line) {
            Err(err) => return Err(format!("Line {effective}: {err}")),
            Ok(Some(split)) => {
                let mut rebuilt = expand_alias_refs(&split.lhs, &aliases, effective)?;
                for mid in split.mids {
                    rebuilt.push_str("::|");
                    rebuilt.push_str(&expand_alias_refs(&mid, &aliases, effective)?);
                }
                rebuilt.push_str("::");
                rebuilt.push(split.op as char);
                rebuilt.push_str(&split.rhs);
                out.push(rebuilt);
            }
            Ok(None) => out.push(line.to_string()),
        }
    }
    Ok(out.join("\n"))
}

/// Compile a guest pattern with RE2 multiline semantics.
pub fn compile_guest(pattern: &str) -> Result<Regex, regex::Error> {
    let translated = translate_re2(pattern);
    let full = format!("(?m){translated}");
    RegexBuilder::new(&full)
        .size_limit(100 * 1024 * 1024)
        .dfa_size_limit(100 * 1024 * 1024)
        .nest_limit(1024)
        .build()
}

pub fn capture_names(pattern: &Regex) -> std::collections::HashSet<String> {
    pattern
        .capture_names()
        .flatten()
        .map(|name| name.to_string())
        .collect()
}

fn parse_rule(line: &str, line_number: usize, source_path: &str) -> Result<Option<Rule>, String> {
    let trimmed = line.trim();
    if trimmed.is_empty() || trimmed == "::=" {
        return Ok(None);
    }
    let split = match split_rule_line(line) {
        Err(err) => return Err(format!("Line {line_number}: {err}")),
        Ok(split) => split,
    };
    let Some(split) = split else {
        if has_invalid_operator(line) {
            return Err(format!("Line {line_number}: Invalid rule syntax: {line}"));
        }
        return Ok(None);
    };
    let lhs = split.lhs.trim_end_matches([' ', '\t']).to_string();
    let rhs = split.rhs.trim_start_matches([' ', '\t']).to_string();
    if lhs.is_empty() {
        return Ok(None);
    }
    let Some(operator) = Operator::from_byte(split.op) else {
        return Err(format!("Line {line_number}: Invalid rule syntax: {line}"));
    };
    let mut mids = Vec::new();
    for text in split.mids {
        let pattern = text.trim_matches([' ', '\t']);
        if pattern.is_empty() {
            return Err(format!("Line {line_number}: ::| requires a regex"));
        }
        mids.push(Mid {
            pattern: pattern.to_string(),
        });
    }
    let pattern = compile_guest(&lhs).map_err(|err| {
        let detail = flatten_regex_error(&err);
        format!("Line {line_number}: Invalid regex '{lhs}': {detail}")
    })?;
    let mut builtin_name = String::new();
    let mut builtin_args = Vec::new();
    if operator == Operator::Builtin {
        let mut names = capture_names(&pattern);
        for mid in &mids {
            for found in named_capture().captures_iter(&mid.pattern) {
                if let Some(name) = found.get(1) {
                    names.insert(name.as_str().to_string());
                }
            }
        }
        let (name, args) = crate::builtin::parse_builtin_call(&rhs, line_number, &names)?;
        builtin_name = name;
        builtin_args = args;
    }
    Ok(Some(Rule {
        lhs,
        pattern,
        mids,
        operator,
        rhs,
        line_number,
        source_path: source_path.to_string(),
        builtin_name,
        builtin_args,
    }))
}

fn flatten_regex_error(err: &regex::Error) -> String {
    err.to_string().replace(['\n', '\r'], " ")
}

pub fn parse_program(source_path: &str, content: &str) -> Result<ParsedProgram, String> {
    let annotated = annotate(source_path, content);
    let rows = iter_source_rows(&annotated, source_path);
    let separator = rows.iter().position(|row| row.text.trim() == "::=");
    let (prefix, state_rows): (Vec<SourceRow>, Vec<SourceRow>) = if let Some(index) = separator {
        let mut prefix = rows;
        let state = prefix.split_off(index + 1);
        prefix.pop();
        (prefix, state)
    } else {
        (rows, Vec::new())
    };
    let expanded = expand_patterns(&annotated_from_rows(&prefix))?;
    let mut rules = Vec::new();
    let mut current_path = source_path.to_string();
    let mut current_line = 0usize;
    for line in source_lines(&expanded) {
        let trimmed = line.trim();
        if let Some(marker) = trimmed.strip_prefix("# thue-source: ") {
            if let Some((path, line_text)) = marker.rsplit_once(':') {
                if let Ok(source_line) = line_text.parse::<usize>() {
                    if source_line > 0 {
                        current_path = path.to_string();
                        current_line = source_line;
                    }
                }
            }
            continue;
        }
        let source_line = if current_line == 0 { 1 } else { current_line };
        if let Some(rule) = parse_rule(line, source_line, &current_path)? {
            rules.push(rule);
        }
    }
    let state = state_rows
        .iter()
        .map(|row| row.text.as_str())
        .collect::<Vec<_>>()
        .join("\n");
    Ok(ParsedProgram { rules, state })
}

/// Rewrite the RE2 brace and `\Q...\E` forms the `regex` crate rejects.
///
/// RE2 treats `{` as a literal when it is not a counted repetition. The
/// `regex` crate always treats `{` as syntax. `\Q...\E` is literal text in
/// RE2 and is not syntax in `regex`.
pub fn translate_re2(pattern: &str) -> String {
    let chars: Vec<char> = pattern.chars().collect();
    let mut out = String::new();
    let mut index = 0;
    let mut atom = false;
    while index < chars.len() {
        if chars[index] == '\\' && chars.get(index + 1) == Some(&'Q') {
            index += 2;
            while index < chars.len() {
                if chars[index] == '\\' && chars.get(index + 1) == Some(&'E') {
                    index += 2;
                    break;
                }
                push_quoted(&mut out, chars[index]);
                atom = true;
                index += 1;
            }
            continue;
        }
        if chars[index] == '\\' {
            let next = copy_escape(&chars, index, &mut out);
            atom = true;
            index = next;
            continue;
        }
        if chars[index] == '[' {
            index = copy_class(&chars, index, &mut out);
            atom = true;
            continue;
        }
        if chars[index] == '(' {
            if let Some(len) = flag_only_len(&chars, index) {
                for ch in &chars[index..index + len] {
                    out.push(*ch);
                }
                index += len;
                atom = false;
                continue;
            }
            out.push('(');
            index += 1;
            atom = false;
            continue;
        }
        if chars[index] == ')' {
            out.push(')');
            index += 1;
            atom = true;
            continue;
        }
        if chars[index] == '{' {
            if let Some(end) = quantifier_end(&chars, index) {
                if atom && quantifier_bounds_ok(&chars[index..end]) {
                    for ch in &chars[index..end] {
                        out.push(*ch);
                    }
                    index = end;
                    atom = false;
                    continue;
                }
            }
            out.push_str("\\{");
            index += 1;
            atom = true;
            continue;
        }
        if matches!(chars[index], '*' | '+' | '?') {
            let group_marker = out.ends_with('(');
            out.push(chars[index]);
            index += 1;
            if !group_marker {
                atom = false;
            }
            continue;
        }
        if matches!(chars[index], '|' | '^' | '$') {
            out.push(chars[index]);
            index += 1;
            atom = false;
            continue;
        }
        out.push(chars[index]);
        index += 1;
        atom = true;
    }
    out
}

fn push_quoted(out: &mut String, ch: char) {
    if matches!(
        ch,
        '\\' | '.' | '+' | '*' | '?' | '(' | ')' | '|' | '[' | ']' | '{' | '}' | '^' | '$'
    ) {
        out.push('\\');
    }
    out.push(ch);
}

fn copy_escape(chars: &[char], start: usize, out: &mut String) -> usize {
    out.push('\\');
    let mut index = start + 1;
    if index >= chars.len() {
        return index;
    }
    let marker = chars[index];
    out.push(marker);
    index += 1;
    if (marker == 'x' || marker == 'p' || marker == 'P') && chars.get(index) == Some(&'{') {
        out.push('{');
        index += 1;
        while index < chars.len() && chars[index] != '}' {
            out.push(chars[index]);
            index += 1;
        }
        if index < chars.len() {
            out.push('}');
            index += 1;
        }
        return index;
    }
    if marker == 'x' || marker == 'u' || marker == 'U' {
        let width = if marker == 'x' {
            2
        } else if marker == 'u' {
            4
        } else {
            8
        };
        for _ in 0..width {
            if index < chars.len() && chars[index].is_ascii_hexdigit() {
                out.push(chars[index]);
                index += 1;
            } else {
                break;
            }
        }
    }
    index
}

fn copy_class(chars: &[char], start: usize, out: &mut String) -> usize {
    out.push('[');
    let mut index = start + 1;
    if chars.get(index) == Some(&'^') {
        out.push('^');
        index += 1;
    }
    if chars.get(index) == Some(&']') {
        out.push(']');
        index += 1;
    }
    while index < chars.len() {
        if chars[index] == '\\' {
            index = copy_escape(chars, index, out);
            continue;
        }
        if chars[index] == '[' && chars.get(index + 1) == Some(&':') {
            out.push('[');
            out.push(':');
            index += 2;
            while index < chars.len()
                && !(chars[index] == ':' && chars.get(index + 1) == Some(&']'))
            {
                out.push(chars[index]);
                index += 1;
            }
            if index < chars.len() {
                out.push(':');
                out.push(']');
                index += 2;
            }
            continue;
        }
        let ch = chars[index];
        out.push(ch);
        index += 1;
        if ch == ']' {
            break;
        }
    }
    index
}

fn flag_only_len(chars: &[char], start: usize) -> Option<usize> {
    if chars.get(start + 1) != Some(&'?') {
        return None;
    }
    let mut index = start + 2;
    let mut flags = 0;
    let mut minus = false;
    while index < chars.len() {
        match chars[index] {
            'i' | 'm' | 's' | 'U' | 'x' | 'u' => {
                flags += 1;
                index += 1;
            }
            '-' if !minus => {
                minus = true;
                index += 1;
            }
            ')' if flags > 0 => return Some(index + 1 - start),
            _ => return None,
        }
    }
    None
}

fn quantifier_end(chars: &[char], start: usize) -> Option<usize> {
    if chars.get(start) != Some(&'{') {
        return None;
    }
    let mut index = start + 1;
    if index >= chars.len() || !chars[index].is_ascii_digit() {
        return None;
    }
    while index < chars.len() && chars[index].is_ascii_digit() {
        index += 1;
    }
    if chars.get(index) == Some(&',') {
        index += 1;
        while index < chars.len() && chars[index].is_ascii_digit() {
            index += 1;
        }
    }
    if chars.get(index) == Some(&'}') {
        Some(index + 1)
    } else {
        None
    }
}

fn quantifier_bounds_ok(text: &[char]) -> bool {
    let body: String = text[1..text.len() - 1].iter().collect();
    if let Some((left, right)) = body.split_once(',') {
        let Ok(low) = left.parse::<u128>() else {
            return false;
        };
        if right.is_empty() {
            return true;
        }
        let Ok(high) = right.parse::<u128>() else {
            return false;
        };
        low <= high
    } else {
        body.parse::<u128>().is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn braces_follow_re2() {
        let two = compile_guest("{{2}}").unwrap();
        assert!(two.is_match("{{}"));
        assert!(!two.is_match("{{"));
        let open = compile_guest("{{").unwrap();
        assert!(open.is_match("{{"));
        assert!(!open.is_match("{"));
        let rep = compile_guest("a{2}").unwrap();
        assert!(rep.is_match("aa"));
        assert!(!rep.is_match("a"));
        let esc = compile_guest(r"\{\{foo\}\}").unwrap();
        assert!(esc.is_match("{{foo}}"));
        assert!(!esc.is_match("foo"));
    }

    #[test]
    fn named_groups_and_multiline() {
        let re = compile_guest("^(?<name>[A-Za-z]+)$").unwrap();
        let caps = re.captures("1\nAda").unwrap();
        assert_eq!(caps.name("name").unwrap().as_str(), "Ada");
    }

    #[test]
    fn quoted_literal_and_anchors() {
        let re = compile_guest(r"\Q.\E").unwrap();
        assert!(re.is_match("."));
        assert!(!re.is_match("a"));
        let anchored = compile_guest(r"\Aa\z").unwrap();
        assert!(anchored.is_match("a"));
        assert!(!anchored.is_match("a\n"));
    }
}
