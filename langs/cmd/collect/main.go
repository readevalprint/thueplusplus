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

	"github.com/thuelang/thueplusplus/problems/harness"
)

func main() {
	output := flag.String("o", "", "results json path")
	flag.Parse()
	if *output == "" || flag.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "usage: collect -o build/langs/results.json")
		os.Exit(2)
	}
	root, err := harness.RepoRoot()
	if err != nil {
		fail(err)
	}
	order, err := harness.LoadLangOrder(root)
	if err != nil {
		fail(err)
	}
	dir := filepath.Join(root, "build", "langs", "parts")
	results := make([]map[string]any, 0, len(order))
	seen := map[string]struct{}{}
	for _, id := range order {
		data, err := os.ReadFile(filepath.Join(dir, id+".json"))
		if err != nil {
			fail(fmt.Errorf("missing lang part %s: %w", id, err))
		}
		var part harness.LangPart
		if err := json.Unmarshal(data, &part); err != nil {
			fail(err)
		}
		if part.ID != id {
			fail(fmt.Errorf("part %s has id %s", id, part.ID))
		}
		results = append(results, langRow(part))
		seen[id] = struct{}{}
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		fail(err)
	}
	for _, entry := range entries {
		name := strings.TrimSuffix(entry.Name(), ".json")
		if _, ok := seen[name]; !ok {
			fail(fmt.Errorf("unexpected lang part %s", entry.Name()))
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
	encoded, err := json.MarshalIndent(document, "", "  ")
	if err != nil {
		fail(err)
	}
	if err := os.MkdirAll(filepath.Dir(*output), 0o755); err != nil {
		fail(err)
	}
	if err := os.WriteFile(*output, append(encoded, '\n'), 0o644); err != nil {
		fail(err)
	}
}

func langRow(part harness.LangPart) map[string]any {
	out := map[string]any{
		"lang": part.ID, "program": part.Program, "duration_ms": int64(0),
	}
	var steps, evals, matches, state, peak, rules, chars int
	var duration int64
	pass := true
	if len(part.Rows) == 0 {
		fail(fmt.Errorf("%s has no cases", part.ID))
	}
	for _, row := range part.Rows {
		if row.Lang != part.ID || row.Host != "go" || row.Environment != "go native" || row.Program != part.Program {
			fail(fmt.Errorf("%s case %s is not a native Go row of %s", part.ID, row.Case, part.Program))
		}
		duration += row.DurationMs
		if row.Status != "pass" {
			pass = false
			continue
		}
		steps += *row.Steps
		evals += *row.RegexEvals
		matches += *row.RegexMatches
		state += *row.StateBytes
		if *row.StatePeak > peak {
			peak = *row.StatePeak
		}
		rules = *row.RuleCount
		chars = *row.RuleChars
	}
	out["duration_ms"] = duration
	if !pass {
		out["status"] = "fail"
		for _, key := range []string{"applied_steps", "regex_evals", "regex_matches", "state_bytes", "state_peak", "rule_count", "rule_chars"} {
			out[key] = nil
		}
		return out
	}
	out["status"] = "pass"
	out["applied_steps"] = steps
	out["regex_evals"] = evals
	out["regex_matches"] = matches
	out["state_bytes"] = state
	out["state_peak"] = peak
	out["rule_count"] = rules
	out["rule_chars"] = chars
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
