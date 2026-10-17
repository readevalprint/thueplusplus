package thue

import (
	"fmt"
	"regexp"
	"strings"
)

// Mid is one ::| step: a regex searched over the whole state.
// {{name}} holes are filled from captures so far. Each substituted value is
// inserted verbatim as regex source. {{name|quote}} quotes a value as a
// literal. Named groups in the step bind for later steps and for the RHS.
// No match skips the rule. A regex that is invalid after filling is an error.
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

// expandMidPattern fills holes in a ::| step.
//
// A hole is {{name}} or {{name|filter|filter...}}. name matches
// [A-Za-z_][A-Za-z0-9_]*. {{2}} is not a hole. An unfiltered value is inserted
// verbatim: no QuoteMeta and no backslash doubling. Filters run left to right.
// quote is regexp.QuoteMeta. pctenc and pctdec are the template filters.
// Unfiltered missing names expand to empty. {{rule_index}} is not bound.
// Text that is not a hole is copied unchanged, so \n stays a regex escape.
// A "{{" that is not a well-formed hole contributes one "{" and scanning
// continues, so "{{{{name}}" is "{{" followed by the hole {{name}}.
func expandMidPattern(pattern string, groups map[string]string) (string, error) {
	var out strings.Builder
	pos := 0
	for pos < len(pattern) {
		if strings.HasPrefix(pattern[pos:], "{{") {
			end := strings.Index(pattern[pos+2:], "}}")
			if end >= 0 {
				inside := pattern[pos+2 : pos+2+end]
				if strings.Contains(inside, "|") {
					rendered, err := expandMidFilters(inside, groups)
					if err != nil {
						return "", err
					}
					out.WriteString(rendered)
					pos += 2 + end + 2
					continue
				}
				if isMidName(inside) {
					out.WriteString(groups[inside])
					pos += 2 + end + 2
					continue
				}
			}
		}
		next := strings.Index(pattern[pos:], "{{")
		if next < 0 {
			out.WriteString(pattern[pos:])
			break
		}
		if next == 0 {
			out.WriteByte(pattern[pos])
			pos++
			continue
		}
		out.WriteString(pattern[pos : pos+next])
		pos += next
	}
	return out.String(), nil
}

func isMidName(s string) bool {
	if s == "" || s[0] >= '0' && s[0] <= '9' {
		return false
	}
	return isWord(s)
}

func expandMidFilters(inside string, groups map[string]string) (string, error) {
	parts := strings.Split(inside, "|")
	if len(parts) < 2 || !isMidName(parts[0]) {
		return "", fmt.Errorf("Malformed template filter '{{%s}}'", inside)
	}
	for _, filt := range parts[1:] {
		if !isMidName(filt) {
			return "", fmt.Errorf("Malformed template filter '{{%s}}'", inside)
		}
	}
	value, ok := groups[parts[0]]
	if !ok {
		return "", fmt.Errorf("Missing template capture '%s'", parts[0])
	}
	var err error
	for _, filt := range parts[1:] {
		value, err = renderMidFilter(filt, value)
		if err != nil {
			return "", err
		}
	}
	return value, nil
}

func renderMidFilter(name, value string) (string, error) {
	switch name {
	case "pctenc":
		return pctEncode(value), nil
	case "pctdec":
		return pctDecode(value)
	case "quote":
		return regexp.QuoteMeta(value), nil
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
