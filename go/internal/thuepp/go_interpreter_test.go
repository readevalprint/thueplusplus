package thuepp_test

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"thueplusplus/go/internal/thuepp"
)

func TestGoInterpreterRunsHelloExample(t *testing.T) {
	repoRoot := findRepoRoot(t)
	cmd := exec.Command(buildGoInterpreter(t, repoRoot), "examples/hello/hello.tpp")
	cmd.Dir = repoRoot
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err != nil {
		t.Fatalf("go interpreter failed: %v\nstderr:\n%s", err, stderr.String())
	}
	if got, want := stdout.String(), "Hello, World!\n"; got != want {
		t.Fatalf("stdout mismatch\n got: %q\nwant: %q\nstderr: %q", got, want, stderr.String())
	}
	if got := stderr.String(); got != "" {
		t.Fatalf("stderr = %q, want empty", got)
	}
}

func TestGoInterpreterNumericLiteralLengthIsBounded(t *testing.T) {
	repoRoot := findRepoRoot(t)
	tmp := t.TempDir()
	maxLen := strings.Repeat("1", thuepp.MaxNumericLiteralChars)
	boundaryPath := filepath.Join(tmp, "numeric-boundary.tpp")
	boundaryProgram := "^(?<a>[0-9]+),(?<b>[0-9]+)$ ::! add a b\n^" + maxLen + "$ ::- 7\n\n::=\n" + maxLen + ",0\n"
	if err := os.WriteFile(boundaryPath, []byte(boundaryProgram), 0644); err != nil {
		t.Fatal(err)
	}
	boundaryCmd := exec.Command(buildGoInterpreter(t, repoRoot), boundaryPath)
	boundaryCmd.Dir = repoRoot
	var boundaryStderr bytes.Buffer
	boundaryCmd.Stderr = &boundaryStderr
	if err := boundaryCmd.Run(); err == nil {
		t.Fatal("go interpreter exit = 0, want 7")
	} else if ee, ok := err.(*exec.ExitError); !ok || ee.ExitCode() != 7 {
		t.Fatalf("go interpreter exit = %v, want 7\nstderr=%q", err, boundaryStderr.String())
	}

	programPath := filepath.Join(tmp, "numeric-limit.tpp")
	program := "^(?<a>[0-9]+),(?<b>[0-9]+)$ ::! add a b\n\n::=\n" + strings.Repeat("1", thuepp.MaxNumericLiteralChars+1) + ",1\n"
	if err := os.WriteFile(programPath, []byte(program), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(buildGoInterpreter(t, repoRoot), programPath)
	cmd.Dir = repoRoot
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err == nil {
		t.Fatal("go interpreter exit = 0, want numeric length error")
	}
	if got := stdout.String(); got != "" {
		t.Fatalf("stdout = %q, want empty", got)
	}
	want := "Builtin 'add' numeric input exceeds maximum length (4096 characters)"
	if !strings.Contains(stderr.String(), want) {
		t.Fatalf("stderr = %q, want to contain %q", stderr.String(), want)
	}
}

func TestGoInterpreterTemplateExpansionDoesNotSpecialCaseLispBindings(t *testing.T) {
	repoRoot := findRepoRoot(t)
	tmp := t.TempDir()
	programPath := filepath.Join(tmp, "generic-template.tpp")
	program := "^(?<n>x),(?<v>1),(?<b>old)$ ::= B:|{{n}}={{v}},{{b}}\n^B:(?<out>.*)$ ::> stdout {{out}}\\n\n::=\nx,1,old\n"
	if err := os.WriteFile(programPath, []byte(program), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(buildGoInterpreter(t, repoRoot), programPath)
	cmd.Dir = repoRoot
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		t.Fatalf("go interpreter failed: %v\nstderr:\n%s", err, stderr.String())
	}
	if got, want := stdout.String(), "|x=1,old\n"; got != want {
		t.Fatalf("template output mismatch\n got: %q\nwant: %q\nstderr: %q", got, want, stderr.String())
	}
}

func TestGoCLIInputOverrideParsing(t *testing.T) {
	repoRoot := findRepoRoot(t)
	goBin := buildGoInterpreter(t, repoRoot)
	tmp := t.TempDir()
	programPath := filepath.Join(tmp, "input-override.tpp")
	program := strings.Join([]string{
		`^abc$ ::- 11`,
		`^xyz$ ::- 12`,
		`^$ ::- 13`,
		`^from-program$ ::- 14`,
		``,
		`::=`,
		`from-program`,
		``,
	}, "\n")
	if err := os.WriteFile(programPath, []byte(program), 0644); err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		name     string
		args     []string
		wantCode int
	}{
		{name: "separate input arg", args: []string{"--input", "abc"}, wantCode: 11},
		{name: "equals input arg", args: []string{"--input=xyz"}, wantCode: 12},
		{name: "explicit empty input", args: []string{"--input", ""}, wantCode: 13},
		{name: "empty equals input", args: []string{"--input="}, wantCode: 13},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			cmdArgs := append([]string{programPath}, tt.args...)
			cmd := exec.Command(goBin, cmdArgs...)
			cmd.Dir = repoRoot
			var stdout, stderr bytes.Buffer
			cmd.Stdout = &stdout
			cmd.Stderr = &stderr
			if err := cmd.Run(); err == nil {
				t.Fatalf("go interpreter exit = 0, want %d", tt.wantCode)
			} else if ee, ok := err.(*exec.ExitError); !ok || ee.ExitCode() != tt.wantCode {
				t.Fatalf("go interpreter exit = %v, want %d\nstderr: %s", err, tt.wantCode, stderr.String())
			}
			if got := stdout.String(); got != "" {
				t.Fatalf("stdout = %q, want empty", got)
			}
			if got := stderr.String(); got != "" {
				t.Fatalf("stderr = %q, want empty", got)
			}
		})
	}
}

