package thuepp

import (
	"fmt"
	"regexp"
	"strings"
)

// Mid is one ::| step: a regex searched over the whole state.
// {{name}} holes are filled from captures so far. Each substituted value is
// inserted as a literal (regexp.QuoteMeta), not as regex syntax. Named groups
// in the step bind for later steps and for the RHS. No match skips the rule.
// A regex that is invalid after filling is an error.
type Mid struct {
	Pattern string
}

func parseMid(text string, lineNumber int) (Mid, error) {
	text = strings.Trim(text, " \t")
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

// expandMidPattern fills template holes in a ::| step.
//
// Substituted values are regexp.QuoteMeta'd. A capture of "." becomes "\."
// and matches a dot, not any character. Filters run before quoting.
// Unfiltered missing names expand to empty, same as a ::= template.
// {{rule_index}} is not bound in a step. Literal step text is regex source:
// it is not decoded as a replacement string, so "\n" stays the regex escape.
func expandMidPattern(pattern string, groups map[string]string) (string, error) {
	var out strings.Builder
	pos := 0
	for pos < len(pattern) {
		if strings.HasPrefix(pattern[pos:], "{{") {
			end := strings.Index(pattern[pos+2:], "}}")
			if end >= 0 {
				inside := pattern[pos+2 : pos+2+end]
				if strings.Contains(inside, "|") {
					parts := strings.Split(inside, "|")
					if len(parts) != 2 || !isWord(parts[0]) || parts[0][0] >= '0' && parts[0][0] <= '9' || !isWord(parts[1]) || parts[1][0] >= '0' && parts[1][0] <= '9' {
						return "", fmt.Errorf("Malformed template filter '{{%s}}'", inside)
					}
					value, ok := groups[parts[0]]
					if !ok {
						return "", fmt.Errorf("Missing template capture '%s'", parts[0])
					}
					rendered, err := renderMidFilter(parts[1], value)
					if err != nil {
						return "", err
					}
					out.WriteString(regexp.QuoteMeta(rendered))
					pos += 2 + end + 2
					continue
				}
				if isWord(inside) {
					out.WriteString(regexp.QuoteMeta(groups[inside]))
					pos += 2 + end + 2
					continue
				}
			}
		}
		if strings.HasPrefix(pattern[pos:], "{{") {
			out.WriteByte(pattern[pos])
			pos++
			continue
		}
		literalStart := pos
		for pos < len(pattern) && !strings.HasPrefix(pattern[pos:], "{{") {
			pos++
		}
		out.WriteString(pattern[literalStart:pos])
	}
	return out.String(), nil
}

func renderMidFilter(name, value string) (string, error) {
	switch name {
	case "pctenc":
		return pctEncode(value), nil
	case "pctdec":
		return pctDecode(value)
	default:
		return "", fmt.Errorf("Unknown template filter '%s'", name)
	}
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
		expanded, err := expandMidPattern(mid.Pattern, out)
		if err != nil {
			return out, false, fmt.Errorf("Line %d: %v", rule.LineNumber, err)
		}
		re, err := regexp.Compile("(?m)" + expanded)
		if err != nil {
			return out, false, fmt.Errorf("Line %d: Invalid ::| regex '%s'", rule.LineNumber, expanded)
		}
		idx := re.FindStringSubmatchIndex(i.State)
		if idx == nil {
			return out, false, nil
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
