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
	src := "^(?<k>.*)$ ::| {{k}} ::= x\n::=\n("
	_, _, err := runSource(t, src)
	if err == nil {
		t.Fatal("expected invalid regex error")
	}
	if !strings.Contains(err.Error(), "Invalid ::| regex") {
		t.Fatalf("err=%v", err)
	}
}
