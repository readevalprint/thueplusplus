package thuepp

import (
	"fmt"
	"regexp"
	"strings"
)

// Mid is one ::| clause.
// Pattern is a regex. {{templates}} come from earlier captures.
// Named captures bind for later mids and the RHS.
// After template expansion the regex is searched against the whole state.
// No match skips the rule. Invalid expanded regex is an error.
type Mid struct {
	Pattern string
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
	if text == "" {
		return Mid{}, fmt.Errorf("Line %d: ::| requires a regex", lineNumber)
	}
	return Mid{Pattern: text}, nil
}

func midCaptureNames(mids []Mid) map[string]bool {
	names := map[string]bool{}
	for _, m := range mids {
		for _, match := range namedCapturePattern.FindAllStringSubmatch(m.Pattern, -1) {
			if len(match) > 1 {
				names[match[1]] = true
			}
		}
	}
	return names
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
		expanded, err := i.expandTemplate(mid.Pattern, out, nil)
		if err != nil {
			return groups, false, fmt.Errorf("Line %d: %v", rule.LineNumber, err)
		}
		re, err := regexp.Compile("(?m)" + expanded)
		if err != nil {
			return groups, false, fmt.Errorf("Line %d: Invalid ::| regex '%s': %v", rule.LineNumber, expanded, err)
		}
		idx := re.FindStringSubmatchIndex(i.State)
		if idx == nil {
			return groups, false, nil
		}
		names := re.SubexpNames()
		for n := 1; n < len(names) && 2*n+1 < len(idx); n++ {
			if names[n] != "" && idx[2*n] >= 0 {
				out[names[n]] = i.State[idx[2*n]:idx[2*n+1]]
			}
		}
	}
	return out, true, nil
}
