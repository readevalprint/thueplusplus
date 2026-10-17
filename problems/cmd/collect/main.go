package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/readevalprint/thueplusplus/problems/harness"
)

func main() {
	output := flag.String("o", "", "results json path")
	flag.Parse()
	if *output == "" || flag.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "usage: collect -o build/problems/results.json")
		os.Exit(2)
	}
	root, err := harness.RepoRoot()
	if err != nil {
		fail(err)
	}
	order, err := harness.LoadOrder(root)
	if err != nil {
		fail(err)
	}
	dir := filepath.Join(root, "build", "problems", "parts")
	parts := map[string]harness.Part{}
	for _, id := range order {
		data, err := os.ReadFile(filepath.Join(dir, id+".json"))
		if err != nil {
			fail(fmt.Errorf("missing problem part %s: %w", id, err))
		}
		var part harness.Part
		if err := json.Unmarshal(data, &part); err != nil {
			fail(err)
		}
		if part.ID != id {
			fail(fmt.Errorf("part %s has id %s", id, part.ID))
		}
		parts[id] = part
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		fail(err)
	}
	if len(entries) != len(order) {
		fail(fmt.Errorf("problem parts are %d, suite order is %d", len(entries), len(order)))
	}
	results := make([]map[string]any, 0)
	for _, id := range order {
		part := parts[id]
		if len(part.Rows) == 0 {
			fail(fmt.Errorf("%s has no solution rows", id))
		}
		for _, row := range part.Rows {
			if row.Problem != id || row.Host != "go" || row.Environment != "go native" {
				fail(fmt.Errorf("%s/%s is not a native Go row", id, row.Solution))
			}
			results = append(results, problemRow(row))
		}
	}
	document := map[string]any{
		"schema_version": 1,
		"commit":         git(root, "rev-parse", "HEAD"),
		"commit_dirty":   git(root, "status", "--porcelain") != "",
		"author":         git(root, "log", "-1", "--format=%an <%ae>"),
		"timestamp":      time.Now().UTC().Format("2006-01-02T15:04:05Z"),
		"safety": map[string]any{
			"host":        "go",
			"environment": "go native",
		},
		"results": results,
	}
	data, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		fail(err)
	}
	if err := os.MkdirAll(filepath.Dir(*output), 0o755); err != nil {
		fail(err)
	}
	if err := os.WriteFile(*output, append(data, '\n'), 0o644); err != nil {
		fail(err)
	}
}

func problemRow(row harness.Row) map[string]any {
	out := map[string]any{
		"problem": row.Problem, "solution": row.Solution, "status": row.Status,
		"duration_ms": row.DurationMs,
	}
	if row.Status == "pass" {
		out["applied_steps"] = *row.Steps
		out["regex_evals"] = *row.RegexEvals
		out["regex_matches"] = *row.RegexMatches
		out["state_bytes"] = *row.StateBytes
		out["state_peak"] = *row.StatePeak
		out["rule_count"] = *row.RuleCount
		out["rule_chars"] = *row.RuleChars
		return out
	}
	for _, key := range []string{"applied_steps", "regex_evals", "regex_matches", "state_bytes", "state_peak", "rule_count", "rule_chars"} {
		out[key] = nil
	}
	return out
}

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

func git(root string, args ...string) string {
	cmd := exec.Command("git", args...)
	cmd.Dir = root
	out, err := cmd.Output()
	if err != nil {
		fail(fmt.Errorf("git %s: %w", strings.Join(args, " "), err))
	}
	return strings.TrimSpace(string(out))
}
