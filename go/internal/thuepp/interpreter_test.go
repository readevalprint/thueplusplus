// SPDX-License-Identifier: AGPL-3.0-or-later
package thuepp

import (
	"bytes"
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
	if err := interp.parseProgram("@IN@ ::< 1s 1 lines stdin\n^(?<x>[A-Za-z0-9_.-]+)$ ::> stdout {{x|pctdec}}\\n\n::=\n@IN@"); err != nil {
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

func TestProcessResourceDrainsBufferedOutputAfterFastExit(t *testing.T) {
	for i := 0; i < 100; i++ {
		resource := newProcessResource("worker", "printf 'alpha\\nbeta\\n'")
		line, err := resource.ReadLines(1, time.Second)
		if err != nil {
			resource.Cleanup()
			t.Fatalf("ReadLine #1 error on iteration %d: %v", i, err)
		}
		if line != "alpha" {
			resource.Cleanup()
			t.Fatalf("ReadLine #1 on iteration %d = %q, want alpha", i, line)
		}
		line, err = resource.ReadLines(1, time.Second)
		if err != nil {
			resource.Cleanup()
			t.Fatalf("ReadLine #2 error on iteration %d: %v", i, err)
		}
		if line != "beta" {
			resource.Cleanup()
			t.Fatalf("ReadLine #2 on iteration %d = %q, want beta", i, line)
		}
		resource.Cleanup()
	}
}

func TestProcessResourceCleanupUnblocksFullOutputChannel(t *testing.T) {
	resource := newProcessResource("worker", "yes alpha")
	line, err := resource.ReadLines(1, time.Second)
	if err != nil {
		resource.Cleanup()
		t.Fatalf("ReadLine error: %v", err)
	}
	if line != "alpha" {
		resource.Cleanup()
		t.Fatalf("ReadLine = %q, want alpha", line)
	}

	time.Sleep(50 * time.Millisecond)
	resource.Cleanup()
	select {
	case <-resource.exitCh:
	case <-time.After(time.Second):
		t.Fatal("Cleanup did not unblock stdout reader and reap process")
	}
}

func TestProcessResourceReportsProcessErrorWhenNoLineIsAvailable(t *testing.T) {
	resource := newProcessResource("worker", "sh -c 'echo child-error >&2; exit 7'")
	_, err := resource.ReadLines(1, time.Second)
	resource.Cleanup()
	if err == nil {
		t.Fatal("ReadLines succeeded, want process error")
	}
	if got := err.Error(); !strings.Contains(got, "child-error") {
		t.Fatalf("ReadLines error = %q, want child stderr", got)
	}
}

func TestCountedResourceReadUsesLiteralByteCount(t *testing.T) {
	var stdout, stderr bytes.Buffer
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader("abcdef"),
		Stdout: &stdout,
		Stderr: &stderr,
	})
	interp.ProgramPath = "test.tpp"
	program := "^read$ ::< 1s 4 bytes stdin\n^(?<x>[A-Za-z0-9_.-]+)$ ::> stdout {{x|pctdec}}\\n\n::=\nread"
	if err := interp.parseProgram(program); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	if got, want := stdout.String(), "abcd\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
}

func TestCountedResourceReadUsesCapturedLineCount(t *testing.T) {
	var stdout, stderr bytes.Buffer
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader("alpha\nbeta\ngamma\n"),
		Stdout: &stdout,
		Stderr: &stderr,
	})
	interp.ProgramPath = "test.tpp"
	program := "^read:(?<n>[0-9]+)$ ::< 1s {{n}} lines stdin\n^(?<x>[A-Za-z0-9_.% -]+)$ ::> stdout {{x|pctdec}}\\n\n::=\nread:2"
	if err := interp.parseProgram(program); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	if got, want := stdout.String(), "alpha\nbeta\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
}

func TestCountedResourceReadTemplatesAllOperands(t *testing.T) {
	var stdout, stderr bytes.Buffer
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader("abcdef"),
		Stdout: &stdout,
		Stderr: &stderr,
	})
	interp.ProgramPath = "test.tpp"
	program := "^read:(?<timeout>1s):(?<n>[0-9]+):(?<unit>bytes):(?<resource>stdin)$ ::< {{timeout}} {{n}} {{unit}} {{resource}}\n^(?<x>[A-Za-z0-9_.-]+)$ ::> stdout {{x|pctdec}}\\n\n::=\nread:1s:4:bytes:stdin"
	if err := interp.parseProgram(program); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if code != 0 {
		t.Fatalf("exit code = %d, want 0", code)
	}
	if got, want := stdout.String(), "abcd\n"; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
}

