package harness

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/thuelang/thueplusplus/go/thuelang"
	"pgregory.net/rapid"
)

// RapidCap is the most checks one problem may run. CI passes -rapid.checks
// at this value. A higher flag is a failed test.
const RapidCap = 100

// Resource is one named binding. Read and Write are explicit. A resource may
// be readable, writable, or both. The problem test lists every resource.
type Resource struct {
	Name  string
	Read  bool
	Write bool
}

// Case is one resource set. Reads maps each readable resource to the lines it
// serves, in order, without newlines. Seed is set when a fixed seed drew the
// lines. Rapid cases are not recorded and do not count toward cost.
type Case struct {
	Name  string
	Seed  *uint64
	Reads map[string][]string
}

// Outcome is the baseline or the solution: one string per writable resource,
// and the exit code.
type Outcome struct {
	Writes   map[string]string
	ExitCode int
}

// Baseline is the spec. It reads the same lines the solution reads.
type Baseline func(reads map[string][]string) (Outcome, error)

// Problem is one Rosetta adaptation. The test declares the id, the resources,
// the baseline, the fixed cases, and the rapid generator. Nothing is inferred.
type Problem struct {
	ID        string
	Resources []Resource
	Cases     []Case
	Baseline  Baseline
	Draw      func(*rapid.T) Case
}

// Sample is one committed case. Other hosts replay this file.
type Sample struct {
	Name     string              `json:"name"`
	Reads    map[string][]string `json:"reads"`
	Writes   map[string]string   `json:"writes"`
	ExitCode int                 `json:"exit_code"`
}

func Seed(v uint64) *uint64 { return &v }

func Stdin(lines ...string) map[string][]string {
	return map[string][]string{"stdin": append([]string(nil), lines...)}
}

func Stdout(text string) Outcome {
	return Outcome{Writes: map[string]string{"stdout": text}, ExitCode: 0}
}

func OneInt(lines []string) (int, error) {
	if len(lines) != 1 {
		return 0, fmt.Errorf("expected one line, got %d", len(lines))
	}
	return IntLine(lines[0] + "\n")
}

// Run checks the fixed cases, then the rapid property. Rapid does not add cost.
func Run(t rapid.TB, problem Problem) {
	t.Helper()
	if _, err := rapidBudget(); err != nil {
		t.Fatalf("%s: %v", problem.ID, err)
	}
	part, err := Execute(problem)
	if err != nil {
		t.Fatal(err)
	}
	failed := false
	for _, row := range part.Rows {
		if row.Status != "pass" {
			failed = true
			if row.Error != nil {
				t.Errorf("%s/%s\n%s", problem.ID, row.Solution, *row.Error)
			}
		}
	}
	if failed {
		return
	}
	checkRapid(t, problem)
}

// Execute runs the fixed cases in-process and returns their cost. It does not
// run rapid.
func Execute(problem Problem) (Part, error) {
	started := time.Now()
	root, err := RepoRoot()
	if err != nil {
		return Part{}, err
	}
	limits, err := GlobalLimits(root)
	if err != nil {
		return Part{}, err
	}
	if err := validateProblem(problem); err != nil {
		return Part{}, err
	}
	if filepath.Base(mustWd()) != problem.ID {
		return Part{}, fmt.Errorf("test working directory must be problems/%s", problem.ID)
	}
	samples := make([]Sample, 0, len(problem.Cases))
	for _, item := range problem.Cases {
		outcome, err := problem.Baseline(copyReads(item.Reads))
		if err != nil {
			return Part{}, fmt.Errorf("%s case %s: baseline: %w", problem.ID, item.Name, err)
		}
		if err := outcomeMatches(problem.Resources, outcome); err != nil {
			return Part{}, fmt.Errorf("%s case %s: baseline: %w", problem.ID, item.Name, err)
		}
		samples = append(samples, Sample{
			Name: item.Name, Reads: copyReads(item.Reads), Writes: copyWrites(outcome.Writes), ExitCode: outcome.ExitCode,
		})
	}
	if err := syncCases(filepath.Join(mustWd(), "cases"), samples); err != nil {
		return Part{}, err
	}
	title, err := ReadmeTitle(mustWd())
	if err != nil {
		return Part{}, err
	}
	solutions, err := loadSolutions(root, problem.ID)
	if err != nil {
		return Part{}, err
	}
	rows := make([]Row, 0, len(solutions))
	for _, solution := range solutions {
		rows = append(rows, runFixed(problem, solution, samples, limits))
	}
	return Part{
		ID: problem.ID, Title: title, CaseCount: len(samples), Cases: samples, Rows: rows,
		Duration: time.Since(started).Milliseconds(),
	}, nil
}

