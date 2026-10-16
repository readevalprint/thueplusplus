//! Exact-rational numeric builtins and the string builtins.

use std::collections::HashSet;
use std::sync::OnceLock;

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use num_bigint::{BigInt, BigUint};
use num_rational::BigRational;
use num_traits::{Signed, Zero};
use regex::Regex;

pub const MAX_NUMERIC_LITERAL_CHARS: usize = 4096;

/// Canonical numeric literal grammar from docs/numeric-builtins.md.
const NUMERIC_GRAMMAR: &str = r"-?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)";

fn numeric_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(&format!("^{NUMERIC_GRAMMAR}$")).expect("numeric grammar"))
}

fn zero_denominator_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| Regex::new(r"^-?[0-9]+/0+$").expect("zero denominator grammar"))
}

pub fn builtin_arity(name: &str) -> Option<usize> {
    Some(match name {
        "eq" | "add" | "sub" | "mul" | "div" | "mod" | "numeq" | "lt" | "le" | "gt" | "ge" => 2,
        "num" | "b64enc" | "b64dec" | "pctenc" | "pctdec" | "escape" | "unescape" => 1,
        _ => return None,
    })
}

pub fn is_word(value: &str) -> bool {
    !value.is_empty()
        && value
            .chars()
            .all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

pub fn is_name(value: &str) -> bool {
    let mut chars = value.chars();
    match chars.next() {
        Some(ch) if ch.is_ascii_alphabetic() || ch == '_' => {}
        _ => return false,
    }
    chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

pub fn parse_builtin_call(
    rhs: &str,
    line_number: usize,
    captures: &HashSet<String>,
) -> Result<(String, Vec<String>), String> {
    let tokens: Vec<&str> = rhs.split_whitespace().collect();
    if tokens.is_empty() {
        return Err(format!("Line {line_number}: ::! requires a builtin name"));
    }
    let name = tokens[0];
    let Some(expected) = builtin_arity(name) else {
        return Err(format!("Line {line_number}: Unknown builtin '{name}'"));
    };
    let args: Vec<&str> = tokens[1..].to_vec();
    if args.len() != expected {
        return Err(format!(
            "Line {line_number}: Builtin '{name}' expects {expected} args, got {}",
            args.len()
        ));
    }
    for arg in &args {
        if !is_name(arg) {
            return Err(format!(
                "Line {line_number}: ::! arguments must be capture names, got '{arg}'"
            ));
        }
        if !captures.contains(*arg) {
            return Err(format!(
                "Line {line_number}: ::! argument '{arg}' is not a named capture"
            ));
        }
    }
    Ok((
        name.to_string(),
        args.into_iter().map(str::to_string).collect(),
    ))
}

pub fn pct_encode(value: &str) -> String {
    let mut out = String::new();
    for byte in value.as_bytes() {
        if byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b'-') {
            out.push(*byte as char);
        } else {
            out.push_str(&format!("%{byte:02X}"));
        }
    }
    out
}

pub fn pct_decode(value: &str) -> Result<String, String> {
    let bytes = value.as_bytes();
    let mut data = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' {
            if index + 2 >= bytes.len() {
                return Err("PCT payload has incomplete percent escape".to_string());
            }
            let hex = &value[index + 1..index + 3];
            if !hex
                .bytes()
                .all(|ch| ch.is_ascii_digit() || (b'A'..=b'F').contains(&ch))
            {
                return Err("PCT payload has malformed or non-canonical percent escape".to_string());
            }
            let parsed = u8::from_str_radix(hex, 16)
                .map_err(|err| format!("PCT payload has malformed percent escape: {err}"))?;
            data.push(parsed);
            index += 3;
        } else {
            let ch = bytes[index];
            if !(ch.is_ascii_alphanumeric() || matches!(ch, b'_' | b'.' | b'-')) {
                return Err("PCT payload contains unencoded unsafe byte".to_string());
            }
            data.push(ch);
            index += 1;
        }
    }
    String::from_utf8(data).map_err(|_| "PCT payload decoded bytes are not valid UTF-8".to_string())
}

