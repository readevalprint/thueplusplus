package thuepp

import (
	"bytes"
	"strings"
	"testing"
)

func TestRuntimeIOUsesHostResources(t *testing.T) {
	var stdout, stderr bytes.Buffer
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader("hello\n"),
		Stdout: &stdout,
		Stderr: &stderr,
	})
	interp.ProgramPath = "test.tpp"
	if err := interp.parseProgram("@IN@ ::< 1 stdin\n^(?<x>[A-Za-z0-9_.-]+)$ ::> stdout {{x|pctdec}}\\n\n@IN@"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	if got := stdout.String(); got != "hello\n" {
		t.Fatalf("stdout = %q, want %q", got, "hello\n")
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestBulkResourceReadFailsLoud(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader("hello\n"),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	interp.ProgramPath = "test.tpp"
	if err := interp.parseProgram("@IN@ ::< -1 stdin\n@IN@"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	if err == nil {
		t.Fatal("Run succeeded, want invalid timeout error")
	}
	if code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if got, want := err.Error(), "Line 1: invalid read timeout '-1'"; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestLoadProgramTextPreservesSourceAndCoverageTSV(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader(""),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	if err := interp.LoadProgramText("virtual/main.tpp", "foo ::= bar\nbar ::- 0\nfoo"); err != nil {
		t.Fatal(err)
	}
	if got, want := interp.ProgramPath, "virtual/main.tpp"; got != want {
		t.Fatalf("ProgramPath = %q, want %q", got, want)
	}
	code, err := interp.Run()
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	if got, want := interp.RuleCoverageTSV(), "virtual/main.tpp:1\t1\nvirtual/main.tpp:2\t1\n"; got != want {
		t.Fatalf("RuleCoverageTSV() = %q, want %q", got, want)
	}
}

func TestIncludeRowsAreInertState(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader(""),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	if err := interp.LoadProgramText("virtual/main.tpp", "@include other.tpp\n"); err != nil {
		t.Fatal(err)
	}
	if got, want := interp.State, "@include other.tpp"; got != want {
		t.Fatalf("state = %q, want %q", got, want)
	}
}

func TestDataOperatorIsInvalidSyntax(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader(""),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	err := interp.LoadProgramText("virtual/main.tpp", "^x$ ::% data\nx")
	if err == nil {
		t.Fatal("LoadProgramText succeeded, want invalid syntax error")
	}
	if got, want := err.Error(), "Line 1: Invalid rule syntax: ^x$ ::% data"; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestTraceRecordsAppliedRuleStateAndCaptures(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader(""),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	interp.TraceEnabled = true
	if err := interp.LoadProgramText("trace.tpp", "^hello (?<name>[A-Za-z]+)$ ::= hi {{name}}\nhello Ada"); err != nil {
		t.Fatalf("LoadProgramText: %v", err)
	}
	code, err := interp.Run()
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if code != 0 {
		t.Fatalf("exit code = %d", code)
	}
	if len(interp.Trace) != 1 {
		t.Fatalf("trace length = %d, want 1", len(interp.Trace))
	}
	event := interp.Trace[0]
	if event.Step == 0 || event.RuleIndex != 0 || event.SourcePath != "trace.tpp" || event.LineNumber != 1 || event.Operator != Substitute {
		t.Fatalf("unexpected event metadata: %#v", event)
	}
	if event.StateBefore != "hello Ada" || event.Replacement != "hi Ada" || event.StateAfter != "hi Ada" {
		t.Fatalf("unexpected state transition: %#v", event)
	}
	if event.Groups["name"] != "Ada" {
		t.Fatalf("groups = %#v", event.Groups)
	}
}