func runFixed(problem Problem, solution Solution, samples []Sample, limits Limits) Row {
	row := Row{
		Problem: problem.ID, Solution: solution.Name, Host: "go", Environment: "go native",
		SolutionPath: solution.Path, Cases: []CaseResult{},
	}
	var steps, cost, evals, matches, stateBytes, statePeak, rules, chars int
	var duration time.Duration
	var failures []string
	ok := true
	for i, item := range problem.Cases {
		run := executeProgram(solution.PathAbs, problem.Resources, item.Reads, limits)
		duration += run.duration
		result := CaseResult{
			Name: item.Name, Seed: item.Seed,
			MaxSteps: limits.MaxSteps, MaxEvals: limits.MaxEvals,
			MaxStateBytes: limits.MaxStateBytes, TimeoutSeconds: limits.TimeoutSeconds,
			HostTimeoutSeconds: limits.TimeoutSeconds, DurationMs: run.duration.Milliseconds(),
		}
		want := Outcome{Writes: samples[i].Writes, ExitCode: samples[i].ExitCode}
		message := solutionFailure(item.Name, item.Seed, run, want)
		if message != "" {
			ok = false
			result.Status = "fail"
			result.Error = &message
			failures = append(failures, message)
		} else {
			result.Status = "pass"
			result.Steps = &run.metrics.Steps
			result.Cost = &run.metrics.Cost
			result.RegexEvals = &run.metrics.RegexEvals
			result.RegexMatches = &run.metrics.RegexMatches
			result.StateBytes = &run.metrics.StateBytes
			result.StatePeak = &run.metrics.StatePeak
			result.RuleCount = &run.metrics.RuleCount
			result.RuleChars = &run.metrics.RuleChars
			result.ExitCode = &run.outcome.ExitCode
			steps += run.metrics.Steps
			cost += run.metrics.Cost
			evals += run.metrics.RegexEvals
			matches += run.metrics.RegexMatches
			stateBytes += run.metrics.StateBytes
			if run.metrics.StatePeak > statePeak {
				statePeak = run.metrics.StatePeak
			}
			rules = run.metrics.RuleCount
			chars = run.metrics.RuleChars
		}
		row.Cases = append(row.Cases, result)
	}
	row.DurationMs = duration.Milliseconds()
	if ok {
		row.Status = "pass"
		row.Steps = &steps
		row.Cost = &cost
		row.RegexEvals = &evals
		row.RegexMatches = &matches
		row.StateBytes = &stateBytes
		row.StatePeak = &statePeak
		row.RuleCount = &rules
		row.RuleChars = &chars
		return row
	}
	row.Status = "fail"
	text := strings.Join(failures, "\n")
	row.Error = &text
	return row
}

func solutionFailure(name string, seed *uint64, run scriptRun, want Outcome) string {
	label := name
	if seed != nil {
		label = fmt.Sprintf("seed %d", *seed)
	}
	if run.err != nil {
		return label + ": " + run.err.Error()
	}
	if message := Compare(label, run.outcome, want); message != "" {
		return message
	}
	if run.metrics.RuleCount < 1 || run.metrics.RuleChars < 1 {
		return label + ": rule count and rule chars must come from the solution source"
	}
	return ""
}

// Compare reports every writable resource and the exit code that differ.
func Compare(label string, got, want Outcome) string {
	var b strings.Builder
	if got.ExitCode != want.ExitCode {
		fmt.Fprintf(&b, "%s: exit %d, baseline %d\n", label, got.ExitCode, want.ExitCode)
	}
	names := map[string]struct{}{}
	for name := range got.Writes {
		names[name] = struct{}{}
	}
	for name := range want.Writes {
		names[name] = struct{}{}
	}
	keys := make([]string, 0, len(names))
	for name := range names {
		keys = append(keys, name)
	}
	sort.Strings(keys)
	for _, name := range keys {
		if got.Writes[name] == want.Writes[name] {
			continue
		}
		fmt.Fprintf(&b, "%s: %s mismatch\n--- baseline\n%s--- solution\n%s", label, name, want.Writes[name], got.Writes[name])
	}
	return strings.TrimSuffix(b.String(), "\n")
}

// ExecuteSolution runs one program against one resource set. Limits come from
// metrics/limits.toml. The call does not start a subprocess.
func ExecuteSolution(program string, resources []Resource, reads map[string][]string) (Outcome, error) {
	root, err := RepoRoot()
	if err != nil {
		return Outcome{}, err
	}
	limits, err := GlobalLimits(root)
	if err != nil {
		return Outcome{}, err
	}
	run := executeProgram(program, resources, reads, limits)
	if run.err != nil {
		return Outcome{}, run.err
	}
	return run.outcome, nil
}

