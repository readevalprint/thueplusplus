package thue

import (
	"regexp"
	"strings"
	"testing"
)

func runSource(t *testing.T, src string) (int, string, error) {
	t.Helper()
	interp := New()
	interp.ProgramPath = "mid_test.thue"
	if err := interp.parseProgram(src); err != nil {
		return 1, "", err
	}
	code, err := interp.Run()
	return code, interp.State, err
}

func TestMidHitBindsValue(t *testing.T) {
	src := "^KEY=(?<k>[^\\n]+)\\n.*$ ::| {{k}}=(?<v>[^,\\n]*) ::= {{v}}\n::=\nKEY=a\na=hello,b=world"
	code, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if code != 0 {
		t.Fatalf("exit %d", code)
	}
	if state != "hello" {
		t.Fatalf("state=%q", state)
	}
}

func TestMidMissSkipsRule(t *testing.T) {
	src := "^KEY=(?<k>[^\\n]+)\\n.*$ ::| {{k}}=(?<v>[^,\\n]*) ::= {{v}}\n^KEY= ::- 3\n::=\nKEY=z\na=hello"
	code, _, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if code != 3 {
		t.Fatalf("exit %d want 3", code)
	}
}

func TestMidChain(t *testing.T) {
	src := "^MAP:.*$ ::| a=(?<ak>[^,]*) ::| b=(?<bv>[^,]*) ::= {{ak}}-{{bv}}\n::=\nMAP:a=1,b=2"
	_, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if state != "1-2" {
		t.Fatalf("state=%q", state)
	}
}

func TestMidSearchesWholeState(t *testing.T) {
	src := "^START$ ::| secret=(?<v>[^\\n]*) ::= {{v}}\n::=\nSTART\nsecret=ok"
	_, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if state != "ok\nsecret=ok" {
		t.Fatalf("state=%q", state)
	}
}

func TestMidRequiresTerminalOp(t *testing.T) {
	src := "^x$ ::| a=(?<v>.*)\n::=\nx"
	_, _, err := runSource(t, src)
	if err == nil {
		t.Fatal("expected parse error")
	}
	if !strings.Contains(err.Error(), "::| requires a terminal operator") {
		t.Fatalf("err=%v", err)
	}
}

func TestMidEmptyStepIsError(t *testing.T) {
	src := "^x$ ::| ::= y\n::=\nx"
	_, _, err := runSource(t, src)
	if err == nil {
		t.Fatal("expected parse error")
	}
	if !strings.Contains(err.Error(), "::| requires a regex") {
		t.Fatalf("err=%v", err)
	}
}

func TestMidBuiltinUsesValueCapture(t *testing.T) {
	src := "^MAP:.*$ ::| a=(?<v>[^,]*) ::! eq v v\n::=\nMAP:a=x"
	_, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if state != "1" {
		t.Fatalf("state=%q want 1", state)
	}
}

func TestMidInvalidExpandedRegexErrors(t *testing.T) {
	src := "^(?<k>a)$ ::| ({{k}} ::= x\n::=\na"
	_, _, err := runSource(t, src)
	if err == nil {
		t.Fatal("expected invalid regex error")
	}
	if !strings.Contains(err.Error(), "Invalid ::| regex '(a'") {
		t.Fatalf("err=%v", err)
	}
}

func TestMidRawDotIsWildcard(t *testing.T) {
	src := "^pre=(?<k>[^\\n]*)\\n(?<rest>.*)$ ::| ^{{k}}$ ::= HIT\n^HIT$ ::- 0\n^pre= ::- 2\n::=\npre=.\nx"
	code, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if code != 0 || state != "HIT" {
		t.Fatalf("code=%d state=%q", code, state)
	}
}

func TestMidRawBackslashIsOneCharacter(t *testing.T) {
	src := "^pre=(?<k>[^\\n]*)\\n(?<rest>.*)$ ::| ^{{k}}$ ::= HIT\n^HIT$ ::- 0\n^pre= ::- 2\n::=\npre=\\\n$"
	code, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if code != 0 || state != "HIT" {
		t.Fatalf("code=%d state=%q want HIT via ^\\$", code, state)
	}
}

func TestMidRawParenthesisIsInvalidRegex(t *testing.T) {
	src := "^pre=(?<k>[^\\n]*)\\n(?<rest>.*)$ ::| ^{{k}}$ ::= HIT\n^pre= ::- 2\n::=\npre=(\n("
	_, _, err := runSource(t, src)
	if err == nil || !strings.Contains(err.Error(), "Invalid ::| regex '^($'") {
		t.Fatalf("err=%v", err)
	}
}

func TestMidQuoteFilterIsLiteral(t *testing.T) {
	src := "^pre=(?<k>[^\\n]*)\\nrest=(?<r>.*)$ ::| rest={{k|quote}} ::= HIT\n^HIT$ ::- 0\n^pre= ::- 2\n::=\npre=.\nrest=."
	code, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if code != 0 || state != "HIT" {
		t.Fatalf("code=%d state=%q", code, state)
	}
	src = "^pre=(?<k>[^\\n]*)\\nrest=(?<r>.*)$ ::| rest={{k|quote}} ::= HIT\n^HIT$ ::- 0\n^pre= ::- 2\n::=\npre=.\nrest=x"
	code, _, err = runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if code != 2 {
		t.Fatalf("exit %d want 2", code)
	}
}

