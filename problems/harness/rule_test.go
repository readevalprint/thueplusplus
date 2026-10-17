package harness

import (
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"pgregory.net/rapid"
)

func TestPassRule(t *testing.T) {
	dir := t.TempDir()
	program := filepath.Join(dir, "both.thue")
	source := "" +
		`\A\z ::= a\nb\nc` + "\n" +
		`^a\n ::> stdout OUT\n` + "\n" +
		`^b\n ::> stderr ERR\n` + "\n" +
		`^c\n?$ ::- 0` + "\n" +
		"\n::=\n"
	if err := os.WriteFile(program, []byte(source), 0o644); err != nil {
		t.Fatal(err)
	}
	resources := []Resource{
		{Name: "stdout", Write: true},
		{Name: "stderr", Write: true},
	}
	got, err := ExecuteSolution(program, resources, map[string][]string{})
	if err != nil {
		t.Fatal(err)
	}
	good := Outcome{Writes: map[string]string{"stdout": "OUT\n", "stderr": "ERR\n"}, ExitCode: 0}
	if message := Compare("case", got, good); message != "" {
		t.Fatal(message)
	}
	if message := Compare("case", got, Outcome{Writes: map[string]string{"stdout": "NO\n", "stderr": "ERR\n"}, ExitCode: 0}); message == "" {
		t.Fatal("stdout mismatch was accepted")
	}
	if message := Compare("case", got, Outcome{Writes: map[string]string{"stdout": "OUT\n", "stderr": "NO\n"}, ExitCode: 0}); message == "" {
		t.Fatal("stderr mismatch was accepted")
	}
	if message := Compare("case", got, Outcome{Writes: good.Writes, ExitCode: 7}); message == "" {
		t.Fatal("exit mismatch was accepted")
	}
}

func TestCostIgnoresRapid(t *testing.T) {
	dir := t.TempDir()
	program := filepath.Join(dir, "echo.thue")
	source := "" +
		`^n\n?$ ::< 30 stdin` + "\n" +
		`\A(?<d>[0-9]+)\n?\z ::> stdout {{d}}\n` + "\n" +
		`^done\n?$ ::- 0` + "\n" +
		`\A\z ::= done` + "\n" +
		"\n::=\nn\n"
	if err := os.WriteFile(program, []byte(source), 0o644); err != nil {
		t.Fatal(err)
	}
	resources := []Resource{
		{Name: "stdin", Read: true},
		{Name: "stdout", Write: true},
	}
	root, err := RepoRoot()
	if err != nil {
		t.Fatal(err)
	}
	limits, err := GlobalLimits(root)
	if err != nil {
		t.Fatal(err)
	}
	reads := Stdin("0")
	fixed := executeProgram(program, resources, reads, limits)
	if fixed.err != nil || fixed.metrics.Cost == 0 {
		t.Fatalf("fixed run: cost %d err %v", fixed.metrics.Cost, fixed.err)
	}
	problem := Problem{
		ID:        "cost",
		Resources: resources,
		Cases:     []Case{{Name: "zero", Reads: reads}},
	}
	sample := Sample{Name: "zero", Reads: reads, Writes: map[string]string{"stdout": "0\n"}, ExitCode: 0}
	row := runFixed(problem, Solution{Name: "direct", PathAbs: program}, []Sample{sample}, limits)
	if row.Cost == nil || *row.Cost != fixed.metrics.Cost {
		t.Fatalf("row cost = %v, fixed %d", row.Cost, fixed.metrics.Cost)
	}
	held := *row.Cost
	previous := flag.Lookup("rapid.nofailfile").Value.String()
	t.Cleanup(func() { _ = flag.Set("rapid.nofailfile", previous) })
	if err := flag.Set("rapid.nofailfile", "true"); err != nil {
		t.Fatal(err)
	}
	stub := &captureTB{name: t.Name()}
	rapid.Check(stub, func(rt *rapid.T) {
		n := rapid.IntRange(1, 9).Draw(rt, "n")
		extra := executeProgram(program, resources, Stdin(fmt.Sprintf("%d", n)), limits)
		if extra.err != nil || extra.metrics.Cost == 0 {
			rt.Fatalf("rapid run cost %d err %v", extra.metrics.Cost, extra.err)
		}
	})
	if stub.failed {
		t.Fatal(stub.text)
	}
	if row.Cost == nil || *row.Cost != held {
		t.Fatalf("rapid changed cost from %d to %v", held, row.Cost)
	}
}

