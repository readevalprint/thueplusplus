package thuepp

import (
	"strings"
	"testing"
)

func runSource(t *testing.T, src string) (int, string, error) {
	t.Helper()
	interp := New()
	interp.ProgramPath = "mid_test.tpp"
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

func TestMidQuotesMetacharacters(t *testing.T) {
	src := "^pre=(?<k>[^\\n]+)\\n(?<rest>.*)$ ::| ^{{k}}$ ::= HIT\n^HIT$ ::- 0\n^pre= ::- 2\n::=\npre=.\naxc"
	code, _, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if code != 2 {
		t.Fatalf("exit %d want 2 (dot must not match axc)", code)
	}
}

func TestMidQuotesParenthesisAsLiteral(t *testing.T) {
	src := "^pre=(?<k>[^\\n]+)\\n(?<rest>.*)$ ::| ^{{k}}$ ::= HIT\n^HIT$ ::- 0\n::=\npre=(\n("
	code, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if code != 0 || state != "HIT" {
		t.Fatalf("code=%d state=%q", code, state)
	}
}

func TestMidQuotesBackslashAsLiteral(t *testing.T) {
	src := "^pre=(?<k>[^\\n]+)\\n(?<rest>.*)$ ::| ^{{k}}$ ::= HIT\n^HIT$ ::- 0\n::=\npre=\\\n\\"
	code, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if code != 0 || state != "HIT" {
		t.Fatalf("code=%d state=%q", code, state)
	}
}

func TestMidFilterRunsBeforeQuoting(t *testing.T) {
	src := "^pre=(?<k>[^\\n]+)\\n.*$ ::| ^{{k|pctenc}}$ ::= HIT\n^HIT$ ::- 0\n::=\npre=a b\na%20b"
	code, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if code != 0 || state != "HIT" {
		t.Fatalf("code=%d state=%q", code, state)
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
	interp.ProgramPath = "mid_test.tpp"
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
