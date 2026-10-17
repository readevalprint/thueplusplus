package thue

import (
	"bytes"
	"errors"
	"fmt"
	"io"
	"os"
	"runtime"
	"runtime/debug"
	"strings"
	"testing"
	"time"
)

const testMemoryCap = 256 << 20

func TestMain(m *testing.M) {
	debug.SetMemoryLimit(testMemoryCap)
	stop := make(chan struct{})
	go func() {
		ticker := time.NewTicker(100 * time.Millisecond)
		defer ticker.Stop()
		for {
			select {
			case <-stop:
				return
			case <-ticker.C:
				var stats runtime.MemStats
				runtime.ReadMemStats(&stats)
				if stats.HeapAlloc > testMemoryCap {
					panic(fmt.Sprintf("test memory cap exceeded: heap %d bytes", stats.HeapAlloc))
				}
			}
		}
	}()
	code := m.Run()
	close(stop)
	os.Exit(code)
}

func TestRuntimeIOUsesHostResources(t *testing.T) {
	var stdout, stderr bytes.Buffer
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader("hello\n"),
		Stdout: &stdout,
		Stderr: &stderr,
	})
	interp.ProgramPath = "test.thue"
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
	interp.ProgramPath = "test.thue"
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
	interp.ProgramPath = "test.thue"
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
	if err := interp.LoadProgramText("virtual/main.thue", "foo ::= bar\nbar ::- 0\n::=\nfoo"); err != nil {
		t.Fatal(err)
	}
	if got, want := interp.ProgramPath, "virtual/main.thue"; got != want {
		t.Fatalf("ProgramPath = %q, want %q", got, want)
	}
	code, err := interp.Run()
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	if got, want := interp.RuleCoverageTSV(), "virtual/main.thue:1\t1\nvirtual/main.thue:2\t1\n"; got != want {
		t.Fatalf("RuleCoverageTSV() = %q, want %q", got, want)
	}
}

func TestIncludeRowsAreInertState(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader(""),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	if err := interp.LoadProgramText("virtual/main.thue", "::=\n@include other.thue\n"); err != nil {
		t.Fatal(err)
	}
	if got, want := interp.State, "@include other.thue"; got != want {
		t.Fatalf("state = %q, want %q", got, want)
	}
}

