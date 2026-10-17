//! Literal prefix of a rule pattern, matching the Go engine.
//!
//! A miss on this text cannot be a match, so the runner skips the regex and
//! does not count a regex eval. A hit still runs the regex.

#[derive(Clone, Copy, PartialEq, Eq)]
enum Status {
    Cont,
    Stop,
    Block,
    Flags,
    Cap,
}

struct Bad;

#[derive(Clone, Copy)]
struct Flags {
    multiline: bool,
    fold: bool,
}

impl Flags {
    fn new() -> Self {
        Self { multiline: false, fold: false }
    }
}

const INF: i32 = -1;
const MAX_REPEAT: i32 = 100_000;

pub fn literal_prefix(lhs: &str) -> String {
    if lhs.contains("(?i") {
        return String::new();
    }
    let body = lhs.strip_prefix('^').unwrap_or(lhs);
    let chars: Vec<char> = body.chars().collect();
    let one_pass = one_pass(&chars, body);
    match sequence(&chars, 0, Flags::new(), true, false, one_pass) {
        Ok((text, _, index)) if index == chars.len() => text,
        _ => String::new(),
    }
}

fn one_pass(chars: &[char], body: &str) -> bool {
    let Ok(leading) = leading_begin_text(chars) else {
        return false;
    };
    if !leading {
        return false;
    }
    let Ok(alt) = alt_present(chars) else {
        return false;
    };
    if alt && !end_anchored(body) {
        return false;
    }
    !swallows_next(body)
}

fn swallows_next(body: &str) -> bool {
    for token in ["[\\s\\S]*", "[\\s\\S]+", "[\\S\\s]*", "[\\S\\s]+", "[\\s\\S]?", "[\\S\\s]?"] {
        let mut start = 0;
        while let Some(found) = body[start..].find(token) {
            let found = start + found;
            let mut cursor = found + token.len();
            if body[cursor..].starts_with('?') {
                cursor += 1;
            }
            while body[cursor..].starts_with(')') {
                cursor += 1;
            }
            let rest = &body[cursor..];
            if !rest.is_empty() && !rest.starts_with("\\z") && !rest.starts_with('$') {
                return true;
            }
            start = found + token.len();
        }
    }
    false
}

fn leading_begin_text(body: &[char]) -> Result<bool, Bad> {
    let mut index = 0;
    let mut multiline = false;
    while index < body.len() {
        if starts(body, index, "(?P<") || starts(body, index, "(?<") {
            return Ok(false);
        }
        if starts(body, index, "(?:") {
            index += 3;
            continue;
        }
        if starts(body, index, "(?") {
            index += 2;
            let mut sign = 1;
            let mut saw = false;
            while index < body.len() && body[index] != ':' && body[index] != ')' {
                let char = body[index];
                index += 1;
                if char == '-' {
                    sign = -1;
                    saw = false;
                    continue;
                }
                if char == 'm' {
                    multiline = sign > 0;
                }
                saw = true;
            }
            if index >= body.len() {
                return Ok(false);
            }
            if body[index] == ':' {
                index += 1;
                continue;
            }
            index += 1;
            let _ = saw;
            continue;
        }
        if body[index] == '(' {
            return Ok(false);
        }
        if starts(body, index, "\\A") {
            return Ok(true);
        }
        if body[index] == '^' {
            return Ok(!multiline);
        }
        return Ok(false);
    }
    Ok(false)
}

fn end_anchored(body: &str) -> bool {
    if body.contains("(?m") {
        body.ends_with("\\z")
    } else {
        body.ends_with("\\z") || body.ends_with('$')
    }
}

fn alt_present(body: &[char]) -> Result<bool, Bad> {
    let mut index = 0;
    while index < body.len() {
        if starts(body, index, "\\Q") {
            let end = find_from(body, index + 2, "\\E");
            index = end.map(|at| at + 2).unwrap_or(body.len());
            continue;
        }
        if body[index] == '\\' {
            index += 2;
            continue;
        }
        if body[index] == '[' {
            index = class_span(body, index)?.0;
            continue;
        }
        if body[index] == '|' {
            return Ok(true);
        }
        index += 1;
    }
    Ok(false)
}

