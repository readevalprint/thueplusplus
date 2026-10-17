package harness

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"testing"
	"time"
)

// Case is one stdin. Seed is set when a generator drew that stdin. The
// program does not see the seed.
type Case struct {
	Name  string
	Seed  *uint64
	Stdin string
}

func Seed(v uint64) *uint64 { return &v }

// Problem is one Rosetta adaptation. Reference reads the same stdin the
// solution receives.
type Problem struct {
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
	Steps              *int    `json:"steps"`
	RegexEvals         *int    `json:"regex_evals"`
	RegexMatches       *int    `json:"regex_matches"`
	StateBytes         *int    `json:"state_bytes"`
	StatePeak          *int    `json:"state_peak"`
	RuleCount          *int    `json:"rule_count"`
	RuleChars          *int    `json:"rule_chars"`
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
	Problem      string       `json:"problem"`
	Solution     string       `json:"solution"`
	Host         string       `json:"host"`
	Environment  string       `json:"environment"`
	Status       string       `json:"status"`
	Steps        *int         `json:"steps"`
	RegexEvals   *int         `json:"regex_evals"`
	RegexMatches *int         `json:"regex_matches"`
	StateBytes   *int         `json:"state_bytes"`
	StatePeak    *int         `json:"state_peak"`
	RuleCount    *int         `json:"rule_count"`
	RuleChars    *int         `json:"rule_chars"`
	DurationMs   int64        `json:"duration_ms"`
	SolutionPath string       `json:"solution_path"`
	Cases        []CaseResult `json:"cases"`
	Error        *string      `json:"error"`
}

type Part struct {
	ID        string   `json:"id"`
	Title     string   `json:"title"`
	CaseCount int      `json:"case_count"`
	Cases     []Sample `json:"cases"`
	Rows      []Row    `json:"rows"`
	Duration  int64    `json:"duration_ms"`
}

func Run(t *testing.T, problem Problem) {
	t.Helper()
	part, err := Execute(problem)
	if err != nil {
		t.Fatal(err)
	}
	if os.Getenv("THUE_PROBLEM_RECORD") == "1" {
		if err := writePart(part, "problems"); err != nil {
			t.Fatal(err)
		}
	}
	for _, row := range part.Rows {
		if row.Status != "pass" && row.Error != nil {
			t.Errorf("%s/%s\n%s", problem.ID, row.Solution, *row.Error)
		}
	}
}

func Execute(problem Problem) (Part, error) {
	started := time.Now()
	if err := problem.Limits.validate(); err != nil {
		return Part{}, fmt.Errorf("%s: %w", problem.ID, err)
	}
	if len(problem.Cases) == 0 {
		return Part{}, fmt.Errorf("%s: no cases", problem.ID)
	}
	if problem.Reference == nil {
		return Part{}, fmt.Errorf("%s: no reference", problem.ID)
	}
	seen := map[string]struct{}{}
	samples := make([]Sample, 0, len(problem.Cases))
	for _, item := range problem.Cases {
		if item.Name == "" {
			return Part{}, fmt.Errorf("%s: a case has no name", problem.ID)
		}
		if _, ok := seen[item.Name]; ok {
			return Part{}, fmt.Errorf("%s: duplicate case %s", problem.ID, item.Name)
		}
		seen[item.Name] = struct{}{}
		stdout, err := problem.Reference(item.Stdin)
		if err != nil {
			return Part{}, fmt.Errorf("%s case %s: reference: %w", problem.ID, item.Name, err)
		}
		samples = append(samples, Sample{
			Name: item.Name, Stdin: item.Stdin, Stdout: stdout, Stderr: "", ExitCode: 0,
		})
	}
	root, err := RepoRoot()
	if err != nil {
		return Part{}, err
	}
	if filepath.Base(mustWd()) != problem.ID {
		return Part{}, fmt.Errorf("test working directory must be problems/%s", problem.ID)
	}
	if err := RequireNativeGo(root); err != nil {
		return Part{}, err
	}
	title, err := Title(mustWd(), "problem.md")
	if err != nil {
		return Part{}, err
	}
	solutions, err := loadSolutions(root, problem.ID)
	if err != nil {
		return Part{}, err
	}
	binary, err := ensureBinary(root)
	if err != nil {
		return Part{}, err
	}
	rows := make([]Row, 0, len(solutions))
	for _, solution := range solutions {
		rows = append(rows, runSolution(problem, solution, samples, binary))
	}
	return Part{
		ID: problem.ID, Title: title, CaseCount: len(samples), Cases: samples, Rows: rows,
		Duration: time.Since(started).Milliseconds(),
	}, nil
}

