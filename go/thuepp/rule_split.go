package thuepp

import "errors"

var errMidNeedsTerminal = errors.New("::| requires a terminal operator")

// splitRuleLine splits a source row into LHS, ::| steps, a terminal operator,
// and RHS. A :: sequence is structural only when it is not immediately
// preceded by '\'. '|' starts a step. '=', '<', '>', '-', and '!' end the
// rule. A step with no terminal operator is an error. Other :: sequences stay
// inside the surrounding text.
func splitRuleLine(line string) (lhs string, mids []string, op byte, rhs string, ok bool, err error) {
	sawMid := false
	for i := 0; i+2 < len(line); {
		c, isOp := structuralOpAt(line, i)
		if !isOp {
			i++
			continue
		}
		if c == '|' {
			if !sawMid {
				lhs = line[:i]
				sawMid = true
			}
			next, nextOp, found := nextStructuralOp(line, i+3)
			if !found || nextOp == 0 {
				return "", nil, 0, "", false, errMidNeedsTerminal
			}
			mids = append(mids, line[i+3:next])
			if nextOp == '|' {
				i = next
				continue
			}
			return lhs, mids, nextOp, line[next+3:], true, nil
		}
		if !sawMid {
			lhs = line[:i]
		}
		return lhs, mids, c, line[i+3:], true, nil
	}
	if sawMid {
		return "", nil, 0, "", false, errMidNeedsTerminal
	}
	return "", nil, 0, "", false, nil
}

func hasTerminalOperator(line string) bool {
	for i := 0; i+2 < len(line); i++ {
		c, isOp := structuralOpAt(line, i)
		if isOp && c != '|' {
			return true
		}
	}
	return false
}

func structuralOpAt(line string, i int) (byte, bool) {
	if i+2 >= len(line) || line[i] != ':' || line[i+1] != ':' {
		return 0, false
	}
	if i > 0 && line[i-1] == '\\' {
		return 0, false
	}
	switch line[i+2] {
	case '|', '=', '<', '>', '-', '!':
		return line[i+2], true
	default:
		return 0, false
	}
}

func nextStructuralOp(line string, start int) (int, byte, bool) {
	for i := start; i+2 < len(line); i++ {
		if c, isOp := structuralOpAt(line, i); isOp {
			return i, c, true
		}
	}
	return 0, 0, false
}