fn sequence(
    pattern: &[char],
    mut index: usize,
    mut flags: Flags,
    mut at_start: bool,
    stop_paren: bool,
    one_pass: bool,
) -> Result<(String, Status, usize), Bad> {
    let mut branches: Vec<Vec<(String, Status)>> = vec![Vec::new()];
    while index < pattern.len() {
        if stop_paren && pattern[index] == ')' {
            break;
        }
        if pattern[index] == '|' {
            branches.push(Vec::new());
            index += 1;
            at_start = true;
            continue;
        }
        let (text, status, next, next_flags, next_start) = atom(pattern, index, flags, at_start, one_pass)?;
        index = next;
        flags = next_flags;
        at_start = next_start;
        if status == Status::Flags {
            continue;
        }
        let (minimum, maximum, next) = quantifier(pattern, index)?;
        index = next;
        let (text, status) = apply_quantifier(&text, status, minimum, maximum);
        if status == Status::Cont && text.is_empty() {
            continue;
        }
        branches.last_mut().unwrap().push((text, status));
        if status != Status::Cap {
            at_start = false;
        }
    }
    let folded: Vec<(String, Status)> = branches.into_iter().map(|branch| fold(&branch)).collect();
    if folded.len() == 1 {
        let (text, status) = folded.into_iter().next().unwrap();
        return Ok((text, status, index));
    }
    let (text, status) = common(&folded);
    Ok((text, status, index))
}

fn common(folded: &[(String, Status)]) -> (String, Status) {
    let mut texts = Vec::new();
    for (text, status) in folded {
        if *status == Status::Block {
            return (String::new(), Status::Block);
        }
        texts.push(text.as_str());
    }
    let mut shared: Vec<char> = texts[0].chars().collect();
    for text in texts.iter().skip(1) {
        let other: Vec<char> = text.chars().collect();
        let limit = shared.len().min(other.len());
        let mut size = 0;
        while size < limit && shared[size] == other[size] {
            size += 1;
        }
        shared.truncate(size);
    }
    if shared.is_empty() {
        return (String::new(), Status::Block);
    }
    let common: String = shared.into_iter().collect();
    if folded.iter().all(|(text, status)| *status == Status::Cont && text == &common) {
        return (common, Status::Cont);
    }
    (common, Status::Stop)
}

fn fold(atoms: &[(String, Status)]) -> (String, Status) {
    let mut text = String::new();
    let mut saw_cap = false;
    for (atom, status) in atoms {
        if *status == Status::Cap {
            saw_cap = true;
            continue;
        }
        if *status == Status::Block {
            return (text.clone(), if text.is_empty() { Status::Block } else { Status::Stop });
        }
        text.push_str(atom);
        if *status == Status::Stop {
            return (text, Status::Stop);
        }
    }
    if saw_cap && text.is_empty() {
        return (String::new(), Status::Cap);
    }
    (text, Status::Cont)
}

fn atom(
    pattern: &[char],
    index: usize,
    flags: Flags,
    at_start: bool,
    one_pass: bool,
) -> Result<(String, Status, usize, Flags, bool), Bad> {
    if index >= pattern.len() {
        return Err(Bad);
    }
    let char = pattern[index];
    if char == '^' {
        if flags.multiline || !at_start || !one_pass {
            return Ok((String::new(), Status::Block, index + 1, flags, false));
        }
        return Ok((String::new(), Status::Cont, index + 1, flags, true));
    }
    if char == '$' || char == '.' {
        return Ok((String::new(), Status::Block, index + 1, flags, false));
    }
    if char == '[' {
        let (end, rune) = class_span(pattern, index)?;
        if rune.is_none() || flags.fold {
            return Ok((String::new(), Status::Block, end, flags, false));
        }
        return Ok((rune.unwrap().to_string(), Status::Cont, end, flags, false));
    }
    if char == '(' {
        return group(pattern, index, flags, at_start, one_pass);
    }
    if char == '\\' {
        return escape(pattern, index, flags, at_start, one_pass);
    }
    if "*+?)|".contains(char) {
        return Err(Bad);
    }
    if flags.fold {
        return Ok((String::new(), Status::Block, index + 1, flags, false));
    }
    Ok((char.to_string(), Status::Cont, index + 1, flags, false))
}

