package thuepp_test

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/pelletier/go-toml/v2"
	"thueplusplus/go/internal/thuepp"
)

type exampleConfig struct {
	Name     string          `toml:"name"`
	Program  string          `toml:"program"`
	Input    *string         `toml:"input"`
	Timeout  float64         `toml:"timeout"`
	Bindings bindingsConfig  `toml:"bindings"`
	Requires requiresConfig  `toml:"requires"`
	Expect   expectConfig    `toml:"expect"`
	Cases    []exampleConfig `toml:"case"`
}

type bindingsConfig struct {
	Files map[string]fileBinding `toml:"files"`
	Procs map[string]string      `toml:"procs"`
}

type fileBinding struct {
	Fixture  string `toml:"fixture"`
	Writable bool   `toml:"writable"`
}

func (f *fileBinding) UnmarshalTOML(value any) error {
	switch v := value.(type) {
	case string:
		f.Fixture = v
		return nil
	case map[string]any:
		if fixture, ok := v["fixture"].(string); ok {
			f.Fixture = fixture
		}
		if writable, ok := v["writable"].(bool); ok {
			f.Writable = writable
		}
		return nil
	default:
		return fmt.Errorf("unsupported file binding TOML value %T", value)
	}
}

type requiresConfig struct {
	Commands []string `toml:"commands"`
}

type expectConfig struct {
	ExitCode         *int              `toml:"exit_code"`
	Stdout           *string           `toml:"stdout"`
	StdoutStripped   *string           `toml:"stdout_stripped"`
	StdoutStartsWith *string           `toml:"stdout_startswith"`
	StdoutContains   []string          `toml:"stdout_contains"`
	Stderr           *string           `toml:"stderr"`
	StderrStripped   *string           `toml:"stderr_stripped"`
	StderrContains   []string          `toml:"stderr_contains"`
	Files            map[string]string `toml:"files"`
}

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
	configs, err := filepath.Glob(filepath.Join(repoRoot, "examples", "*", "tests", "*.toml"))
	if err != nil {
		t.Fatal(err)
	}
	if len(configs) == 0 {
		t.Fatal("expected shared example TOML configs")
	}
	for _, configPath := range configs {
		cfg := loadConfig(t, configPath)
		for _, tc := range expandCases(cfg) {
			name := tc.Name
			if name == "" {
				name = strings.TrimSuffix(filepath.Base(configPath), filepath.Ext(configPath))
			}
			rel, _ := filepath.Rel(repoRoot, configPath)
			t.Run(rel+"/"+name, func(t *testing.T) {
				runExampleCase(t, repoRoot, configPath, tc)
			})
		}
	}
}

func loadConfig(t *testing.T, path string) exampleConfig {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var cfg exampleConfig
	if err := toml.Unmarshal(data, &cfg); err != nil {
		t.Fatalf("parse %s: %v", path, err)
	}
	return cfg
}

func expandCases(cfg exampleConfig) []exampleConfig {
	if len(cfg.Cases) == 0 {
		return []exampleConfig{cfg}
	}
	out := make([]exampleConfig, 0, len(cfg.Cases))
	for _, c := range cfg.Cases {
		merged := cfg
		merged.Cases = nil
		mergeStruct(&merged, c)
		out = append(out, merged)
	}
	return out
}

func mergeStruct(dst *exampleConfig, src exampleConfig) {
	if src.Name != "" {
		dst.Name = src.Name
	}
	if src.Program != "" {
		dst.Program = src.Program
	}
	if src.Input != nil {
		dst.Input = src.Input
	}
	if src.Timeout != 0 {
		dst.Timeout = src.Timeout
	}
	if !reflect.ValueOf(src.Bindings).IsZero() {
		dst.Bindings = src.Bindings
	}
	if !reflect.ValueOf(src.Requires).IsZero() {
		dst.Requires = src.Requires
	}
	if !reflect.ValueOf(src.Expect).IsZero() {
		dst.Expect = src.Expect
	}
}