pub fn b64url_encode(value: &str) -> String {
    URL_SAFE_NO_PAD.encode(value.as_bytes())
}

pub fn b64url_decode(value: &str) -> Result<String, String> {
    if value.contains('=') {
        return Err("Builtin 'b64dec' expected unpadded Base64url input".to_string());
    }
    if !value
        .chars()
        .all(|ch| ch.is_ascii_alphanumeric() || ch == '-' || ch == '_')
    {
        return Err("Builtin 'b64dec' expected Base64url input".to_string());
    }
    if value.len() % 4 == 1 {
        return Err("Builtin 'b64dec' invalid Base64url length".to_string());
    }
    let decoded = URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|err| format!("Builtin 'b64dec' invalid Base64url input: {err}"))?;
    let text = String::from_utf8(decoded)
        .map_err(|_| "Builtin 'b64dec' decoded bytes are not valid UTF-8".to_string())?;
    if b64url_encode(&text) != value {
        return Err("Builtin 'b64dec' expected canonical unpadded Base64url input".to_string());
    }
    Ok(text)
}

fn escape_text(value: &str) -> Result<String, String> {
    let text = pct_decode(value)?;
    let mut out = String::new();
    for ch in text.chars() {
        match ch {
            '\\' => out.push_str(r"\\"),
            '"' => out.push_str(r#"\""#),
            '\n' => out.push_str(r"\n"),
            '\t' => out.push_str(r"\t"),
            '\r' => out.push_str(r"\r"),
            '\u{0008}' => out.push_str(r"\b"),
            '\u{000c}' => out.push_str(r"\f"),
            other => out.push(other),
        }
    }
    Ok(pct_encode(&out))
}

fn unescape_text(value: &str) -> Result<String, String> {
    let text = pct_decode(value)?;
    let chars: Vec<char> = text.chars().collect();
    let mut out = String::new();
    let mut index = 0;
    while index < chars.len() {
        if chars[index] != '\\' {
            out.push(chars[index]);
            index += 1;
            continue;
        }
        if index + 1 >= chars.len() {
            return Err("Builtin 'unescape' has trailing backslash escape".to_string());
        }
        index += 1;
        match chars[index] {
            '\\' => out.push('\\'),
            '"' => out.push('"'),
            'n' => out.push('\n'),
            't' => out.push('\t'),
            'r' => out.push('\r'),
            'b' => out.push('\u{0008}'),
            'f' => out.push('\u{000c}'),
            other => {
                return Err(format!("Builtin 'unescape' unsupported escape '\\{other}'"));
            }
        }
        index += 1;
    }
    Ok(pct_encode(&out))
}

fn parse_number(value: &str, builtin: &str) -> Result<BigRational, String> {
    if !numeric_re().is_match(value) {
        return Err(format!(
            "Builtin '{builtin}' expected numeric input, got '{value}'"
        ));
    }
    if value.chars().count() > MAX_NUMERIC_LITERAL_CHARS {
        return Err(format!(
            "Builtin '{builtin}' numeric input exceeds maximum length ({MAX_NUMERIC_LITERAL_CHARS} characters)"
        ));
    }
    if zero_denominator_re().is_match(value) {
        return Err(format!(
            "Builtin '{builtin}' fraction denominator must be non-zero"
        ));
    }
    if let Some((numer_text, denom_text)) = value.split_once('/') {
        let numer = parse_int(numer_text)?;
        let denom = parse_int(denom_text)?;
        return Ok(BigRational::new(numer, denom));
    }
    if let Some((whole, frac)) = value.split_once('.') {
        let negative = whole.starts_with('-');
        let digits = if negative {
            format!("{}{frac}", &whole[1..])
        } else {
            format!("{whole}{frac}")
        };
        let mut numer = parse_int(&digits)?;
        if negative {
            numer = -numer;
        }
        let denom = BigInt::from(
            BigUint::from(10u32).pow(u32::try_from(frac.len()).expect("fraction width")),
        );
        return Ok(BigRational::new(numer, denom));
    }
    Ok(BigRational::from_integer(parse_int(value)?))
}

fn parse_int(value: &str) -> Result<BigInt, String> {
    value
        .parse::<BigInt>()
        .map_err(|_| format!("expected integer digits, got '{value}'"))
}

fn format_rat(value: &BigRational) -> String {
    if value.is_integer() {
        value.numer().to_string()
    } else {
        format!("{}/{}", value.numer(), value.denom())
    }
}

pub fn eval_builtin(name: &str, values: &[String]) -> Result<String, String> {
    let expected = builtin_arity(name).ok_or_else(|| {
        format!(
            "internal error: invalid validated builtin '{name}' with {} values",
            values.len()
        )
    })?;
    if values.len() != expected {
        return Err(format!(
            "internal error: invalid validated builtin '{name}' with {} values",
            values.len()
        ));
    }
    match name {
        "eq" => return Ok(if values[0] == values[1] { "1" } else { "0" }.to_string()),
        "b64enc" => return Ok(b64url_encode(&values[0])),
        "b64dec" => return b64url_decode(&values[0]),
        "pctenc" => return Ok(pct_encode(&values[0])),
        "pctdec" => return pct_decode(&values[0]),
        "escape" => return escape_text(&values[0]),
        "unescape" => return unescape_text(&values[0]),
        "num" => {
            let number = parse_number(&values[0], name)?;
            return Ok(format!("<num>{}</num>", format_rat(&number)));
        }
        _ => {}
    }
    let left = parse_number(&values[0], name)?;
    let right = parse_number(&values[1], name)?;
    match name {
        "add" => Ok(format_rat(&(left + right))),
        "sub" => Ok(format_rat(&(left - right))),
        "mul" => Ok(format_rat(&(left * right))),
        "div" => {
            if right.is_zero() {
                return Err("Builtin 'div' division by zero".to_string());
            }
            Ok(format_rat(&(left / right)))
        }
        "mod" => {
            if right.is_zero() {
                return Err("Builtin 'mod' modulo by zero".to_string());
            }
            if !left.is_integer() || !right.is_integer() {
                return Err("Builtin 'mod' expected integer inputs".to_string());
            }
            if left.is_negative() || right.is_negative() {
                return Err("Builtin 'mod' expected non-negative integer inputs".to_string());
            }
            Ok((left.numer() % right.numer()).to_string())
        }
        "numeq" => Ok(if left == right { "1" } else { "0" }.to_string()),
        "lt" => Ok(if left < right { "1" } else { "0" }.to_string()),
        "le" => Ok(if left <= right { "1" } else { "0" }.to_string()),
        "gt" => Ok(if left > right { "1" } else { "0" }.to_string()),
        "ge" => Ok(if left >= right { "1" } else { "0" }.to_string()),
        _ => Err(format!(
            "internal error: validated builtin '{name}' has no evaluator"
        )),
    }
}

pub fn quote_meta(value: &str) -> String {
    let mut out = String::new();
    for ch in value.chars() {
        if matches!(
            ch,
            '\\' | '.' | '+' | '*' | '?' | '(' | ')' | '|' | '[' | ']' | '{' | '}' | '^' | '$'
        ) {
            out.push('\\');
        }
        out.push(ch);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decimal_addition_is_exact() {
        assert_eq!(
            eval_builtin("add", &["0.1".to_string(), "0.2".to_string()]).unwrap(),
            "3/10"
        );
        assert_eq!(
            eval_builtin("num", &["-0.0".to_string()]).unwrap(),
            "<num>0</num>"
        );
        assert_eq!(
            eval_builtin("add", &["0002/0004".to_string(), "1/2".to_string()]).unwrap(),
            "1"
        );
    }
}