fn group(
    pattern: &[char],
    index: usize,
    flags: Flags,
    at_start: bool,
    one_pass: bool,
) -> Result<(String, Status, usize, Flags, bool), Bad> {
    let capturing = true;
    let mut index = index;
    if starts(pattern, index, "(?") {
        if let Some(named) = named_capture(pattern, index)? {
            index = named;
        } else {
            return perl_group(pattern, index, flags, at_start, one_pass);
        }
    } else {
        index += 1;
    }
    let (text, status, index) = sequence(pattern, index, flags, at_start, true, one_pass)?;
    if index >= pattern.len() || pattern[index] != ')' {
        return Err(Bad);
    }
    let index = index + 1;
    if one_pass && capturing {
        return Ok((String::new(), Status::Block, index, flags, false));
    }
    if capturing && status == Status::Cont && text.is_empty() {
        return Ok((String::new(), Status::Cap, index, flags, at_start));
    }
    let still_start = at_start && status == Status::Cont && text.is_empty();
    Ok((text, status, index, flags, still_start))
}

fn named_capture(pattern: &[char], index: usize) -> Result<Option<usize>, Bad> {
    let start = if starts(pattern, index, "(?P<") {
        index + 4
    } else if starts(pattern, index, "(?<") {
        index + 3
    } else {
        return Ok(None);
    };
    let Some(end) = find_from(pattern, start, ">") else {
        return Err(Bad);
    };
    if end == start {
        return Err(Bad);
    }
    let name = &pattern[start..end];
    if name.iter().any(|char| *char != '_' && !char.is_alphanumeric()) {
        return Err(Bad);
    }
    Ok(Some(end + 1))
}

fn perl_group(
    pattern: &[char],
    index: usize,
    flags: Flags,
    at_start: bool,
    one_pass: bool,
) -> Result<(String, Status, usize, Flags, bool), Bad> {
    let mut cursor = index + 2;
    let mut sign = 1;
    let mut saw = false;
    let mut updated = flags;
    while cursor < pattern.len() {
        let char = pattern[cursor];
        if char == ':' || char == ')' {
            if sign < 0 && !saw {
                return Err(Bad);
            }
            cursor += 1;
            if char == ')' {
                return Ok((String::new(), Status::Flags, cursor, updated, at_start));
            }
            let (text, status, cursor) = sequence(pattern, cursor, updated, at_start, true, one_pass)?;
            if cursor >= pattern.len() || pattern[cursor] != ')' {
                return Err(Bad);
            }
            let still_start = at_start && status == Status::Cont && text.is_empty();
            return Ok((text, status, cursor + 1, flags, still_start));
        }
        if char == '-' {
            if sign < 0 {
                return Err(Bad);
            }
            sign = -1;
            saw = false;
            cursor += 1;
            continue;
        }
        if !"imsU".contains(char) {
            return Err(Bad);
        }
        saw = true;
        let enabled = sign > 0;
        if char == 'i' {
            updated.fold = enabled;
        } else if char == 'm' {
            updated.multiline = enabled;
        }
        cursor += 1;
    }
    Err(Bad)
}