type scriptRun struct {
	outcome  Outcome
	metrics  Metrics
	duration time.Duration
	err      error
}

func executeProgram(program string, resources []Resource, reads map[string][]string, limits Limits) scriptRun {
	started := time.Now()
	finish := func(run scriptRun) scriptRun {
		run.duration = time.Since(started)
		return run
	}
	if err := limits.validate(); err != nil {
		return finish(scriptRun{err: err})
	}
	interp := thuelang.NewWithHostResources(thuelang.HostResources{
		Stdin: strings.NewReader(""), Stdout: &bytes.Buffer{}, Stderr: &bytes.Buffer{},
	})
	interp.MaxSteps = &limits.MaxSteps
	interp.MaxEvals = &limits.MaxEvals
	interp.MaxStateBytes = &limits.MaxStateBytes
	if err := interp.LoadProgram(program); err != nil {
		return finish(scriptRun{err: err})
	}
	script := thuelang.ResourceScript{Reads: copyReads(reads), Writes: writeNames(resources)}
	if err := interp.UseScripts(script); err != nil {
		return finish(scriptRun{err: err})
	}
	code, runErr := runBoundedInterpreter(interp, limits)
	writes, writeErr := interp.ScriptWrites()
	interp.Cleanup()
	if runErr != nil && code == 0 {
		code = 1
	}
	if writeErr != nil {
		return finish(scriptRun{err: writeErr})
	}
	outcome := Outcome{Writes: writes, ExitCode: code}
	if runErr != nil {
		return finish(scriptRun{outcome: outcome, err: runErr})
	}
	return finish(scriptRun{outcome: outcome, metrics: metricsFrom(interp.Metrics())})
}

func metricsFrom(got thuelang.RunMetrics) Metrics {
	return Metrics{
		Cost: got.Cost, Steps: got.AppliedSteps, RegexEvals: got.RegexEvals, RegexMatches: got.RegexMatches,
		StateBytes: got.StateBytes, StatePeak: got.StatePeak, RuleCount: got.RuleCount, RuleChars: got.RuleChars,
	}
}

func runBoundedInterpreter(interp *thuelang.Interpreter, limits Limits) (int, error) {
	type result struct {
		code int
		err  error
	}
	done := make(chan result, 1)
	go func() {
		code, err := interp.Run()
		done <- result{code, err}
	}()
	timer := time.NewTimer(time.Duration(limits.TimeoutSeconds) * time.Second)
	defer timer.Stop()
	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()
	for {
		select {
		case res := <-done:
			return res.code, res.err
		case <-timer.C:
			return 0, fmt.Errorf("timed out after %ds", limits.TimeoutSeconds)
		case <-ticker.C:
			rss, err := processRSS(os.Getpid())
			if err != nil {
				return 0, fmt.Errorf("memory cap check failed: %w", err)
			}
			if rss > int64(limits.MemoryCapBytes) {
				return 0, fmt.Errorf("memory cap (%d bytes) exceeded (rss %d bytes)", limits.MemoryCapBytes, rss)
			}
		}
	}
}

func checkRapid(t rapid.TB, problem Problem) {
	t.Helper()
	root, err := RepoRoot()
	if err != nil {
		t.Fatal(err)
	}
	limits, err := GlobalLimits(root)
	if err != nil {
		t.Fatal(err)
	}
	solutions, err := loadSolutions(root, problem.ID)
	if err != nil {
		t.Fatal(err)
	}
	rapid.Check(t, func(rt *rapid.T) {
		item := problem.Draw(rt)
		if err := caseReads(problem, item); err != nil {
			rt.Fatal(err)
		}
		want, err := problem.Baseline(copyReads(item.Reads))
		if err != nil {
			rt.Fatal(err)
		}
		if err := outcomeMatches(problem.Resources, want); err != nil {
			rt.Fatal(err)
		}
		encoded, err := json.Marshal(item.Reads)
		if err != nil {
			rt.Fatal(err)
		}
		for _, solution := range solutions {
			run := executeProgram(solution.PathAbs, problem.Resources, item.Reads, limits)
			if message := solutionFailure("rapid", nil, run, want); message != "" {
				rt.Fatalf("%s\nshrunk reads %s", message, encoded)
			}
		}
	})
}

