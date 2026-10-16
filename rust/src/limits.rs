//! CLI limit parsing. `unlimited` clears a limit. Zero is a real limit.

pub fn parse_limit(text: &str) -> Result<Option<i64>, String> {
    if text == "unlimited" {
        return Ok(None);
    }
    parse_atoi(text).map(Some)
}

pub fn parse_atoi(text: &str) -> Result<i64, String> {
    if !atoi_syntax(text) {
        return Err(format!(
            "strconv.Atoi: parsing {}: invalid syntax",
            go_quote(text)
        ));
    }
    text.parse::<i64>().map_err(|_| {
        format!(
            "strconv.Atoi: parsing {}: value out of range",
            go_quote(text)
        )
    })
}

fn atoi_syntax(text: &str) -> bool {
    let digits = text.strip_prefix('-').unwrap_or(text);
    !digits.is_empty() && digits.bytes().all(|byte| byte.is_ascii_digit())
}

fn go_quote(text: &str) -> String {
    let mut out = String::from("\"");
    for ch in text.chars() {
        match ch {
            '\\' => out.push_str(r"\\"),
            '"' => out.push_str(r#"\""#),
            '\n' => out.push_str(r"\n"),
            '\r' => out.push_str(r"\r"),
            '\t' => out.push_str(r"\t"),
            other if (other as u32) < 0x20 => out.push_str(&format!("\\x{:02x}", other as u32)),
            other => out.push(other),
        }
    }
    out.push('"');
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn limits_match_go_atoi() {
        assert_eq!(parse_limit("unlimited").unwrap(), None);
        assert_eq!(parse_limit("0").unwrap(), Some(0));
        assert_eq!(parse_limit("-3").unwrap(), Some(-3));
        let err = parse_limit("nope").unwrap_err();
        assert_eq!(err, "strconv.Atoi: parsing \"nope\": invalid syntax");
        assert!(parse_limit("+1").is_err());
    }
}