fn escape(
    pattern: &[char],
    index: usize,
    flags: Flags,
    at_start: bool,
    one_pass: bool,
) -> Result<(String, Status, usize, Flags, bool), Bad> {
    if index + 1 >= pattern.len() {
        return Err(Bad);
    }
    if starts(pattern, index, "\\Q") {
        let end = find_from(pattern, index + 2, "\\E");
        let literal: String = match end {
            None => pattern[index + 2..].iter().collect(),
            Some(end) => pattern[index + 2..end].iter().collect(),
        };
        let index = end.map(|at| at + 2).unwrap_or(pattern.len());
        if flags.fold && !literal.is_empty() {
            return Ok((String::new(), Status::Block, index, flags, false));
        }
        let still = at_start && literal.is_empty();
        return Ok((literal, Status::Cont, index, flags, still));
    }
    let char = pattern[index + 1];
    if char == 'A' {
        if at_start && one_pass {
            return Ok((String::new(), Status::Cont, index + 2, flags, true));
        }
        return Ok((String::new(), Status::Block, index + 2, flags, false));
    }
    if "zZbBdDwWsS".contains(char) {
        if char == 'Z' {
            return Err(Bad);
        }
        return Ok((String::new(), Status::Block, index + 2, flags, false));
    }
    let (literal, index) = literal_escape(pattern, index)?;
    if flags.fold {
        return Ok((String::new(), Status::Block, index, flags, false));
    }
    Ok((literal, Status::Cont, index, flags, false))
}

fn literal_escape(pattern: &[char], index: usize) -> Result<(String, usize), Bad> {
    if index + 1 >= pattern.len() {
        return Err(Bad);
    }
    let char = pattern[index + 1];
    let rest = index + 2;
    if ('0'..='7').contains(&char) {
        if char != '0' && (rest >= pattern.len() || !('0'..='7').contains(&pattern[rest])) {
            return Err(Bad);
        }
        let mut value = char as u32 - '0' as u32;
        let mut consumed = 1;
        let mut cursor = rest;
        while consumed < 3 && cursor < pattern.len() && ('0'..='7').contains(&pattern[cursor]) {
            value = value * 8 + pattern[cursor] as u32 - '0' as u32;
            cursor += 1;
            consumed += 1;
        }
        let Some(decoded) = char::from_u32(value) else {
            return Err(Bad);
        };
        return Ok((decoded.to_string(), cursor));
    }
    if char == 'x' {
        if rest >= pattern.len() {
            return Err(Bad);
        }
        if pattern[rest] == '{' {
            let mut cursor = rest + 1;
            let mut digits = String::new();
            while cursor < pattern.len() && pattern[cursor] != '}' {
                let digit = pattern[cursor];
                if !digit.is_ascii_hexdigit() {
                    return Err(Bad);
                }
                digits.push(digit);
                cursor += 1;
                let parsed = u32::from_str_radix(&digits, 16).map_err(|_| Bad)?;
                if parsed > 0x10FFFF {
                    return Err(Bad);
                }
            }
            if digits.is_empty() || cursor >= pattern.len() || pattern[cursor] != '}' {
                return Err(Bad);
            }
            let parsed = u32::from_str_radix(&digits, 16).map_err(|_| Bad)?;
            let Some(decoded) = char::from_u32(parsed) else {
                return Err(Bad);
            };
            return Ok((decoded.to_string(), cursor + 1));
        }
        if rest + 2 > pattern.len() {
            return Err(Bad);
        }
        let pair: String = pattern[rest..rest + 2].iter().collect();
        if !pair.chars().all(|item| item.is_ascii_hexdigit()) {
            return Err(Bad);
        }
        let parsed = u32::from_str_radix(&pair, 16).map_err(|_| Bad)?;
        let Some(decoded) = char::from_u32(parsed) else {
            return Err(Bad);
        };
        return Ok((decoded.to_string(), index + 4));
    }
    let named = match char {
        'a' => Some('\u{0007}'),
        'f' => Some('\u{000c}'),
        'n' => Some('\n'),
        'r' => Some('\r'),
        't' => Some('\t'),
        'v' => Some('\u{000b}'),
        _ => None,
    };
    if let Some(decoded) = named {
        return Ok((decoded.to_string(), index + 2));
    }
    if char.is_ascii() && !char.is_alphanumeric() {
        return Ok((char.to_string(), index + 2));
    }
    if char == '_' {
        return Ok((char.to_string(), index + 2));
    }
    Err(Bad)
}

