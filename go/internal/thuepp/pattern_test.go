package thuepp

import (
	"strings"
	"testing"
)

func TestExpandPatternsUsesSourceOrderDeterministically(t *testing.T) {
	content := strings.Join([]string{
		"A <- <|B|>",
		"B <- x",
		"^<|A|>$ ::- 7",
		"",
		"::=",
		"x",
	}, "\n")
	wantRule := "^x$ ::- 7"

	for n := 0; n < 100; n++ {
		expanded := expandPatterns(content)
		if !strings.Contains(expanded, wantRule) {
			t.Fatalf("expanded rule is not source-order deterministic on run %d\nexpanded:\n%s\nwant to contain: %s", n, expanded, wantRule)
		}
	}
}