func runSolution(problem Problem, solution Solution, samples []Sample, binary string) Row {
	row := Row{
		Problem: problem.ID, Solution: solution.Name, Host: "go", Environment: "go native",
		SolutionPath: solution.Path, Cases: []CaseResult{},
	}
	var steps, evals, matches, stateBytes, statePeak, rules, chars int
	var duration time.Duration
	var failures []string
	ok := true
	for i, item := range problem.Cases {
		run := runProgram(binary, solution.PathAbs, nil, item.Stdin, problem.Limits)
		duration += run.Duration
		result := CaseResult{
			Name: item.Name, Seed: item.Seed,
			MaxSteps: problem.Limits.MaxSteps, MaxEvals: problem.Limits.MaxEvals,
			MaxStateBytes: problem.Limits.MaxStateBytes, TimeoutSeconds: problem.Limits.TimeoutSeconds,
			HostTimeoutSeconds: problem.Limits.TimeoutSeconds, DurationMs: run.Duration.Milliseconds(),
		}
		message := Failure(item, run, samples[i].Stdout)
		if message != "" {
			ok = false
			result.Status = "fail"
			result.Error = &message
			failures = append(failures, message)
		} else {
			result.Status = "pass"
			result.Steps = &run.Metrics.Steps
			result.RegexEvals = &run.Metrics.RegexEvals
			result.RegexMatches = &run.Metrics.RegexMatches
			result.StateBytes = &run.Metrics.StateBytes
			result.StatePeak = &run.Metrics.StatePeak
			result.RuleCount = &run.Metrics.RuleCount
			result.RuleChars = &run.Metrics.RuleChars
			steps += run.Metrics.Steps
			evals += run.Metrics.RegexEvals
			matches += run.Metrics.RegexMatches
			stateBytes += run.Metrics.StateBytes
			if run.Metrics.StatePeak > statePeak {
				statePeak = run.Metrics.StatePeak
			}
			rules = run.Metrics.RuleCount
			chars = run.Metrics.RuleChars
		}
		if run.Err == nil {
			result.ExitCode = &run.Exit
		}
		row.Cases = append(row.Cases, result)
	}
	row.DurationMs = duration.Milliseconds()
	if ok {
		row.Status = "pass"
		row.Steps = &steps
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

func Failure(item Case, run ProgramRun, want string) string {
	prefix := item.Name
	if item.Seed != nil {
		prefix = fmt.Sprintf("seed %d", *item.Seed)
	}
	if run.Err != nil {
		return prefix + ": " + run.Err.Error()
	}
	if run.Exit == 0 && run.Stderr == "" && run.Stdout == want && run.Metrics != nil {
		if run.Metrics.RuleCount < 1 || run.Metrics.RuleChars < 1 {
			return prefix + ": rule count and rule chars must come from the solution source"
		}
		return ""
	}
	var b strings.Builder
	fmt.Fprintf(&b, "%s: exit %d\n", prefix, run.Exit)
	if run.Stderr != "" {
		fmt.Fprintf(&b, "stderr:\n%s\n", run.Stderr)
	}
	if run.Metrics == nil {
		b.WriteString("missing metrics\n")
	}
	if run.Stdout != want {
		fmt.Fprintf(&b, "stdout mismatch\n--- stdin\n%s--- expected\n%s--- got\n%s", item.Stdin, want, run.Stdout)
	}
	return b.String()
}

func runProgram(binary, program string, input *string, stdin string, limits Limits) ProgramRun {
	dir, err := os.MkdirTemp("", "thue-problem-")
	if err != nil {
		return ProgramRun{Err: err}
	}
	defer os.RemoveAll(dir)
	metrics := filepath.Join(dir, "metrics.json")
	argv := []string{binary, program}
	if input != nil {
		argv = append(argv, "--input", *input)
	}
	argv = append(argv, "--metrics", metrics)
	argv = append(argv, limits.args()...)
	run := runBounded(argv, limits.TimeoutSeconds, stdin)
	if run.Err != nil {
		return run
	}
	got, err := readMetrics(metrics)
	if err != nil {
		if run.Exit == 0 {
			run.Err = fmt.Errorf("metrics: %w", err)
		}
		return run
	}
	run.Metrics = &got
	return run
}

// RunProgram runs one Thue++ program on the native Go host.
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
	return runProgram(binary, program, nil, stdin, limits)
}

func IntLine(stdin string) (int, error) {
	if strings.Count(stdin, "\n") != 1 || !strings.HasSuffix(stdin, "\n") {
		return 0, fmt.Errorf("stdin must be one line, got %q", stdin)
	}
	text := strings.TrimSuffix(stdin, "\n")
	value, err := strconv.Atoi(text)
	if err != nil || value < 0 || (len(text) > 1 && text[0] == '0') {
		return 0, fmt.Errorf("stdin must be a canonical non-negative integer, got %q", text)
	}
	return value, nil
}

func Lines(stdin string) ([]string, error) {
	if stdin == "" || !strings.HasSuffix(stdin, "\n") {
		return nil, fmt.Errorf("stdin must end with a newline")
	}
	return strings.Split(strings.TrimSuffix(stdin, "\n"), "\n"), nil
}

type Solution struct {
	Name    string
	Path    string
	PathAbs string
}

func RepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", err
	}
	start := dir
	for {
		if _, err := os.Stat(filepath.Join(dir, "SPEC_VERSION")); err == nil {
			return dir, nil
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", fmt.Errorf("SPEC_VERSION not found above %s", start)
		}
		dir = parent
	}
}

