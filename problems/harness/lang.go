package harness

import (
	"encoding/json"
	"fmt"
	"math/rand/v2"
	"os"
	"path/filepath"
	"testing"
	"time"
)

// LangCase is one script in the common set. Every language runs the same
// stdin and is compared with the same reference output.
type LangCase struct {
	Name   string
	Seed   *uint64
	Stdin  string
	Script string
}

type LangRow struct {
	Lang         string  `json:"lang"`
	Program      string  `json:"program"`
	Case         string  `json:"case"`
	Seed         *uint64 `json:"seed"`
	Host         string  `json:"host"`
	Environment  string  `json:"environment"`
	Status       string  `json:"status"`
	Steps        *int    `json:"steps"`
	Cost         *int    `json:"cost"`
	RegexEvals   *int    `json:"regex_evals"`
	RegexMatches *int    `json:"regex_matches"`
	StateBytes   *int    `json:"state_bytes"`
	StatePeak    *int    `json:"state_peak"`
	RuleCount    *int    `json:"rule_count"`
	RuleChars    *int    `json:"rule_chars"`
	DurationMs   int64   `json:"duration_ms"`
	Error        *string `json:"error"`
}

type LangPart struct {
	ID       string    `json:"id"`
	Program  string    `json:"program"`
	Rows     []LangRow `json:"rows"`
	Duration int64     `json:"duration_ms"`
}

func CommonLangCases() []LangCase {
	cases := []LangCase{
		{Name: "hello", Script: "hello", Stdin: ""},
		{Name: "add-two", Script: "add", Stdin: "2\n3\n"},
		{Name: "add-zero", Script: "add", Stdin: "0\n0\n"},
	}
	for _, seed := range []uint64{1, 4, 9} {
		cases = append(cases, LangCase{
			Name: fmt.Sprintf("add-seed-%d", seed), Script: "add", Seed: Seed(seed), Stdin: addStdin(seed),
		})
	}
	for _, n := range []int{0, 1, 5} {
		cases = append(cases, LangCase{
			Name: fmt.Sprintf("factorial-%d", n), Script: "factorial", Stdin: fmt.Sprintf("%d\n", n),
		})
	}
	for _, seed := range []uint64{3, 6} {
		cases = append(cases, LangCase{
			Name: fmt.Sprintf("factorial-seed-%d", seed), Script: "factorial", Seed: Seed(seed),
			Stdin: fmt.Sprintf("%d\n", int(seed)),
		})
	}
	return cases
}

func LangReference(script, stdin string) (string, error) {
	switch script {
	case "hello":
		if stdin != "" {
			return "", fmt.Errorf("hello reads no stdin")
		}
		return "Hello, World!\n", nil
	case "add":
		lines, err := Lines(stdin)
		if err != nil || len(lines) != 2 {
			return "", fmt.Errorf("add wants two lines")
		}
		a, err := parseCanonical(lines[0])
		if err != nil {
			return "", err
		}
		b, err := parseCanonical(lines[1])
		if err != nil {
			return "", err
		}
		return fmt.Sprintf("%d\n", a+b), nil
	case "factorial":
		n, err := IntLine(stdin)
		if err != nil {
			return "", err
		}
		if n > 6 {
			return "", fmt.Errorf("factorial case %d is above 6", n)
		}
		acc := 1
		for i := 1; i <= n; i++ {
			acc *= i
		}
		return fmt.Sprintf("%d\n", acc), nil
	default:
		return "", fmt.Errorf("unknown common script %s", script)
	}
}

func addStdin(seed uint64) string {
	r := rand.New(rand.NewPCG(seed, 1))
	return fmt.Sprintf("%d\n%d\n", r.IntN(21), r.IntN(21))
}

func parseCanonical(text string) (int, error) {
	value, err := IntLine(text + "\n")
	return value, err
}

func LangLimits() Limits {
	return Limits{MaxSteps: 200000, MaxEvals: 3000000, MaxStateBytes: 2097152, TimeoutSeconds: 30}
}

// RunCommonLang runs the shared cases for one language interpreter.
func RunCommonLang(t *testing.T, id, extension string) {
	t.Helper()
	part, err := executeLang(id, extension)
	if err != nil {
		t.Fatal(err)
	}
	if os.Getenv("THUEPP_LANG_RECORD") == "1" {
		root, err := RepoRoot()
		if err != nil {
			t.Fatal(err)
		}
		dir := filepath.Join(root, "build", "langs", "parts")
		if err := os.MkdirAll(dir, 0o755); err != nil {
			t.Fatal(err)
		}
		data, err := json.MarshalIndent(part, "", "  ")
		if err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(dir, part.ID+".json"), append(data, '\n'), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	for _, row := range part.Rows {
		if row.Status != "pass" && row.Error != nil {
			t.Errorf("%s/%s\n%s", id, row.Case, *row.Error)
		}
	}
}

func executeLang(id, extension string) (LangPart, error) {
	started := time.Now()
	wd := mustWd()
	if filepath.Base(wd) != "cases" || filepath.Base(filepath.Dir(wd)) != id {
		return LangPart{}, fmt.Errorf("test working directory must be langs/%s/cases", id)
	}
	root, err := RepoRoot()
	if err != nil {
		return LangPart{}, err
	}
	if err := RequireNativeGo(root); err != nil {
		return LangPart{}, err
	}
	limits := LangLimits()
	if err := limits.validate(); err != nil {
		return LangPart{}, err
	}
	programRel := filepath.ToSlash(filepath.Join("langs", id, id+".tpp"))
	program := filepath.Join(root, "langs", id, id+".tpp")
	if _, err := os.Stat(program); err != nil {
		return LangPart{}, err
	}
	binary, err := ensureBinary(root)
	if err != nil {
		return LangPart{}, err
	}
	cases := CommonLangCases()
	rows := make([]LangRow, 0, len(cases))
	for _, item := range cases {
		want, err := LangReference(item.Script, item.Stdin)
		if err != nil {
			return LangPart{}, fmt.Errorf("%s: %w", item.Name, err)
		}
		script := filepath.Join(wd, item.Script+"."+extension)
		text, err := os.ReadFile(script)
		if err != nil {
			return LangPart{}, err
		}
		if len(text) == 0 || text[len(text)-1] != '\n' {
			return LangPart{}, fmt.Errorf("%s must end with a newline", script)
		}
		body := string(text[:len(text)-1])
		run := runProgram(binary, program, &body, item.Stdin, limits)
		row := LangRow{
			Lang: id, Program: programRel, Case: item.Name, Seed: item.Seed,
			Host: "go", Environment: "go native", DurationMs: run.Duration.Milliseconds(),
		}
		message := Failure(Case{Name: item.Name, Seed: item.Seed, Stdin: item.Stdin}, run, want)
		if message != "" {
			row.Status = "fail"
			row.Error = &message
		} else {
			row.Status = "pass"
			row.Steps = &run.Metrics.Steps
			row.Cost = &run.Metrics.Cost
			row.RegexEvals = &run.Metrics.RegexEvals
			row.RegexMatches = &run.Metrics.RegexMatches
			row.StateBytes = &run.Metrics.StateBytes
			row.StatePeak = &run.Metrics.StatePeak
			row.RuleCount = &run.Metrics.RuleCount
			row.RuleChars = &run.Metrics.RuleChars
		}
		rows = append(rows, row)
	}
	return LangPart{ID: id, Program: programRel, Rows: rows, Duration: time.Since(started).Milliseconds()}, nil
}