func TestDataOperatorIsInvalidSyntax(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader(""),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	err := interp.LoadProgramText("virtual/main.thue", "^x$ ::% data\n::=\nx")
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
	if err := interp.LoadProgramText("virtual/main.thue", "literal state without separator\n"); err != nil {
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
	if err := interp.LoadProgramText("virtual/main.thue", "^x$ ::= y\n^z$ ::= q\n::=\nx\nz\n"); err != nil {
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
	if err := interp.LoadProgramText("trace.thue", "^hello (?<name>[A-Za-z]+)$ ::= hi {{name}}\n::=\nhello Ada"); err != nil {
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
	if event.Step == 0 || event.RuleIndex != 0 || event.SourcePath != "trace.thue" || event.LineNumber != 1 || event.Operator != Substitute {
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
	evals := 10
	steps := 2
	interp.MaxEvals = &evals
	interp.MaxSteps = &steps
	source := "^(?<s>a+)$ ::= {{s}}x\n::=\n" + strings.Repeat("a", DefaultMaxStateBytes)
	if err := interp.LoadProgramText("grow.thue", source); err != nil {
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
	evals := 10
	steps := 2
	interp.MaxEvals = &evals
	interp.MaxSteps = &steps
	interp.MaxStateBytes = nil
	source := "^(?<s>a+)$ ::= {{s}}x\n::=\n" + strings.Repeat("a", DefaultMaxStateBytes)
	if err := interp.LoadProgramText("grow.thue", source); err != nil {
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
	if err := interp.LoadProgramText("builtin-error.thue", "^div:(?<a>[0-9]+),(?<b>[0-9]+)$ ::! div a b\n::=\ndiv:1,0"); err != nil {
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
	if err := interp.LoadProgramText("steps.thue", "^a$ ::= b\n^b$ ::= c\n::=\na"); err != nil {
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
	if err := interp.LoadProgramText("steps.thue", "^a$ ::= b\n::=\na"); err != nil {
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
	if err := interp.LoadProgramText("steps.thue", "^a$ ::= b\n^b$ ::- 7\n::=\na"); err != nil {
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
	if err := interp.LoadProgramText("steps.thue", "^a$ ::= b\n::=\na"); err != nil {
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
	if err := interp.LoadProgramText("evals.thue", "^a$ ::= b\n::=\na"); err != nil {
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
	if err := interp.LoadProgramText("timeout.thue", "^start$ ::< 1 sleepy\n::=\nstart"); err != nil {
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

func TestStdinResourceReadsReadyLinesAndEOF(t *testing.T) {
	resource := newStdinResource("stdin", strings.NewReader("Ada\r\nBob\n"))
	line, err := resource.ReadLine(time.Second)
	if err != nil || line != "Ada" {
		t.Fatalf("line = %q err = %v", line, err)
	}
	line, err = resource.ReadLine(time.Second)
	if err != nil || line != "Bob" {
		t.Fatalf("line = %q err = %v", line, err)
	}
	if _, err = resource.ReadLine(time.Second); err == nil || err.Error() != "EOF before newline" {
		t.Fatalf("err = %v, want EOF before newline", err)
	}
}

func TestStdinResourceTimesOutThenKeepsALateLine(t *testing.T) {
	pr, pw := io.Pipe()
	defer pw.Close()
	resource := newStdinResource("stdin", pr)
	start := time.Now()
	_, err := resource.ReadLine(100 * time.Millisecond)
	if err == nil || err.Error() != "timeout" {
		t.Fatalf("err = %v, want timeout", err)
	}
	if time.Since(start) < 50*time.Millisecond {
		t.Fatalf("returned before the deadline: %s", time.Since(start))
	}
	if _, err := pw.Write([]byte("Ada\n")); err != nil {
		t.Fatal(err)
	}
	line, err := resource.ReadLine(time.Second)
	if err != nil || line != "Ada" {
		t.Fatalf("line = %q err = %v", line, err)
	}
}

func TestStdinReadTimeoutIsALimitAndTraces(t *testing.T) {
	pr, pw := io.Pipe()
	defer pw.Close()
	interp := NewWithHostResources(HostResources{
		Stdin:  pr,
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	evals, steps := 10, 2
	interp.MaxEvals = &evals
	interp.MaxSteps = &steps
	interp.TraceEnabled = true
	if err := interp.LoadProgramText("stdin-timeout.thue", "^start$ ::< 0.1 stdin\n::=\nstart"); err != nil {
		t.Fatal(err)
	}
	type runResult struct {
		code int
		err  error
	}
	done := make(chan runResult, 1)
	go func() {
		code, err := interp.Run()
		done <- runResult{code, err}
	}()
	var result runResult
	select {
	case result = <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("stdin read ignored the timeout")
	}
	var limit *LimitError
	if result.code != ExitReadTimeout || !errors.As(result.err, &limit) || limit.Kind != LimitTimeout {
		t.Fatalf("code=%d err=%v", result.code, result.err)
	}
	if limit.Message != "ERR:resource:stdin:timeout" {
		t.Fatalf("message = %q", limit.Message)
	}
	if interp.State != "start" || interp.AppliedSteps != 0 || len(interp.Trace) != 1 {
		t.Fatalf("state=%q steps=%d trace=%d", interp.State, interp.AppliedSteps, len(interp.Trace))
	}
	event := interp.Trace[0]
	if event.Error != limit.Message || event.Replacement != "" || event.StateAfter != "start" {
		t.Fatalf("event = %#v", event)
	}
}

func TestStateLimitRecordsTraceThenReturns(t *testing.T) {
	interp := New()
	evals, steps, stateBytes := 10, 2, 1
	interp.MaxEvals = &evals
	interp.MaxSteps = &steps
	interp.MaxStateBytes = &stateBytes
	interp.TraceEnabled = true
	if err := interp.LoadProgramText("state-limit.thue", "^a$ ::= bb\n::=\na"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	var limit *LimitError
	if code != ExitStateLimit || !errors.As(err, &limit) || limit.Kind != LimitState {
		t.Fatalf("code=%d err=%v", code, err)
	}
	if interp.State != "a" || interp.AppliedSteps != 0 || len(interp.Trace) != 1 {
		t.Fatalf("state=%q steps=%d trace=%d", interp.State, interp.AppliedSteps, len(interp.Trace))
	}
	event := interp.Trace[0]
	if event.Replacement != "bb" || event.StateBefore != "a" || event.StateAfter != "a" || event.Error != limit.Message {
		t.Fatalf("event = %#v", event)
	}
	text, err := FormatTrace(interp.Trace)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"step":1,"ruleIndex":0,"lineNumber":1,"operator":"::=","matchStart":0,"matchEnd":1,"error":"State size (2 bytes) exceeds maximum (1 bytes)","stateBefore":"a","replacement":"bb","stateAfter":"a","exitCode":null}` + "\n"
	if text != want {
		t.Fatalf("trace = %q, want %q", text, want)
	}
}

func TestLiteralPrefixDoesNotChangeMatch(t *testing.T) {
	interp := New()
	interp.ProgramPath = "prefix.thue"
	program := "" +
		"STREQ<(?<a>[A-Za-z]+),(?<b>[A-Za-z]+)> ::= EQ<{{a}}|{{b}}>\n" +
		"^LINE<(?<n>[0-9]+)>$ ::= N<{{n}}>\n" +
		"PREFIX<(?<x>[0-9]+)> ::= V<{{x}}>\n" +
		"ABSENT<(?<x>.)> ::= BAD\n" +
		"::=\n" +
		"keep STREQ<ab,cd> and\nLINE<7>\nnope PREFIX<no>\n"
	if err := interp.parseProgram(program); err != nil {
		t.Fatal(err)
	}
	if interp.Rules[0].literalPrefix != "STREQ<" {
		t.Fatalf("prefix = %q", interp.Rules[0].literalPrefix)
	}
	if interp.Rules[1].literalPrefix != "LINE<" {
		t.Fatalf("anchored prefix = %q", interp.Rules[1].literalPrefix)
	}
	code, err := interp.Run()
	if err != nil || code != 0 {
		t.Fatalf("code=%d err=%v state=%q", code, err, interp.State)
	}
	if !strings.Contains(interp.State, "EQ<ab|cd>") || !strings.Contains(interp.State, "N<7>") {
		t.Fatalf("state = %q", interp.State)
	}
	if strings.Contains(interp.State, "V<") {
		t.Fatalf("non-match was rewritten: %q", interp.State)
	}
}

func TestLiteralPrefixSkipsCaseFold(t *testing.T) {
	if literalPrefixOf("(?i)ABC") != "" {
		t.Fatal("case-insensitive pattern must not use a case-sensitive prefix")
	}
}