func LoadOrder(root string) ([]string, error) {
	return loadOrder(filepath.Join(root, "problems", "suite.toml"))
}

func LoadLangOrder(root string) ([]string, error) {
	return loadOrder(filepath.Join(root, "langs", "suite.toml"))
}

func loadOrder(path string) ([]string, error) {
	text, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var order []string
	in := false
	for _, line := range strings.Split(string(text), "\n") {
		trim := strings.TrimSpace(line)
		if trim == "" || strings.HasPrefix(trim, "#") {
			continue
		}
		if strings.HasPrefix(trim, "order") {
			in = true
			continue
		}
		if !in {
			return nil, fmt.Errorf("%s: expected order = [", path)
		}
		if trim == "]" {
			break
		}
		trim = strings.TrimSuffix(trim, ",")
		value := strings.Trim(trim, `"`)
		if value == "" || strings.ContainsAny(value, "[]") {
			return nil, fmt.Errorf("%s: bad order entry %q", path, line)
		}
		order = append(order, value)
	}
	if len(order) == 0 {
		return nil, fmt.Errorf("%s: empty order", path)
	}
	return order, nil
}

func Title(dir, name string) (string, error) {
	text, err := os.ReadFile(filepath.Join(dir, name))
	if err != nil {
		return "", err
	}
	line, _, _ := strings.Cut(string(text), "\n")
	title := strings.TrimPrefix(line, "# ")
	if title == "" || title == line {
		return "", fmt.Errorf("%s/%s must start with a # title", dir, name)
	}
	return title, nil
}

func loadSolutions(root, problemID string) ([]Solution, error) {
	dir := filepath.Join(root, "problems", problemID, "solutions")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	var names []string
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".thue") {
			return nil, fmt.Errorf("%s/solutions: only .thue files are solutions", problemID)
		}
		names = append(names, entry.Name())
	}
	if len(names) == 0 {
		return nil, fmt.Errorf("%s: no solutions", problemID)
	}
	sort.Strings(names)
	out := make([]Solution, 0, len(names))
	for _, name := range names {
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return nil, err
		}
		if len(data) == 0 || data[len(data)-1] != '\n' {
			return nil, fmt.Errorf("%s must end with a newline", name)
		}
		if strings.TrimSpace(string(data)) == "" {
			return nil, fmt.Errorf("%s is empty", name)
		}
		stem := strings.TrimSuffix(name, ".thue")
		rel := filepath.ToSlash(filepath.Join("problems", problemID, "solutions", name))
		out = append(out, Solution{Name: stem, Path: rel, PathAbs: filepath.Join(dir, name)})
	}
	return out, nil
}

func RequireNativeGo(root string) error {
	text, err := os.ReadFile(filepath.Join(root, "hosts.toml"))
	if err != nil {
		return err
	}
	for _, line := range strings.Split(string(text), "\n") {
		if !strings.Contains(line, `id = "go"`) {
			continue
		}
		if strings.Contains(line, "timeout_scale") || strings.Contains(line, "timeout_floor") {
			return fmt.Errorf("hosts.toml go row sets a timeout scale or floor; native Go runs use the case timeout")
		}
		return nil
	}
	return fmt.Errorf("hosts.toml has no go host")
}

func mustWd() string {
	dir, err := os.Getwd()
	if err != nil {
		panic(err)
	}
	return dir
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

func writePart(part Part, kind string) error {
	root, err := RepoRoot()
	if err != nil {
		return err
	}
	dir := filepath.Join(root, "build", kind, "parts")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(part, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, part.ID+".json"), append(data, '\n'), 0o644)
}