func TestRapidCap(t *testing.T) {
	previous := flag.Lookup("rapid.checks").Value.String()
	t.Cleanup(func() { _ = flag.Set("rapid.checks", previous) })
	if err := flag.Set("rapid.checks", "101"); err != nil {
		t.Fatal(err)
	}
	if _, err := rapidBudget(); err == nil {
		t.Fatal("101 rapid checks were accepted")
	}
	if err := flag.Set("rapid.checks", "100"); err != nil {
		t.Fatal(err)
	}
	n, err := rapidBudget()
	if err != nil || n != 100 {
		t.Fatalf("budget = %d, %v", n, err)
	}
}

func TestBrokenSolutionShrinks(t *testing.T) {
	previous := flag.Lookup("rapid.nofailfile").Value.String()
	t.Cleanup(func() { _ = flag.Set("rapid.nofailfile", previous) })
	if err := flag.Set("rapid.nofailfile", "true"); err != nil {
		t.Fatal(err)
	}
	dir := t.TempDir()
	program := filepath.Join(dir, "broken.thue")
	source := "" +
		`^n\n?$ ::< 30 stdin` + "\n" +
		`\A0\n?\z ::> stdout 0\n` + "\n" +
		`\A(?<d>[0-9]+)\n?\z ::> stdout no\n` + "\n" +
		`^done\n?$ ::- 0` + "\n" +
		`\A\z ::= done` + "\n" +
		"\n::=\nn\n"
	if err := os.WriteFile(program, []byte(source), 0o644); err != nil {
		t.Fatal(err)
	}
	resources := []Resource{
		{Name: "stdin", Read: true},
		{Name: "stdout", Write: true},
	}
	root, err := RepoRoot()
	if err != nil {
		t.Fatal(err)
	}
	limits, err := GlobalLimits(root)
	if err != nil {
		t.Fatal(err)
	}
	stub := &captureTB{name: t.Name()}
	rapid.Check(stub, func(rt *rapid.T) {
		n := rapid.IntRange(0, 3).Draw(rt, "n")
		reads := Stdin(fmt.Sprintf("%d", n))
		want := Stdout(fmt.Sprintf("%d\n", n))
		run := executeProgram(program, resources, reads, limits)
		if message := solutionFailure("rapid", nil, run, want); message != "" {
			rt.Fatalf("%s\nshrunk reads {\"stdin\":[%q]}", message, fmt.Sprintf("%d", n))
		}
	})
	if !stub.failed {
		t.Fatal("broken solution passed")
	}
	if !strings.Contains(stub.text, `{"stdin":["1"]}`) {
		t.Fatalf("shrink did not reach stdin 1:\n%s", stub.text)
	}
	fmt.Println("shrink: 1")
}

type captureTB struct {
	name   string
	text   string
	failed bool
}

func (c *captureTB) Helper()              {}
func (c *captureTB) Name() string         { return c.name }
func (c *captureTB) Logf(string, ...any)  {}
func (c *captureTB) Log(...any)           {}
func (c *captureTB) Skipf(string, ...any) {}
func (c *captureTB) Skip(...any)          {}
func (c *captureTB) SkipNow()             {}
func (c *captureTB) Errorf(format string, args ...any) {
	c.failed = true
	c.text += fmt.Sprintf(format, args...)
}
func (c *captureTB) Error(args ...any) { c.Errorf("%s", fmt.Sprint(args...)) }
func (c *captureTB) Fatalf(format string, args ...any) {
	c.Errorf(format, args...)
}
func (c *captureTB) Fatal(args ...any) { c.Error(args...) }
func (c *captureTB) FailNow()          { c.failed = true }
func (c *captureTB) Fail()             { c.failed = true }
func (c *captureTB) Failed() bool      { return c.failed }
