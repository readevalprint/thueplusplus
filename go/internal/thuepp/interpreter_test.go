package thuepp

import (
	"bytes"
	"errors"
	"fmt"
	"strings"
	"testing"
	"time"
)

func TestRuntimeIOUsesHostResources(t *testing.T) {
	var stdout, stderr bytes.Buffer
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader("hello\n"),
		Stdout: &stdout,
		Stderr: &stderr,
	})
	interp.ProgramPath = "test.tpp"
	if err := interp.parseProgram("@IN@ ::< 1 stdin\n^(?<x>[A-Za-z0-9_.-]+)$ ::> stdout {{x|pctdec}}\\n\n::=\n@IN@"); err != nil {
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
	if err := interp.parseProgram("@IN@ ::< -1 stdin\n::=\n@IN@"); err != nil {
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

func TestFastExitProcessOutputIsReadable(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader(""),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	interp.AddProcBinding("once", "printf '7\\n'")
	interp.ProgramPath = "test.tpp"
	if err := interp.parseProgram("@N@ ::< 1 once\n^(?<n>[0-9]+)$ ::> stdout {{n}}\\n\n::=\n@N@"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
}

func TestLoadProgramTextPreservesSourceAndCoverageTSV(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader(""),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	if err := interp.LoadProgramText("virtual/main.tpp", "foo ::= bar\nbar ::- 0\n::=\nfoo"); err != nil {
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
	if err := interp.LoadProgramText("virtual/main.tpp", "::=\n@include other.tpp\n"); err != nil {
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
	err := interp.LoadProgramText("virtual/main.tpp", "^x$ ::% data\n::=\nx")
	if err == nil {
		t.Fatal("LoadProgramText succeeded, want invalid syntax error")
	}
	if got, want := err.Error(), "Line 1: Invalid rule syntax: ^x$ ::% data"; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestNoSeparatorMeansEmptyInitialState(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader(""),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	if err := interp.LoadProgramText("virtual/main.tpp", "literal state without separator\n"); err != nil {
		t.Fatal(err)
	}
	if got, want := interp.State, ""; got != want {
		t.Fatalf("state = %q, want %q", got, want)
	}
	if got := len(interp.Rules); got != 0 {
		t.Fatalf("rules = %d, want 0", got)
	}
}

func TestFinalSeparatorPreservesMultilineState(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader(""),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	if err := interp.LoadProgramText("virtual/main.tpp", "^x$ ::= y\n^z$ ::= q\n::=\nx\nz\n"); err != nil {
		t.Fatal(err)
	}
	if got, want := interp.State, "x\nz"; got != want {
		t.Fatalf("state = %q, want %q", got, want)
	}
}

func TestTraceRecordsAppliedRuleStateAndCaptures(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader(""),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	interp.TraceEnabled = true
	if err := interp.LoadProgramText("trace.tpp", "^hello (?<name>[A-Za-z]+)$ ::= hi {{name}}\n::=\nhello Ada"); err != nil {
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
	if interp.AppliedSteps != 1 {
		t.Fatalf("AppliedSteps = %d, want 1", interp.AppliedSteps)
	}
}

func TestNewAppliesSandboxDefaults(t *testing.T) {
	interp := New()
	if interp.MaxEvals == nil || *interp.MaxEvals != DefaultMaxEvals {
		t.Fatalf("MaxEvals = %v, want %d", interp.MaxEvals, DefaultMaxEvals)
	}
	if interp.MaxStateBytes == nil || *interp.MaxStateBytes != DefaultMaxStateBytes {
		t.Fatalf("MaxStateBytes = %v, want %d", interp.MaxStateBytes, DefaultMaxStateBytes)
	}
	if interp.MaxSteps == nil || *interp.MaxSteps != DefaultMaxSteps {
		t.Fatalf("MaxSteps = %v, want %d", interp.MaxSteps, DefaultMaxSteps)
	}
	if len(interp.Bindings) != 3 {
		t.Fatalf("bindings = %d, want stdin, stdout, and stderr", len(interp.Bindings))
	}
	for _, name := range []string{"stdin", "stdout", "stderr"} {
		if _, ok := interp.Bindings[name]; !ok {
			t.Fatalf("missing %s", name)
		}
	}
}

func TestParseLimit(t *testing.T) {
	cleared, err := ParseLimit("unlimited")
	if err != nil || cleared != nil {
		t.Fatalf("unlimited = %v, %v", cleared, err)
	}
	zero, err := ParseLimit("0")
	if err != nil || zero == nil || *zero != 0 {
		t.Fatalf("zero = %v, %v", zero, err)
	}
	if _, err := ParseLimit("nope"); err == nil {
		t.Fatal("expected an integer parse error")
	}
}

func TestDefaultStateLimitRejectsGrowthPastDefault(t *testing.T) {
	interp := New()
	interp.MaxEvals = nil
	source := "^(?<s>a+)$ ::= {{s}}x\n::=\n" + strings.Repeat("a", DefaultMaxStateBytes)
	if err := interp.LoadProgramText("grow.tpp", source); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	var limit *LimitError
	if code != ExitStateLimit || !errors.As(err, &limit) || limit.Kind != LimitState || !strings.Contains(err.Error(), "State size") {
		t.Fatalf("code=%d err=%v", code, err)
	}
}

func TestClearedStateLimitAllowsGrowthPastDefault(t *testing.T) {
	interp := New()
	interp.MaxEvals = nil
	interp.MaxStateBytes = nil
	source := "^(?<s>a+)$ ::= {{s}}x\n::=\n" + strings.Repeat("a", DefaultMaxStateBytes)
	if err := interp.LoadProgramText("grow.tpp", source); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	if err != nil || code != 0 {
		t.Fatalf("code=%d err=%v", code, err)
	}
	if got := len(interp.State); got != DefaultMaxStateBytes+1 {
		t.Fatalf("state length = %d, want %d", got, DefaultMaxStateBytes+1)
	}
}

func TestTraceRecordsMatchedRuleError(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader(""),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	interp.TraceEnabled = true
	if err := interp.LoadProgramText("builtin-error.tpp", "^div:(?<a>[0-9]+),(?<b>[0-9]+)$ ::! div a b\n::=\ndiv:1,0"); err != nil {
		t.Fatalf("LoadProgramText: %v", err)
	}
	code, err := interp.Run()
	if err == nil || !strings.Contains(err.Error(), "Builtin 'div' division by zero") {
		t.Fatalf("Run error = %v, want division by zero", err)
	}
	if code != 1 {
		t.Fatalf("exit code = %d", code)
	}
	if len(interp.Trace) != 1 {
		t.Fatalf("trace length = %d, want 1", len(interp.Trace))
	}
	event := interp.Trace[0]
	if event.LineNumber != 1 || event.Operator != Builtin || event.StateBefore != "div:1,0" || event.StateAfter != "div:1,0" {
		t.Fatalf("unexpected event: %#v", event)
	}
	if event.Error != "Builtin 'div' division by zero" {
		t.Fatalf("trace error = %q", event.Error)
	}
}

func TestStepLimitStopsBeforeTheNextRewrite(t *testing.T) {
	interp := New()
	one := 1
	interp.MaxSteps = &one
	if err := interp.LoadProgramText("steps.tpp", "^a$ ::= b\n^b$ ::= c\n::=\na"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	var limit *LimitError
	if code != ExitStepLimit || !errors.As(err, &limit) || limit.Kind != LimitSteps {
		t.Fatalf("code=%d err=%v", code, err)
	}
	if limit.Message != "Applied step limit (1) exceeded" {
		t.Fatalf("message = %q", limit.Message)
	}
	if interp.State != "b" || interp.AppliedSteps != 1 {
		t.Fatalf("state=%q steps=%d", interp.State, interp.AppliedSteps)
	}
}

func TestStepLimitAllowsCompletionUnderTheCap(t *testing.T) {
	interp := New()
	two := 2
	interp.MaxSteps = &two
	if err := interp.LoadProgramText("steps.tpp", "^a$ ::= b\n::=\na"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	if err != nil || code != 0 || interp.State != "b" || interp.AppliedSteps != 1 {
		t.Fatalf("code=%d err=%v state=%q steps=%d", code, err, interp.State, interp.AppliedSteps)
	}
}

func TestStepLimitDoesNotContinueIntoExit(t *testing.T) {
	interp := New()
	one := 1
	interp.MaxSteps = &one
	if err := interp.LoadProgramText("steps.tpp", "^a$ ::= b\n^b$ ::- 7\n::=\na"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	var limit *LimitError
	if code != ExitStepLimit || !errors.As(err, &limit) || interp.State != "b" {
		t.Fatalf("code=%d err=%v state=%q", code, err, interp.State)
	}
}

func TestZeroStepLimitAppliesNothing(t *testing.T) {
	interp := New()
	zero := 0
	interp.MaxSteps = &zero
	if err := interp.LoadProgramText("steps.tpp", "^a$ ::= b\n::=\na"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	var limit *LimitError
	if code != ExitStepLimit || !errors.As(err, &limit) || limit.Message != "Applied step limit (0) exceeded" {
		t.Fatalf("code=%d err=%v", code, err)
	}
	if interp.State != "a" || interp.AppliedSteps != 0 {
		t.Fatalf("state=%q steps=%d", interp.State, interp.AppliedSteps)
	}
}

func TestEvalLimit(t *testing.T) {
	interp := New()
	zero := 0
	interp.MaxEvals = &zero
	if err := interp.LoadProgramText("evals.tpp", "^a$ ::= b\n::=\na"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	var limit *LimitError
	if code != ExitEvalLimit || !errors.As(err, &limit) || limit.Kind != LimitEvals || limit.Message != "Evaluation step limit (0) exceeded" {
		t.Fatalf("code=%d err=%v", code, err)
	}
}

type timeoutResource struct{}

func (timeoutResource) ReadLine(time.Duration) (string, error) {
	return "", fmt.Errorf("timeout")
}
func (timeoutResource) WriteString(string) error { return nil }
func (timeoutResource) Cleanup()                 {}

func TestReadTimeoutLimit(t *testing.T) {
	interp := New()
	interp.AddCallbackBinding("sleepy", "sleepy", timeoutResource{})
	if err := interp.LoadProgramText("timeout.tpp", "^start$ ::< 1 sleepy\n::=\nstart"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	var limit *LimitError
	if code != ExitReadTimeout || !errors.As(err, &limit) || limit.Kind != LimitTimeout {
		t.Fatalf("code=%d err=%v", code, err)
	}
	if limit.Message != "ERR:resource:sleepy:timeout" {
		t.Fatalf("message = %q", limit.Message)
	}
}