func rapidBudget() (int, error) {
	f := flag.Lookup("rapid.checks")
	if f == nil {
		return 0, fmt.Errorf("rapid.checks is not registered")
	}
	n, err := strconv.Atoi(f.Value.String())
	if err != nil {
		return 0, fmt.Errorf("rapid.checks: %w", err)
	}
	if n < 1 || n > RapidCap {
		return 0, fmt.Errorf("rapid checks must be 1..%d, got %d", RapidCap, n)
	}
	return n, nil
}

func validateProblem(problem Problem) error {
	if problem.ID == "" {
		return fmt.Errorf("problem id is empty")
	}
	if problem.Baseline == nil {
		return fmt.Errorf("%s: no baseline", problem.ID)
	}
	if problem.Draw == nil {
		return fmt.Errorf("%s: no rapid generator", problem.ID)
	}
	if len(problem.Resources) == 0 {
		return fmt.Errorf("%s: no resources", problem.ID)
	}
	seen := map[string]struct{}{}
	readable := 0
	writable := 0
	for _, res := range problem.Resources {
		if !validName(res.Name) {
			return fmt.Errorf("%s: invalid resource %q", problem.ID, res.Name)
		}
		if _, ok := seen[res.Name]; ok {
			return fmt.Errorf("%s: duplicate resource %s", problem.ID, res.Name)
		}
		seen[res.Name] = struct{}{}
		if !res.Read && !res.Write {
			return fmt.Errorf("%s: resource %s is neither readable nor writable", problem.ID, res.Name)
		}
		if res.Read {
			readable++
		}
		if res.Write {
			writable++
		}
	}
	if writable == 0 {
		return fmt.Errorf("%s: no writable resource", problem.ID)
	}
	_ = readable
	if len(problem.Cases) == 0 {
		return fmt.Errorf("%s: no cases", problem.ID)
	}
	names := map[string]struct{}{}
	for _, item := range problem.Cases {
		if item.Name == "" {
			return fmt.Errorf("%s: a case has no name", problem.ID)
		}
		if _, ok := names[item.Name]; ok {
			return fmt.Errorf("%s: duplicate case %s", problem.ID, item.Name)
		}
		names[item.Name] = struct{}{}
		if err := caseReads(problem, item); err != nil {
			return err
		}
	}
	return nil
}

func caseReads(problem Problem, item Case) error {
	if item.Reads == nil {
		return fmt.Errorf("%s: case %s has no reads", problem.ID, item.Name)
	}
	want := map[string]struct{}{}
	for _, res := range problem.Resources {
		if res.Read {
			want[res.Name] = struct{}{}
		}
	}
	if len(item.Reads) != len(want) {
		return fmt.Errorf("%s: case %s reads %d resources, declaration has %d", problem.ID, item.Name, len(item.Reads), len(want))
	}
	for name, lines := range item.Reads {
		if _, ok := want[name]; !ok {
			return fmt.Errorf("%s: case %s reads undeclared resource %s", problem.ID, item.Name, name)
		}
		for _, line := range lines {
			if strings.ContainsAny(line, "\r\n") {
				return fmt.Errorf("%s: case %s resource %s line contains a newline", problem.ID, item.Name, name)
			}
		}
	}
	return nil
}

func outcomeMatches(resources []Resource, outcome Outcome) error {
	if outcome.Writes == nil {
		return fmt.Errorf("baseline writes are missing")
	}
	want := map[string]struct{}{}
	for _, res := range resources {
		if res.Write {
			want[res.Name] = struct{}{}
		}
	}
	if len(outcome.Writes) != len(want) {
		return fmt.Errorf("baseline writes %d resources, declaration has %d", len(outcome.Writes), len(want))
	}
	for name := range outcome.Writes {
		if _, ok := want[name]; !ok {
			return fmt.Errorf("baseline writes undeclared resource %s", name)
		}
	}
	return nil
}

func writeNames(resources []Resource) []string {
	var names []string
	for _, res := range resources {
		if res.Write {
			names = append(names, res.Name)
		}
	}
	sort.Strings(names)
	return names
}

func copyReads(in map[string][]string) map[string][]string {
	out := make(map[string][]string, len(in))
	for name, lines := range in {
		out[name] = append([]string(nil), lines...)
	}
	return out
}

func copyWrites(in map[string]string) map[string]string {
	out := make(map[string]string, len(in))
	for name, text := range in {
		out[name] = text
	}
	return out
}

func validName(name string) bool {
	if name == "" {
		return false
	}
	for i, r := range name {
		switch {
		case r == '_' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z':
		case i > 0 && r >= '0' && r <= '9':
		default:
			return false
		}
	}
	return true
}
