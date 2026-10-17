package harness

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"

	"github.com/thuelang/thueplusplus/go/thue"
)

// Case is one stdin the harness passes to the guest. Seed is set when the
// stdin was drawn from that seed. The guest does not see the seed.
type Case struct {
	Name  string
	Seed  *uint64
	Stdin string
}

func Seed(v uint64) *uint64 { return &v }

// Task is one golden program. Reference is the baseline for the same stdin
// the guest receives. Cases are whatever this task needs: fixed edges, seeded
// inputs, or both.
type Task struct {
	ID        string
	Limits    Limits
	Cases     []Case
	Reference func(stdin string) (string, error)
}

type Sample struct {
	Name     string `json:"name"`
	Stdin    string `json:"stdin"`
	Stdout   string `json:"stdout"`
	Stderr   string `json:"stderr"`
	ExitCode int    `json:"exit_code"`
}

type CaseResult struct {
	Name               string  `json:"name"`
	Seed               *uint64 `json:"seed"`
	Status             string  `json:"status"`
	StepCount          *int    `json:"step_count"`
	ProbeCount         *int    `json:"probe_count"`
	ExitCode           *int    `json:"exit_code"`
	DurationMs         int64   `json:"duration_ms"`
	Error              *string `json:"error"`
	MaxSteps           int     `json:"max_steps"`
	MaxEvals           int     `json:"max_evals"`
	MaxStateBytes      int     `json:"max_state_bytes"`
	TimeoutSeconds     int     `json:"timeout_seconds"`
	HostTimeoutSeconds int     `json:"host_timeout_seconds"`
}

type Row struct {
	Task           string       `json:"task"`
	Guest          string       `json:"guest"`
	Host           string       `json:"host"`
	Environment    string       `json:"environment"`
	Status         string       `json:"status"`
	StepCount      *int         `json:"step_count"`
	ProbeCount     *int         `json:"probe_count"`
	GuestRuleCount int          `json:"guest_rule_count"`
	SolutionBytes  *int         `json:"solution_bytes"`
	SolutionLines  *int         `json:"solution_lines"`
	SolutionPath   *string      `json:"solution_path"`
	Reason         *string      `json:"reason"`
	DurationMs     int64        `json:"duration_ms"`
	Cases          []CaseResult `json:"cases"`
	Error          *string      `json:"error"`
}

type Part struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	CaseCount int      `json:"case_count"`
	Cases     []Sample `json:"cases"`
	Rows      []Row    `json:"rows"`
	Duration  int64    `json:"duration_ms"`
}

func Run(t *testing.T, task Task) {
	t.Helper()
	part, err := Execute(task)
	if err != nil {
		t.Fatal(err)
	}
	if os.Getenv("THUE_TASK_RECORD") == "1" {
		if err := writePart(part); err != nil {
			t.Fatal(err)
		}
	}
	for _, row := range part.Rows {
		if row.Status == "fail" && row.Error != nil {
			t.Errorf("%s/%s\n%s", task.ID, row.Guest, *row.Error)
		}
	}
}

func Execute(task Task) (Part, error) {
	started := time.Now()
	if err := task.Limits.validate(); err != nil {
		return Part{}, fmt.Errorf("%s: %w", task.ID, err)
	}
	if len(task.Cases) == 0 {
		return Part{}, fmt.Errorf("%s: no cases", task.ID)
	}
	if task.Reference == nil {
		return Part{}, fmt.Errorf("%s: no reference", task.ID)
	}
	seen := map[string]struct{}{}
	samples := make([]Sample, 0, len(task.Cases))
	for _, item := range task.Cases {
		if item.Name == "" {
			return Part{}, fmt.Errorf("%s: a case has no name", task.ID)
		}
		if _, ok := seen[item.Name]; ok {
			return Part{}, fmt.Errorf("%s: duplicate case %s", task.ID, item.Name)
		}
		seen[item.Name] = struct{}{}
		stdout, err := task.Reference(item.Stdin)
		if err != nil {
			return Part{}, fmt.Errorf("%s case %s: reference: %w", task.ID, item.Name, err)
		}
		samples = append(samples, Sample{
			Name: item.Name, Stdin: item.Stdin, Stdout: stdout, Stderr: "", ExitCode: 0,
		})
	}
	root, err := RepoRoot()
	if err != nil {
		return Part{}, err
	}
	if filepath.Base(mustWd()) != task.ID {
		return Part{}, fmt.Errorf("test working directory must be tasks/%s", task.ID)
	}
	if err := RequireNativeGo(root); err != nil {
		return Part{}, err
	}
	title, err := TaskTitle(mustWd())
	if err != nil {
		return Part{}, err
	}
	guests, err := LoadGuests(root)
	if err != nil {
		return Part{}, err
	}
	solutions, err := loadSolutions(root, task.ID, guests)
	if err != nil {
		return Part{}, err
	}
	binary, err := ensureBinary(root)
	if err != nil {
		return Part{}, err
	}
	rows := make([]Row, 0, len(solutions))
	for _, solution := range solutions {
		rules, err := ruleCount(filepath.Join(root, solution.Guest.Program))
		if err != nil {
			return Part{}, fmt.Errorf("%s/%s: %w", task.ID, solution.Guest.ID, err)
		}
		rows = append(rows, runGuest(task, solution, samples, binary, rules))
	}
	return Part{
		ID: task.ID, Title: title, CaseCount: len(samples), Cases: samples, Rows: rows,
		Duration: time.Since(started).Milliseconds(),
	}, nil
}