func TestCountedResourceReadAllowsZeroBytes(t *testing.T) {
	var stdout, stderr bytes.Buffer
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader("abcdef"),
		Stdout: &stdout,
		Stderr: &stderr,
	})
	interp.ProgramPath = "test.tpp"
	program := "^read$ ::< 1s 0 bytes stdin\n^$ ::- 7\n::=\nread"
	if err := interp.parseProgram(program); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if code != 7 {
		t.Fatalf("exit code = %d, want 7", code)
	}
	if got, want := stdout.String(), ""; got != want {
		t.Fatalf("stdout = %q, want %q", got, want)
	}
}

func TestCountedResourceReadRejectsUnknownUnit(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader("ok"),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	interp.ProgramPath = "test.tpp"
	if err := interp.parseProgram("^read$ ::< 1s 1 chars stdin\n::=\nread"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	if err == nil {
		t.Fatal("Run succeeded, want unknown unit error")
	}
	if code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if got, want := err.Error(), "Line 1: ::< unit must be bytes or lines"; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestCountedResourceReadReportsEOFBeforeBytes(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader("abc"),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	interp.ProgramPath = "test.tpp"
	if err := interp.parseProgram("^read$ ::< 1s 4 bytes stdin\n::=\nread"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	if err == nil {
		t.Fatal("Run succeeded, want EOF before bytes error")
	}
	if code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if got, want := err.Error(), "ERR:resource:stdin:EOF before 4 bytes"; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestCountedResourceReadReportsEOFBeforeLines(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader("alpha\n"),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	interp.ProgramPath = "test.tpp"
	if err := interp.parseProgram("^read$ ::< 1s 2 lines stdin\n::=\nread"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	if err == nil {
		t.Fatal("Run succeeded, want EOF before lines error")
	}
	if code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if got, want := err.Error(), "ERR:resource:stdin:EOF before 2 lines"; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestCountedResourceReadRejectsOldImplicitForm(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader("ok\n"),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	interp.ProgramPath = "test.tpp"
	if err := interp.parseProgram("@IN@ ::< 1s stdin\n::=\n@IN@"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	if err == nil {
		t.Fatal("Run succeeded, want counted read syntax error")
	}
	if code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if got, want := err.Error(), "Line 1: ::< requires timeout, count, unit, and resource"; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestCountedResourceReadRejectsMissingCaptureCount(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader("ok"),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	interp.ProgramPath = "test.tpp"
	if err := interp.parseProgram("^read$ ::< 1s n bytes stdin\n::=\nread"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	if err == nil {
		t.Fatal("Run succeeded, want missing capture error")
	}
	if code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if got, want := err.Error(), "Line 1: ::< count must be a non-negative integer, got 'n'; use '{{capture}}' for dynamic counts"; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestCountedResourceReadRejectsNonNumericCaptureCount(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader("ok"),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	interp.ProgramPath = "test.tpp"
	if err := interp.parseProgram("^read:(?<n>[A-Za-z]+)$ ::< 1s {{n}} bytes stdin\n::=\nread:abc"); err != nil {
		t.Fatal(err)
	}
	code, err := interp.Run()
	if err == nil {
		t.Fatal("Run succeeded, want invalid capture count error")
	}
	if code != 1 {
		t.Fatalf("exit code = %d, want 1", code)
	}
	if got, want := err.Error(), "Line 1: ::< count must be a non-negative integer, got 'abc'; use '{{capture}}' for dynamic counts"; got != want {
		t.Fatalf("error = %q, want %q", got, want)
	}
}

func TestReadTimeoutAcceptsExplicitDurationUnits(t *testing.T) {
	cases := []string{"1ms", "500ms", "1s", "1m"}
	for _, timeout := range cases {
		t.Run(timeout, func(t *testing.T) {
			var stdout, stderr bytes.Buffer
			interp := NewWithHostResources(HostResources{
				Stdin:  strings.NewReader("ok\n"),
				Stdout: &stdout,
				Stderr: &stderr,
			})
			interp.ProgramPath = "test.tpp"
			program := "@IN@ ::< " + timeout + " 1 lines stdin\n^(?<x>[A-Za-z0-9_.-]+)$ ::> stdout {{x|pctdec}}\\n\n::=\n@IN@"
			if err := interp.parseProgram(program); err != nil {
				t.Fatal(err)
			}
			code, err := interp.Run()
			if err != nil {
				t.Fatalf("Run error: %v", err)
			}
			if code != 0 {
				t.Fatalf("exit code = %d, want 0", code)
			}
			if got := stdout.String(); got != "ok\n" {
				t.Fatalf("stdout = %q, want %q", got, "ok\n")
			}
		})
	}
}

func TestReadTimeoutRejectsImplicitSecondsAndUnsupportedUnits(t *testing.T) {
	cases := []string{"1", "30", "0.5", "1h", "1us", "1ns", "1sec", "0s", "0ms", "-1s"}
	for _, timeout := range cases {
		t.Run(timeout, func(t *testing.T) {
			interp := NewWithHostResources(HostResources{
				Stdin:  strings.NewReader("ok\n"),
				Stdout: &bytes.Buffer{},
				Stderr: &bytes.Buffer{},
			})
			interp.ProgramPath = "test.tpp"
			program := "@IN@ ::< " + timeout + " 1 lines stdin\n::=\n@IN@"
			if err := interp.parseProgram(program); err != nil {
				t.Fatal(err)
			}
			code, err := interp.Run()
			if err == nil {
				t.Fatalf("Run succeeded for timeout %q, want invalid timeout error", timeout)
			}
			if code != 1 {
				t.Fatalf("exit code = %d, want 1", code)
			}
			want := "Line 1: invalid read timeout '" + timeout + "'"
			if got := err.Error(); got != want {
				t.Fatalf("error = %q, want %q", got, want)
			}
		})
	}
}

func TestBulkResourceReadFailsLoud(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader("hello\n"),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	interp.ProgramPath = "test.tpp"
	if err := interp.parseProgram("@IN@ ::< -1 1 lines stdin\n::=\n@IN@"); err != nil {
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
	if err := interp.parseProgram("@N@ ::< 1s 1 lines once\n^(?<n>[0-9]+)$ ::> stdout {{n}}\\n\n::=\n@N@"); err != nil {
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
	if got, want := interp.RuleCoverageTSV(), "virtual/main.tpp:1	1\nvirtual/main.tpp:2	1\n"; got != want {
		t.Fatalf("RuleCoverageTSV() = %q, want %q", got, want)
	}
	if got, want := interp.RuleListTSV(), "virtual/main.tpp:1	foo ::= bar\nvirtual/main.tpp:2	bar ::- 0\n"; got != want {
		t.Fatalf("RuleListTSV() = %q, want %q", got, want)
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
}

func TestCumulativeStateBytesCountsEveryEvalCheck(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader(""),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	if err := interp.LoadProgramText("metrics.tpp", "^z$ ::= nope\n^a$ ::= b\n^b$ ::- 0\n::=\na"); err != nil {
		t.Fatalf("LoadProgramText: %v", err)
	}
	code, err := interp.Run()
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	if code != 0 {
		t.Fatalf("exit code = %d", code)
	}
	if got, want := interp.EvalCheckCount, 5; got != want {
		t.Fatalf("EvalCheckCount = %d, want %d", got, want)
	}
	if got, want := interp.CumulativeStateBytes, 5; got != want {
		t.Fatalf("CumulativeStateBytes = %d, want %d", got, want)
	}
}

func TestTraceRecordsMatchedRuleError(t *testing.T) {
	interp := NewWithHostResources(HostResources{
		Stdin:  strings.NewReader(""),
		Stdout: &bytes.Buffer{},
		Stderr: &bytes.Buffer{},
	})
	interp.TraceEnabled = true
	if err := interp.LoadProgramText("builtin-error.tpp", "^div:(?<a>[0-9]+),(?<b>[0-9]+)$ ::! div {{a}} {{b}}\n::=\ndiv:1,0"); err != nil {
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
