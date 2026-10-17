package harness

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
)

type CaseResult struct {
	Name               string  `json:"name"`
	Seed               *uint64 `json:"seed"`
	Status             string  `json:"status"`
	Steps              *int    `json:"steps"`
	Cost               *int    `json:"cost"`
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
	Cost         *int         `json:"cost"`
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

func programFailure(name string, seed *uint64, run ProgramRun, want string) string {
	label := name
	if seed != nil {
		label = fmt.Sprintf("seed %d", *seed)
	}
	if run.Err != nil {
		return label + ": " + run.Err.Error()
	}
	got := Outcome{ExitCode: run.Exit, Writes: map[string]string{"stdout": run.Stdout, "stderr": run.Stderr}}
	wantOut := Outcome{ExitCode: 0, Writes: map[string]string{"stdout": want, "stderr": ""}}
	if message := Compare(label, got, wantOut); message != "" {
		if run.Metrics == nil {
			message += "\nmissing metrics"
		}
		return message
	}
	if run.Metrics == nil || run.Metrics.RuleCount < 1 || run.Metrics.RuleChars < 1 {
		return label + ": rule count and rule chars must come from the solution source"
	}
	return ""
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
	run := runBounded(argv, limits.TimeoutSeconds, limits.MemoryCapBytes, stdin)
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
		if !entry.IsDir() {
			return nil, fmt.Errorf("%s/solutions: %s is not a ruleset directory", problemID, entry.Name())
		}
		program := filepath.Join(dir, entry.Name(), "solution.thue")
		if _, err := os.Stat(program); err != nil {
			continue
		}
		names = append(names, entry.Name())
	}
	if len(names) == 0 {
		return nil, fmt.Errorf("%s: no solution.thue", problemID)
	}
	sort.Strings(names)
	out := make([]Solution, 0, len(names))
	for _, name := range names {
		program := filepath.Join(dir, name, "solution.thue")
		data, err := os.ReadFile(program)
		if err != nil {
			return nil, err
		}
		if len(data) == 0 || data[len(data)-1] != '\n' {
			return nil, fmt.Errorf("%s/solution.thue must end with a newline", name)
		}
		rel := filepath.ToSlash(filepath.Join("problems", problemID, "solutions", name, "solution.thue"))
		out = append(out, Solution{Name: name, Path: rel, PathAbs: program})
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