func runGuest(task Task, solution Solution, samples []Sample, binary string, rules int) Row {
	row := Row{
		Task: task.ID, Guest: solution.Guest.ID, Host: "go", Environment: "go native",
		GuestRuleCount: rules, Cases: []CaseResult{},
	}
	if solution.Reason != "" {
		row.Status = "unsupported"
		row.Reason = &solution.Reason
		return row
	}
	program := mustProgram(solution.Guest.Program)
	var steps, probes int
	var failures []string
	var duration time.Duration
	ok := true
	for i, item := range task.Cases {
		run := runSolution(binary, program, solution.Text, item.Stdin, task.Limits)
		duration += run.Duration
		result := CaseResult{
			Name: item.Name, Seed: item.Seed,
			MaxSteps: task.Limits.MaxSteps, MaxEvals: task.Limits.MaxEvals,
			MaxStateBytes: task.Limits.MaxStateBytes, TimeoutSeconds: task.Limits.TimeoutSeconds,
			HostTimeoutSeconds: task.Limits.TimeoutSeconds, DurationMs: run.Duration.Milliseconds(),
		}
		message := Failure(item, run, samples[i].Stdout)
		if message != "" {
			ok = false
			result.Status = "fail"
			result.Error = &message
			failures = append(failures, message)
		} else {
			result.Status = "pass"
		}
		if run.Err == nil {
			result.ExitCode = &run.Exit
			result.StepCount = run.Steps
			result.ProbeCount = run.Probes
			if message == "" && run.Steps != nil && run.Probes != nil {
				steps += *run.Steps
				probes += *run.Probes
			}
		}
		row.Cases = append(row.Cases, result)
	}
	row.DurationMs = duration.Milliseconds()
	row.SolutionBytes = &solution.Bytes
	row.SolutionLines = &solution.Lines
	row.SolutionPath = &solution.Path
	if ok {
		row.Status = "pass"
		row.StepCount = &steps
		row.ProbeCount = &probes
		return row
	}
	row.Status = "fail"
	text := strings.Join(failures, "\n")
	row.Error = &text
	return row
}

func Failure(item Case, run ProgramRun, want string) string {
	prefix := item.Name
	if item.Seed != nil {
		prefix = fmt.Sprintf("seed %d", *item.Seed)
	}
	if run.Err != nil {
		return prefix + ": " + run.Err.Error()
	}
	if run.Exit == 0 && run.Stderr == "" && run.Stdout == want && run.Steps != nil && run.Probes != nil {
		return ""
	}
	var b strings.Builder
	fmt.Fprintf(&b, "%s: exit %d\n", prefix, run.Exit)
	if run.Stderr != "" {
		fmt.Fprintf(&b, "stderr:\n%s\n", run.Stderr)
	}
	if run.Steps == nil || run.Probes == nil {
		b.WriteString("missing applied_steps or probes\n")
	}
	if run.Stdout != want {
		fmt.Fprintf(&b, "stdout mismatch\n--- stdin\n%s--- expected\n%s--- got\n%s", item.Stdin, want, run.Stdout)
	}
	return b.String()
}

func runSolution(binary, program, solution, stdin string, limits Limits) ProgramRun {
	text := solution
	return runHost(binary, program, &text, stdin, limits)
}