fn class_span(pattern: &[char], mut index: usize) -> Result<(usize, Option<char>), Bad> {
    if pattern.get(index) != Some(&'[') {
        return Err(Bad);
    }
    index += 1;
    let mut negated = false;
    if index < pattern.len() && pattern[index] == '^' {
        negated = true;
        index += 1;
    }
    let mut runes = Vec::new();
    let mut ranged = false;
    let mut posix = false;
    if index < pattern.len() && pattern[index] == ']' {
        runes.push(']');
        index += 1;
    }
    while index < pattern.len() && pattern[index] != ']' {
        if starts(pattern, index, "[:") {
            let Some(end) = find_from(pattern, index + 2, ":]") else {
                return Err(Bad);
            };
            posix = true;
            index = end + 2;
            continue;
        }
        if pattern[index] == '\\' {
            match literal_escape(pattern, index) {
                Ok((literal, next)) => {
                    let mut chars = literal.chars();
                    let Some(rune) = chars.next() else {
                        return Err(Bad);
                    };
                    if chars.next().is_some() {
                        posix = true;
                    } else {
                        runes.push(rune);
                    }
                    index = next;
                }
                Err(_) => {
                    if index + 1 >= pattern.len() {
                        return Err(Bad);
                    }
                    index += 2;
                    posix = true;
                    continue;
                }
            }
        } else {
            runes.push(pattern[index]);
            index += 1;
        }
        if index + 1 < pattern.len() && pattern[index] == '-' && pattern[index + 1] != ']' {
            ranged = true;
            index += 1;
        }
    }
    if index >= pattern.len() || pattern[index] != ']' {
        return Err(Bad);
    }
    index += 1;
    if !negated && !ranged && !posix && runes.len() == 1 {
        return Ok((index, Some(runes[0])));
    }
    Ok((index, None))
}

fn quantifier(pattern: &[char], index: usize) -> Result<(i32, i32, usize), Bad> {
    if index >= pattern.len() {
        return Ok((1, 1, index));
    }
    let char = pattern[index];
    let (minimum, maximum, mut index) = if char == '*' {
        (0, INF, index + 1)
    } else if char == '+' {
        (1, INF, index + 1)
    } else if char == '?' {
        (0, 1, index + 1)
    } else if char == '{' {
        match repeat(pattern, index)? {
            None => return Ok((1, 1, index)),
            Some(parsed) => parsed,
        }
    } else {
        return Ok((1, 1, index));
    };
    if index < pattern.len() && pattern[index] == '?' {
        index += 1;
    }
    Ok((minimum, maximum, index))
}

fn repeat(pattern: &[char], index: usize) -> Result<Option<(i32, i32, usize)>, Bad> {
    if pattern[index] != '{' {
        return Ok(None);
    }
    let mut cursor = index + 1;
    let (minimum, next) = integer(pattern, cursor);
    cursor = next;
    let Some(minimum) = minimum else {
        return Ok(None);
    };
    if cursor >= pattern.len() {
        return Ok(None);
    }
    let maximum = if pattern[cursor] != ',' {
        minimum
    } else {
        cursor += 1;
        if cursor < pattern.len() && pattern[cursor] == '}' {
            INF
        } else {
            let (maximum, next) = integer(pattern, cursor);
            cursor = next;
            let Some(maximum) = maximum else {
                return Ok(None);
            };
            maximum
        }
    };
    if cursor >= pattern.len() || pattern[cursor] != '}' {
        return Ok(None);
    }
    if minimum < 0 || (maximum >= 0 && maximum < minimum) {
        return Err(Bad);
    }
    if minimum > MAX_REPEAT || maximum > MAX_REPEAT {
        return Err(Bad);
    }
    Ok(Some((minimum, maximum, cursor + 1)))
}

