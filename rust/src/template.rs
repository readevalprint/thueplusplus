//! `::=` / `::>` templates and `::|` hole filling.

use std::collections::HashMap;

use crate::builtin::{is_name, is_word, pct_decode, pct_encode, quote_meta};

pub fn decode_replacement_escapes(text: &str) -> String {
    let placeholder = "\u{0000}BACKSLASH\u{0000}";
    let text = text.replace(r"\\", placeholder);
    let text = text.replace(r"\n", "\n");
    let text = text.replace(r"\t", "\t");
    let text = text.replace(r"\r", "\r");
    text.replace(placeholder, r"\")
}

pub fn expand_template(
    template: &str,
    groups: &HashMap<String, String>,
    extra: &HashMap<String, String>,
) -> Result<String, String> {
    let mut raw = groups.clone();
    for (key, value) in extra {
        raw.insert(key.clone(), value.clone());
    }
    let mut vars = HashMap::new();
    for (key, value) in &raw {
        vars.insert(key.clone(), value.replace('\\', r"\\"));
    }
    let chars: Vec<char> = template.chars().collect();
    let mut out = String::new();
    let mut index = 0;
    while index < chars.len() {
        if chars[index] == '{' && chars.get(index + 1) == Some(&'{') {
            if let Some(rel) = find_close(&chars, index + 2) {
                let inside: String = chars[index + 2..index + 2 + rel].iter().collect();
                if inside.contains('|') {
                    let parts: Vec<&str> = inside.split('|').collect();
                    if parts.len() != 2 || !is_name(parts[0]) || !is_name(parts[1]) {
                        return Err(format!("Malformed template filter '{{{{{inside}}}}}'"));
                    }
                    let Some(value) = raw.get(parts[0]) else {
                        return Err(format!("Missing template capture '{}'", parts[0]));
                    };
                    match parts[1] {
                        "pctenc" => out.push_str(&pct_encode(value)),
                        "pctdec" => out.push_str(&pct_decode(value)?),
                        other => return Err(format!("Unknown template filter '{other}'")),
                    }
                    index += 2 + rel + 2;
                    continue;
                }
                if is_word(&inside) {
                    if let Some(value) = vars.get(&inside) {
                        out.push_str(value);
                    }
                    index += 2 + rel + 2;
                    continue;
                }
            }
        }
        if chars[index] == '{' && chars.get(index + 1) == Some(&'{') {
            out.push(chars[index]);
            index += 1;
            continue;
        }
        let start = index;
        while index < chars.len() && !(chars[index] == '{' && chars.get(index + 1) == Some(&'{')) {
            index += 1;
        }
        let literal: String = chars[start..index].iter().collect();
        out.push_str(&decode_replacement_escapes(&literal));
    }
    Ok(out)
}

fn find_close(chars: &[char], start: usize) -> Option<usize> {
    let mut index = start;
    while index + 1 < chars.len() {
        if chars[index] == '}' && chars[index + 1] == '}' {
            return Some(index - start);
        }
        index += 1;
    }
    None
}

pub fn expand_mid_pattern(
    pattern: &str,
    groups: &HashMap<String, String>,
) -> Result<String, String> {
    let mut out = String::new();
    let mut pos = 0;
    while pos < pattern.len() {
        if pattern[pos..].starts_with("{{") {
            if let Some(rel) = pattern[pos + 2..].find("}}") {
                let inside = &pattern[pos + 2..pos + 2 + rel];
                if inside.contains('|') {
                    out.push_str(&expand_mid_filters(inside, groups)?);
                    pos += 2 + rel + 2;
                    continue;
                }
                if is_name(inside) {
                    if let Some(value) = groups.get(inside) {
                        out.push_str(value);
                    }
                    pos += 2 + rel + 2;
                    continue;
                }
            }
        }
        let Some(next) = pattern[pos..].find("{{") else {
            out.push_str(&pattern[pos..]);
            break;
        };
        if next == 0 {
            out.push(pattern[pos..].chars().next().unwrap());
            pos += 1;
            continue;
        }
        out.push_str(&pattern[pos..pos + next]);
        pos += next;
    }
    Ok(out)
}

fn expand_mid_filters(inside: &str, groups: &HashMap<String, String>) -> Result<String, String> {
    let parts: Vec<&str> = inside.split('|').collect();
    if parts.len() < 2 || !is_name(parts[0]) || parts[1..].iter().any(|part| !is_name(part)) {
        return Err(format!("Malformed template filter '{{{{{inside}}}}}'"));
    }
    let Some(found) = groups.get(parts[0]) else {
        return Err(format!("Missing template capture '{}'", parts[0]));
    };
    let mut value = found.clone();
    for filter in &parts[1..] {
        value = match *filter {
            "pctenc" => pct_encode(&value),
            "pctdec" => pct_decode(&value)?,
            "quote" => quote_meta(&value),
            other => return Err(format!("Unknown template filter '{other}'")),
        };
    }
    Ok(value)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn template_decodes_literals_and_doubles_capture_backslashes() {
        let mut groups = HashMap::new();
        groups.insert("name".to_string(), r"a\n".to_string());
        let expanded = expand_template(r"x\n{{name}}", &groups, &HashMap::new()).unwrap();
        assert_eq!(expanded, "x\na\\\\n");
    }

    #[test]
    fn mid_hole_leaves_a_literal_brace() {
        let mut groups = HashMap::new();
        groups.insert("name".to_string(), "Z".to_string());
        assert_eq!(expand_mid_pattern("{{{{name}}", &groups).unwrap(), "{{Z");
        assert_eq!(expand_mid_pattern("{{2}}", &groups).unwrap(), "{{2}}");
    }
}