func TestMidQuoteComposesAfterPctenc(t *testing.T) {
	src := "^ENC=(?<k>[^\\n]*)\\nrest= ::| rest={{k|pctenc|quote}} ::= HIT\n^HIT$ ::- 0\n^ENC= ::- 2\n::=\nENC=a.b\nrest=axb"
	code, _, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if code != 2 {
		t.Fatalf("exit %d want 2 (quoted dot must not match x)", code)
	}
}

func TestMidExpandPatternVerbatimAndQuote(t *testing.T) {
	groups := map[string]string{
		"k":    ".\n\\${}",
		"name": "Z",
		"q":    "q",
	}
	got, err := expandMidPattern(`^{{k}}$`, groups)
	if err != nil {
		t.Fatal(err)
	}
	if got != "^.\n\\${}$" {
		t.Fatalf("verbatim=%q", got)
	}
	got, err = expandMidPattern(`{{k|quote}}`, groups)
	if err != nil {
		t.Fatal(err)
	}
	want := regexp.QuoteMeta(groups["k"])
	if got != want {
		t.Fatalf("quote=%q want %q", got, want)
	}
	got, err = expandMidPattern(`\{{q}}`, groups)
	if err != nil {
		t.Fatal(err)
	}
	if got != `\q` {
		t.Fatalf("escape splice=%q", got)
	}
	got, err = expandMidPattern(`a{2}`, groups)
	if err != nil {
		t.Fatal(err)
	}
	if got != `a{2}` {
		t.Fatalf("quantifier=%q", got)
	}
	got, err = expandMidPattern(`{{2}}`, groups)
	if err != nil {
		t.Fatal(err)
	}
	if got != `{{2}}` {
		t.Fatalf("digit braces=%q", got)
	}
	got, err = expandMidPattern(`{{{{name}}`, groups)
	if err != nil {
		t.Fatal(err)
	}
	if got != `{{Z` {
		t.Fatalf("rescan=%q", got)
	}
	got, err = expandMidPattern(`{{k|quote|pctenc}}`, map[string]string{"k": "."})
	if err != nil {
		t.Fatal(err)
	}
	if got != `%5C.` {
		t.Fatalf("quote then pctenc=%q", got)
	}
	if _, err := expandMidPattern(`{{k|nope}}`, groups); err == nil || !strings.Contains(err.Error(), "Unknown template filter 'nope'") {
		t.Fatalf("unknown=%v", err)
	}
	if _, err := expandMidPattern(`{{k|quote|}}`, groups); err == nil || !strings.Contains(err.Error(), "Malformed template filter") {
		t.Fatalf("malformed=%v", err)
	}
	for _, sample := range []string{"", ".", "(", "\\", "$", "{", "}", "{{}}", "\n", "\t", " ", "é", "€", "🙂", "a\nb", "\x00", "{2}", "\\n", "\\E"} {
		got, err := expandMidPattern(`{{k|quote}}`, map[string]string{"k": sample})
		if err != nil {
			t.Fatal(err)
		}
		if got != regexp.QuoteMeta(sample) {
			t.Fatalf("quote %q = %q", sample, got)
		}
		re, err := regexp.Compile("(?m)" + got)
		if err != nil {
			t.Fatalf("quote %q does not compile: %v", sample, err)
		}
		hay := "<<" + sample + ">>"
		loc := re.FindStringIndex(hay)
		if loc == nil || hay[loc[0]:loc[1]] != sample {
			t.Fatalf("quote %q did not match itself", sample)
		}
	}
}

func TestMidQuoteIsNotAnRHSFilter(t *testing.T) {
	src := "^(?<k>a)$ ::= {{k|quote}}\n::=\na"
	_, _, err := runSource(t, src)
	if err == nil || !strings.Contains(err.Error(), "Unknown template filter 'quote'") {
		t.Fatalf("err=%v", err)
	}
}

func TestMidDoesNotRetryLaterLHSMatch(t *testing.T) {
	src := "a(?<k>[a-z]) ::| {{k}}=1 ::= YES\nYES ::- 0\n^ab ::- 4\n::=\nab a=1"
	code, _, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if code != 4 {
		t.Fatalf("exit %d want 4", code)
	}
}

func TestMidLaterLHSWouldHaveMatchedOnItsOwn(t *testing.T) {
	src := "a(?<k>[a-z]) ::| {{k}}=1 ::= YES\nYES ::- 0\n^ab ::- 4\n::=\naa a=1"
	code, _, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if code != 0 {
		t.Fatalf("exit %d want 0", code)
	}
}

func TestMidEscapedPipeIsNotAStep(t *testing.T) {
	interp := New()
	interp.ProgramPath = "mid_test.thue"
	if err := interp.parseProgram("foo \\::| bar ::= Z\n::=\n"); err != nil {
		t.Fatal(err)
	}
	if len(interp.Rules) != 1 {
		t.Fatalf("rules=%d", len(interp.Rules))
	}
	rule := interp.Rules[0]
	if rule.Operator != Substitute || len(rule.Mids) != 0 || rule.LHS != "foo \\::| bar" {
		t.Fatalf("op=%s mids=%d lhs=%q", rule.Operator, len(rule.Mids), rule.LHS)
	}
}

func TestMidPipeAfterTerminalStaysInRHS(t *testing.T) {
	src := "^a$ ::= b ::| c\n::=\na"
	_, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if state != "b ::| c" {
		t.Fatalf("state=%q", state)
	}
}
