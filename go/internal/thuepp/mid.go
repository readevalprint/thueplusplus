package thuepp

import (
	"fmt"
	"regexp"
	"strings"
)

// Mid is one ::| clause: a regex over the whole state.
// {{templates}} come from earlier captures. Named captures bind forward.
// No match skips the rule. Invalid expanded regex is an error.
type Mid struct {
	Pattern string
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