fn integer(pattern: &[char], mut index: usize) -> (Option<i32>, usize) {
    if index >= pattern.len() || !pattern[index].is_ascii_digit() {
        return (None, index);
    }
    if pattern[index] == '0' && index + 1 < pattern.len() && pattern[index + 1].is_ascii_digit() {
        return (None, index);
    }
    let mut value: i32 = 0;
    while index < pattern.len() && pattern[index].is_ascii_digit() {
        value = value * 10 + pattern[index] as i32 - '0' as i32;
        if value >= 100_000_000 {
            return (Some(-1), index);
        }
        index += 1;
    }
    (Some(value), index)
}

fn apply_quantifier(text: &str, status: Status, minimum: i32, maximum: i32) -> (String, Status) {
    if minimum == 1 && maximum == 1 {
        return (text.to_string(), status);
    }
    if status == Status::Cap {
        if minimum == maximum {
            if minimum == 0 {
                return (String::new(), Status::Cont);
            }
            return (String::new(), Status::Cap);
        }
        return (String::new(), Status::Block);
    }
    if status == Status::Cont && text.is_empty() {
        return (String::new(), Status::Cont);
    }
    if minimum == 0 && maximum == 0 {
        return (String::new(), Status::Cont);
    }
    if status == Status::Cont {
        if minimum == 0 {
            return (String::new(), Status::Block);
        }
        let repeated = text.repeat(minimum as usize);
        if maximum == minimum {
            return (repeated, Status::Cont);
        }
        return (repeated, Status::Stop);
    }
    if status == Status::Stop {
        if minimum == 0 {
            return (String::new(), Status::Block);
        }
        return (text.to_string(), Status::Stop);
    }
    if minimum == 0 && maximum == 0 {
        return (String::new(), Status::Cont);
    }
    (String::new(), Status::Block)
}

fn starts(pattern: &[char], index: usize, text: &str) -> bool {
    let mut cursor = index;
    for char in text.chars() {
        if cursor >= pattern.len() || pattern[cursor] != char {
            return false;
        }
        cursor += 1;
    }
    true
}

fn find_from(pattern: &[char], index: usize, text: &str) -> Option<usize> {
    let needle: Vec<char> = text.chars().collect();
    if needle.is_empty() {
        return Some(index);
    }
    pattern[index..]
        .windows(needle.len())
        .position(|window| window == needle.as_slice())
        .map(|offset| index + offset)
}

#[cfg(test)]
mod tests {
    use super::literal_prefix;

    #[test]
    fn prefixes_match_the_go_engine() {
        let cases = [
            ("()*a", ""),
            ("()a", "a"),
            ("(?:^a)", "a"),
            ("(foo)bar", "foobar"),
            ("a[]b]{0}c", "ac"),
            ("^(?:[z])$", "z"),
            ("(?i)ABC", ""),
            ("a{3}b", "aaab"),
            ("(?:ab){2}", "abab"),
            ("a.{0}b", "ab"),
            ("foo(?:bar){0}baz", "foobaz"),
            ("a+b", "a"),
            ("a{2,}b", "aa"),
            ("a*b", ""),
            ("ab*c", "a"),
            ("a(?:)*b", "ab"),
            ("{01}", "{01}"),
            (r"\A\{(?<bad>[\s\S]*)\z", "{"),
            (r"\Ag:0\ni:4\nbuy:(?<b>4)\n\z", "g:0\ni:4\nbuy:"),
        ];
        for (lhs, prefix) in cases {
            assert_eq!(literal_prefix(lhs), prefix, "{lhs}");
        }
    }
}
