package thuepp

import (
	"fmt"
	"regexp"
	"strings"
)

// Mid is one compiled ::| clause.
// Lookup is first-wins in a comma-separated k=v region captured by Region.
// Missing key skips the rule. Malformed region text is an error.
type Mid struct {
	Region       string
	KeyTemplate  string
	ValuePattern string
	ValueRe      *regexp.Regexp
}

func isRuleOpChar(c byte) bool {
	switch c {
	case '=', '<', '>', '!', '-', '|':
		return true
	}
	return false
}

func operatorFromChar(c byte) (Operator, bool) {
	switch c {
	case '=':
		return Substitute, true
	case '<':
		return Read, true
	case '>':
		return Write, true
	case '-':
		return Exit, true
	case '!':
		return Builtin, true
	default:
		return "", false
	}
}

func unescapedColonColon(line string, i int) bool {
	if i+1 >= len(line) || line[i] != ':' || line[i+1] != ':' {
		return false
	}
	if i > 0 && line[i-1] == '\\' {
		return false
	}
	return true
}

func splitRuleLine(line string) (lhs string, mids []string, op Operator, rhs string, ok bool, err error) {
	i := 0
	lhsSet := false
	for i < len(line) {
		if !unescapedColonColon(line, i) {
			i++
			continue
		}
		if i+2 >= len(line) {
			return "", nil, "", "", false, nil
		}
		c := line[i+2]
		if c == '|' {
			if !lhsSet {
				lhs = line[:i]
				lhsSet = true
			}
			j := i + 3
			for j < len(line) {
				if unescapedColonColon(line, j) && j+2 < len(line) && isRuleOpChar(line[j+2]) {
					break
				}
				j++
			}
			if j >= len(line) || !unescapedColonColon(line, j) {
				return "", nil, "", "", false, fmt.Errorf("::| requires a terminal operator")
			}
			mids = append(mids, line[i+3:j])
			i = j
			continue
		}
		if opVal, found := operatorFromChar(c); found {
			if !lhsSet {
				lhs = line[:i]
			}
			return lhs, mids, opVal, line[i+3:], true, nil
		}
		return "", nil, "", "", false, nil
	}
	return "", nil, "", "", false, nil
}

func parseMid(text string, lineNumber int) (Mid, error) {
	text = strings.TrimSpace(text)
	open := strings.IndexByte(text, '[')
	if open <= 0 {
		return Mid{}, fmt.Errorf("Line %d: Invalid ::| clause: %s", lineNumber, text)
	}
	region := strings.TrimSpace(text[:open])
	if !isCaptureName(region) {
		return Mid{}, fmt.Errorf("Line %d: Invalid ::| region '%s'", lineNumber, region)
	}
	rest := text[open+1:]
	close := strings.IndexByte(rest, ']')
	if close < 0 {
		return Mid{}, fmt.Errorf("Line %d: Invalid ::| clause: %s", lineNumber, text)
	}
	key := rest[:close]
	if key == "" {
		return Mid{}, fmt.Errorf("Line %d: Invalid ::| key in: %s", lineNumber, text)
	}
	after := rest[close+1:]
	mid := Mid{Region: region, KeyTemplate: key}
	if after == "" {
		return mid, nil
	}
	if !strings.HasPrefix(after, "=") {
		return Mid{}, fmt.Errorf("Line %d: Invalid ::| clause: %s", lineNumber, text)
	}
	pat := after[1:]
	re, err := regexp.Compile("(?m)" + pat)
	if err != nil {
		return Mid{}, fmt.Errorf("Line %d: Invalid ::| value pattern '%s': %v", lineNumber, pat, err)
	}
	mid.ValuePattern = pat
	mid.ValueRe = re
	return mid, nil
}

func formatMid(m Mid) string {
	out := m.Region + "[" + m.KeyTemplate + "]"
	if m.ValuePattern != "" {
		out += "=" + m.ValuePattern
	}
	return out
}

func midCaptureNames(mids []Mid) map[string]bool {
	names := map[string]bool{}
	for _, m := range mids {
		if m.ValueRe == nil {
			continue
		}
		for _, name := range m.ValueRe.SubexpNames() {
			if name != "" {
				names[name] = true
			}
		}
	}
	return names
}

func isCaptureName(s string) bool {
	if s == "" {
		return false
	}
	c := s[0]
	if !((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || c == '_') {
		return false
	}
	for i := 1; i < len(s); i++ {
		c = s[i]
		if (c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '_' {
			continue
		}
		return false
	}
	return true
}

func parseKVIndex(region string) (map[string]string, error) {
	out := map[string]string{}
	if region == "" {
		return out, nil
	}
	parts := strings.Split(region, ",")
	for _, part := range parts {
		if part == "" {
			return nil, fmt.Errorf("malformed MID region")
		}
		eq := strings.IndexByte(part, '=')
		if eq <= 0 {
			return nil, fmt.Errorf("malformed MID region")
		}
		key := part[:eq]
		if _, exists := out[key]; exists {
			continue
		}
		out[key] = part[eq+1:]
	}
	return out, nil
}

func (i *Interpreter) applyMids(rule Rule, groups map[string]string) (map[string]string, bool, error) {
	if len(rule.Mids) == 0 {
		return groups, true, nil
	}
	out := map[string]string{}
	for k, v := range groups {
		out[k] = v
	}
	for _, mid := range rule.Mids {
		region, ok := out[mid.Region]
		if !ok {
			return groups, false, nil
		}
		key, err := i.expandTemplate(mid.KeyTemplate, out, nil)
		if err != nil {
			return groups, false, fmt.Errorf("Line %d: %v", rule.LineNumber, err)
		}
		index, err := parseKVIndex(region)
		if err != nil {
			return groups, false, fmt.Errorf("Line %d: %v", rule.LineNumber, err)
		}
		value, ok := index[key]
		if !ok {
			return groups, false, nil
		}
		if mid.ValueRe == nil {
			continue
		}
		match := mid.ValueRe.FindStringSubmatch(value)
		if match == nil {
			return groups, false, nil
		}
		for idx, name := range mid.ValueRe.SubexpNames() {
			if name == "" || idx >= len(match) {
				continue
			}
			out[name] = match[idx]
		}
	}
	return out, true, nil
}
