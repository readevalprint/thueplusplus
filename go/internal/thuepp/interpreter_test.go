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
	if err := interp.parseProgram("@IN@ ::< 1s stdin\n^(?<x>[A-Za-z0-9_.-]+)$ ::> stdout {{x|pctdec}}\\n\n::=\n@IN@"); err != nil {
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
		line, err := resource.ReadLine(time.Second)
		if err != nil {
			resource.Cleanup()
			t.Fatalf("ReadLine #1 error on iteration %d: %v", i, err)
		}
		if line != "alpha" {
			resource.Cleanup()
			t.Fatalf("ReadLine #1 on iteration %d = %q, want alpha", i, line)
		}
		line, err = resource.ReadLine(time.Second)
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
			program := "@IN@ ::< " + timeout + " stdin\n^(?<x>[A-Za-z0-9_.-]+)$ ::> stdout {{x|pctdec}}\\n\n::=\n@IN@"
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
			program := "@IN@ ::< " + timeout + " stdin\n::=\n@IN@"
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
	if err := interp.parseProgram("@N@ ::< 1s once\n^(?<n>[0-9]+)$ ::> stdout {{n}}\\n\n::=\n@N@"); err != nil {
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