func TestGoCLIUnknownArgumentFailsLoudly(t *testing.T) {
	repoRoot := findRepoRoot(t)
	cmd := exec.Command(buildGoInterpreter(t, repoRoot), "examples/hello/hello.tpp", "--bogus")
	cmd.Dir = repoRoot
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err == nil {
		t.Fatal("go interpreter exit = 0, want unknown argument failure")
	}
	if got := stdout.String(); got != "" {
		t.Fatalf("stdout = %q, want empty", got)
	}
	want := "Error: Unknown argument: --bogus"
	if !strings.Contains(stderr.String(), want) {
		t.Fatalf("stderr = %q, want to contain %q", stderr.String(), want)
	}
}

func TestGoInterpreterRuleCoverageCountsSuccessfulApplications(t *testing.T) {
	repoRoot := findRepoRoot(t)
	tmp := t.TempDir()
	programPath := filepath.Join(tmp, "coverage.tpp")
	coveragePath := filepath.Join(tmp, "coverage.tsv")
	program := "a ::= b\nb ::= c\nc ::- 7\n\n::=\na\n"
	if err := os.WriteFile(programPath, []byte(program), 0644); err != nil {
		t.Fatal(err)
	}
	cmd := exec.Command(buildGoInterpreter(t, repoRoot), programPath, "--rule-coverage", coveragePath)
	cmd.Dir = repoRoot
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	if err == nil {
		t.Fatalf("go interpreter exit = 0, want 7")
	}
	if ee, ok := err.(*exec.ExitError); !ok || ee.ExitCode() != 7 {
		t.Fatalf("go interpreter exit = %v, want 7\nstderr=%q", err, stderr.String())
	}
	if got := stdout.String(); got != "" {
		t.Fatalf("stdout = %q, want empty", got)
	}
	gotBytes, err := os.ReadFile(coveragePath)
	if err != nil {
		t.Fatal(err)
	}
	want := fmt.Sprintf("%s:1\t1\n%s:2\t1\n%s:3\t1\n", filepath.ToSlash(programPath), filepath.ToSlash(programPath), filepath.ToSlash(programPath))
	if got := string(gotBytes); got != want {
		t.Fatalf("coverage mismatch\n got: %q\nwant: %q", got, want)
	}
}

func TestGoInterpreterSharedExamples(t *testing.T) {
	repoRoot := findRepoRoot(t)
	goBin := buildGoInterpreter(t, repoRoot)
	configs, err := filepath.Glob(filepath.Join(repoRoot, "examples", "*", "tests", "*.toml"))
	if err != nil {
		t.Fatal(err)
	}
	if len(configs) == 0 {
		t.Fatal("expected shared example TOML configs")
	}
	args := []string{
		"tools/run-example-manifests",
		"--interpreter", "go=" + goBin,
	}
	args = append(args, configs...)
	cmd := exec.Command("python3", args...)
	cmd.Dir = repoRoot
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		t.Fatalf("shared example runner failed: %v\nstdout:\n%s\nstderr:\n%s", err, stdout.String(), stderr.String())
	}
	if !strings.Contains(stdout.String(), "run:") {
		t.Fatalf("shared example runner stdout = %q, want run summary", stdout.String())
	}
}

func findRepoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "examples")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatalf("could not find repo root from %s", strings.TrimSpace(dir))
		}
		dir = parent
	}
}

func Example_goInterpreterCommand() {
	fmt.Println("go run ./cmd/thuepp examples/hello/hello.tpp")
	// Output: go run ./cmd/thuepp examples/hello/hello.tpp
}

func buildGoInterpreter(t *testing.T, repoRoot string) string {
	t.Helper()
	bin := filepath.Join(t.TempDir(), "thuepp")
	cmd := exec.Command("go", "build", "-o", bin, "./cmd/thuepp")
	cmd.Dir = filepath.Join(repoRoot, "go")
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		t.Fatalf("build go interpreter: %v\nstderr:\n%s", err, stderr.String())
	}
	return bin
}
