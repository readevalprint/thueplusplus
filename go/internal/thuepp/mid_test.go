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
	src := "^MAP:(?<idx>.*)$ ::| idx[a]=(?<v>.*) ::= {{v}}\n::=\nMAP:a=hello,b=world"
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
	src := "^MAP:(?<idx>.*)$ ::| idx[z]=(?<v>.*) ::= {{v}}\n^MAP: ::- 3\n::=\nMAP:a=hello"
	code, _, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if code != 3 {
		t.Fatalf("exit %d want 3", code)
	}
}

func TestMidFirstWins(t *testing.T) {
	src := "^MAP:(?<idx>.*)$ ::| idx[a]=(?<v>.*) ::= {{v}}\n::=\nMAP:a=first,a=second"
	_, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if state != "first" {
		t.Fatalf("state=%q want first", state)
	}
}

func TestMidChain(t *testing.T) {
	src := "^MAP:(?<idx>.*)$ ::| idx[a]=(?<ak>.*) ::| idx[b]=(?<bv>.*) ::= {{ak}}-{{bv}}\n::=\nMAP:a=1,b=2"
	_, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if state != "1-2" {
		t.Fatalf("state=%q", state)
	}
}

func TestMidTemplatedKey(t *testing.T) {
	src := "^(?<k>[^=]+)=(?<idx>.*)$ ::| idx[{{k}}]=(?<v>.*) ::= {{v}}\n::=\na=a=hello,b=x"
	_, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if state != "hello" {
		t.Fatalf("state=%q", state)
	}
}

func TestMidMalformedRegionErrors(t *testing.T) {
	src := "^MAP:(?<idx>.*)$ ::| idx[a]=(?<v>.*) ::= {{v}}\n::=\nMAP:not-an-index"
	_, _, err := runSource(t, src)
	if err == nil {
		t.Fatal("expected malformed region error")
	}
	if !strings.Contains(err.Error(), "malformed MID region") {
		t.Fatalf("err=%v", err)
	}
}

func TestMidRequiresTerminalOp(t *testing.T) {
	src := "^(?<idx>.*)$ ::| idx[a]\n::=\na=1"
	_, _, err := runSource(t, src)
	if err == nil {
		t.Fatal("expected parse error")
	}
}

func TestMidBuiltinUsesValueCapture(t *testing.T) {
	src := "^MAP:(?<idx>.*)$ ::| idx[a]=(?<v>.*) ::! eq v v\n::=\nMAP:a=x"
	_, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if state != "1" {
		t.Fatalf("state=%q want 1", state)
	}
}

func TestMidPresenceOnly(t *testing.T) {
	src := "^MAP:(?<idx>.*)$ ::| idx[a] ::= HIT\n::=\nMAP:a=1,b=2"
	_, state, err := runSource(t, src)
	if err != nil {
		t.Fatal(err)
	}
	if state != "HIT" {
		t.Fatalf("state=%q", state)
	}
}