func runHost(binary, program string, input *string, stdin string, limits Limits) ProgramRun {
	dir, err := os.MkdirTemp("", "thue-task-")
	if err != nil {
		return ProgramRun{Err: err}
	}
	defer os.RemoveAll(dir)
	counts := filepath.Join(dir, "counts.json")
	argv := []string{binary, program}
	if input != nil {
		argv = append(argv, "--input", *input)
	}
	argv = append(argv, "--counts", counts)
	argv = append(argv, limits.args()...)
	run := runBounded(argv, limits.TimeoutSeconds, stdin)
	if run.Err != nil {
		return run
	}
	steps, probes, err := readCounts(counts)
	if err != nil {
		if run.Exit == 0 {
			run.Err = fmt.Errorf("counts: %w", err)
		}
		return run
	}
	run.Steps = &steps
	run.Probes = &probes
	return run
}

// RunProgram runs one Thue++ program on the native Go host. The guard test
// uses it for a solution that ignores stdin and prints a constant.
func RunProgram(program, stdin string, limits Limits) ProgramRun {
	root, err := RepoRoot()
	if err != nil {
		return ProgramRun{Err: err}
	}
	if err := limits.validate(); err != nil {
		return ProgramRun{Err: err}
	}
	binary, err := ensureBinary(root)
	if err != nil {
		return ProgramRun{Err: err}
	}
	return runHost(binary, program, nil, stdin, limits)
}

func ruleCount(program string) (int, error) {
	interp := thue.New()
	defer interp.Cleanup()
	steps, evals, state := listRulesSteps, listRulesEvals, listRulesStateBytes
	interp.MaxSteps = &steps
	interp.MaxEvals = &evals
	interp.MaxStateBytes = &state
	if err := interp.LoadProgram(program); err != nil {
		return 0, err
	}
	if len(interp.Rules) == 0 {
		return 0, fmt.Errorf("%s: no compiled rules", program)
	}
	return len(interp.Rules), nil
}

func Bench(b *testing.B, task Task, guestID string) {
	b.Helper()
	root, err := RepoRoot()
	if err != nil {
		b.Fatal(err)
	}
	guests, err := LoadGuests(root)
	if err != nil {
		b.Fatal(err)
	}
	solutions, err := loadSolutions(root, task.ID, guests)
	if err != nil {
		b.Fatal(err)
	}
	var solution Solution
	found := false
	for _, item := range solutions {
		if item.Guest.ID == guestID {
			solution = item
			found = true
		}
	}
	if !found {
		b.Fatalf("no guest %s", guestID)
	}
	if solution.Reason != "" {
		b.Skip(solution.Reason)
	}
	if len(task.Cases) == 0 {
		b.Fatal("no cases")
	}
	item := task.Cases[0]
	want, err := task.Reference(item.Stdin)
	if err != nil {
		b.Fatal(err)
	}
	binary, err := ensureBinary(root)
	if err != nil {
		b.Fatal(err)
	}
	program := filepath.Join(root, solution.Guest.Program)
	var steps, probes int
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		run := runSolution(binary, program, solution.Text, item.Stdin, task.Limits)
		if message := Failure(item, run, want); message != "" {
			b.Fatal(message)
		}
		steps = *run.Steps
		probes = *run.Probes
	}
	b.ReportMetric(float64(steps), "steps/op")
	b.ReportMetric(float64(probes), "probes/op")
}

func mustWd() string {
	dir, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	return dir
}

func mustProgram(rel string) string {
	root, err := RepoRoot()
	if err != nil {
		panic(err)
	}
	return filepath.Join(root, rel)
}

var binaryOnce sync.Mutex

func ensureBinary(root string) (string, error) {
	path := filepath.Join(root, "build", "go-thue")
	binaryOnce.Lock()
	defer binaryOnce.Unlock()
	if _, err := os.Stat(path); err == nil {
		return path, nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return "", err
	}
	lockPath := path + ".lock"
	lock, err := os.OpenFile(lockPath, os.O_CREATE|os.O_RDWR, 0o644)
	if err != nil {
		return "", err
	}
	defer lock.Close()
	if err := syscall.Flock(int(lock.Fd()), syscall.LOCK_EX); err != nil {
		return "", err
	}
	defer syscall.Flock(int(lock.Fd()), syscall.LOCK_UN)
	if _, err := os.Stat(path); err == nil {
		return path, nil
	}
	cmd := exec.Command("go", "build", "-o", path, "./cmd/thue")
	cmd.Dir = filepath.Join(root, "go")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("build go host: %w\n%s", err, out)
	}
	return path, nil
}

func writePart(part Part) error {
	root, err := RepoRoot()
	if err != nil {
		return err
	}
	dir := filepath.Join(root, "build", "tasks", "parts")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(part, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, part.ID+".json"), append(data, '\n'), 0o644)
}