func runExampleCase(t *testing.T, repoRoot, configPath string, tc exampleConfig) {
	t.Helper()
	for _, command := range tc.Requires.Commands {
		if _, err := exec.LookPath(command); err != nil {
			t.Skipf("missing required command %q", command)
		}
	}
	testsDir := filepath.Dir(configPath)
	program := filepath.Clean(filepath.Join(testsDir, tc.Program))
	args := []string{program}
	tmp := t.TempDir()
	boundFiles := map[string]string{}
	for name, spec := range tc.Bindings.Files {
		bound := filepath.Join(testsDir, spec.Fixture)
		if spec.Writable {
			bound = filepath.Join(tmp, name+".fixture")
			copyFile(t, filepath.Join(testsDir, spec.Fixture), bound)
		}
		boundFiles[name] = bound
		args = append(args, "--file:"+name, bound)
	}
	for name, command := range tc.Bindings.Procs {
		args = append(args, "--proc:"+name, command)
	}
	if tc.Input != nil {
		args = append(args, "--input", *tc.Input)
	}
	cmd := exec.Command(buildGoInterpreter(t, repoRoot), args...)
	cmd.Dir = repoRoot
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	err := cmd.Run()
	exitCode := 0
	if err != nil {
		if ee, ok := err.(*exec.ExitError); ok {
			exitCode = ee.ExitCode()
		} else {
			t.Fatalf("run go interpreter: %v", err)
		}
	}
	assertExpect(t, tc.Expect, exitCode, stdout.String(), stderr.String(), testsDir, boundFiles)
}

func assertExpect(t *testing.T, expect expectConfig, exitCode int, stdout, stderr, testsDir string, boundFiles map[string]string) {
	t.Helper()
	if expect.ExitCode != nil && exitCode != *expect.ExitCode {
		t.Fatalf("exit code = %d, want %d\nstdout=%q\nstderr=%q", exitCode, *expect.ExitCode, stdout, stderr)
	}
	if expect.Stdout != nil && stdout != *expect.Stdout {
		t.Fatalf("stdout = %q, want %q\nstderr=%q", stdout, *expect.Stdout, stderr)
	}
	if expect.StdoutStripped != nil && strings.TrimSpace(stdout) != *expect.StdoutStripped {
		t.Fatalf("trimmed stdout = %q, want %q\nstderr=%q", strings.TrimSpace(stdout), *expect.StdoutStripped, stderr)
	}
	if expect.StdoutStartsWith != nil && !strings.HasPrefix(strings.TrimSpace(stdout), *expect.StdoutStartsWith) {
		t.Fatalf("trimmed stdout = %q, want prefix %q\nstderr=%q", strings.TrimSpace(stdout), *expect.StdoutStartsWith, stderr)
	}
	for _, text := range expect.StdoutContains {
		if !strings.Contains(strings.TrimSpace(stdout), text) {
			t.Fatalf("trimmed stdout = %q, want to contain %q\nstderr=%q", strings.TrimSpace(stdout), text, stderr)
		}
	}
	if expect.Stderr != nil && stderr != *expect.Stderr {
		t.Fatalf("stderr = %q, want %q\nstdout=%q", stderr, *expect.Stderr, stdout)
	}
	if expect.StderrStripped != nil && strings.TrimSpace(stderr) != *expect.StderrStripped {
		t.Fatalf("trimmed stderr = %q, want %q\nstdout=%q", strings.TrimSpace(stderr), *expect.StderrStripped, stdout)
	}
	for _, text := range expect.StderrContains {
		if !strings.Contains(strings.TrimSpace(stderr), text) {
			t.Fatalf("trimmed stderr = %q, want to contain %q\nstdout=%q", strings.TrimSpace(stderr), text, stdout)
		}
	}
	for name, expectedPath := range expect.Files {
		actualPath, ok := boundFiles[name]
		if !ok {
			t.Fatalf("expected bound file %q was not bound", name)
		}
		actual, err := os.ReadFile(actualPath)
		if err != nil {
			t.Fatal(err)
		}
		expected, err := os.ReadFile(filepath.Join(testsDir, expectedPath))
		if err != nil {
			t.Fatal(err)
		}
		if !bytes.Equal(actual, expected) {
			t.Fatalf("file binding %q mismatch\n got: %q\nwant: %q", name, string(actual), string(expected))
		}
	}
}

func copyFile(t *testing.T, src, dst string) {
	t.Helper()
	data, err := os.ReadFile(src)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(dst, data, 0o644); err != nil {
		t.Fatal(err)
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
