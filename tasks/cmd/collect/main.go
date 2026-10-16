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

	"github.com/readevalprint/thueplusplus/tasks/harness"
)

func main() {
	output := flag.String("o", "", "results json path")
	flag.Parse()
	if *output == "" || flag.NArg() != 0 {
		fmt.Fprintln(os.Stderr, "usage: collect -o build/tasks/results.json")
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
	guests, err := harness.LoadGuests(root)
	if err != nil {
		fail(err)
	}
	dir := filepath.Join(root, "build", "tasks", "parts")
	parts := make([]harness.Part, 0, len(order))
	seen := map[string]struct{}{}
	for _, id := range order {
		data, err := os.ReadFile(filepath.Join(dir, id+".json"))
		if err != nil {
			fail(fmt.Errorf("missing task part %s: %w", id, err))
		}
		var part harness.Part
		if err := json.Unmarshal(data, &part); err != nil {
			fail(err)
		}
		if part.ID != id {
			fail(fmt.Errorf("part %s has id %s", id, part.ID))
		}
		if part.CaseCount != len(part.Cases) || part.CaseCount < 1 {
			fail(fmt.Errorf("%s: case_count %d does not match %d cases", id, part.CaseCount, len(part.Cases)))
		}
		if len(part.Rows) != len(guests) {
			fail(fmt.Errorf("%s: %d rows, %d guests", id, len(part.Rows), len(guests)))
		}
		parts = append(parts, part)
		seen[id] = struct{}{}
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		fail(err)
	}
	for _, entry := range entries {
		name := strings.TrimSuffix(entry.Name(), ".json")
		if _, ok := seen[name]; !ok {
			fail(fmt.Errorf("unexpected task part %s", entry.Name()))
		}
	}
	document, err := build(root, guests, parts)
	if err != nil {
		fail(err)
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

func fail(err error) {
	fmt.Fprintln(os.Stderr, err)
	os.Exit(1)
}

func build(root string, guests []harness.Guest, parts []harness.Part) (map[string]any, error) {
	rows := []harness.Row{}
	tasks := []map[string]any{}
	grid := map[string]map[string]any{}
	summary := map[string]int{"pass": 0, "fail": 0, "unsupported": 0}
	var duration int64
	guestRules := map[string]int{}
	for _, part := range parts {
		duration += part.Duration
		tasks = append(tasks, map[string]any{
			"id": part.ID, "title": part.Title, "case_count": part.CaseCount, "cases": part.Cases,
		})
		cells := map[string]any{}
		for i, row := range part.Rows {
			if row.Task != part.ID || row.Guest != guests[i].ID || row.Host != "go" || row.Environment != "go native" {
				return nil, fmt.Errorf("%s row %d is not %s/go", part.ID, i, guests[i].ID)
			}
			if row.GuestRuleCount < 1 {
				return nil, fmt.Errorf("%s/%s: missing guest_rule_count", part.ID, row.Guest)
			}
			if prev, ok := guestRules[row.Guest]; ok && prev != row.GuestRuleCount {
				return nil, fmt.Errorf("%s rule count %d disagrees with %d", row.Guest, row.GuestRuleCount, prev)
			}
			guestRules[row.Guest] = row.GuestRuleCount
			switch row.Status {
			case "pass":
				if row.StepCount == nil || row.ProbeCount == nil || row.Error != nil || row.Reason != nil {
					return nil, fmt.Errorf("%s/%s: pass row is incomplete", part.ID, row.Guest)
				}
				cells[row.Guest] = map[string]any{"status": "pass", "step_count": *row.StepCount}
			case "fail":
				if row.StepCount != nil || row.ProbeCount != nil || row.Error == nil || *row.Error == "" {
					return nil, fmt.Errorf("%s/%s: fail row must keep a null count and an error", part.ID, row.Guest)
				}
				cells[row.Guest] = map[string]any{"status": "fail", "step_count": nil}
			case "unsupported":
				if row.StepCount != nil || row.ProbeCount != nil || row.Reason == nil || *row.Reason == "" || row.Error != nil {
					return nil, fmt.Errorf("%s/%s: unsupported row is malformed", part.ID, row.Guest)
				}
				cells[row.Guest] = map[string]any{"status": "unsupported", "step_count": nil}
			default:
				return nil, fmt.Errorf("%s/%s: status %s", part.ID, row.Guest, row.Status)
			}
			summary[row.Status]++
			rows = append(rows, row)
		}
		grid[part.ID] = cells
	}
	summary["rows"] = len(rows)
	guestRows := []map[string]any{}
	for _, guest := range guests {
		count, ok := guestRules[guest.ID]
		if !ok {
			return nil, fmt.Errorf("no rule count for %s", guest.ID)
		}
		guestRows = append(guestRows, map[string]any{
			"id": guest.ID, "program": guest.Program, "rule_count": count,
		})
	}
	commit := git(root, "rev-parse", "HEAD")
	dirty := git(root, "status", "--porcelain") != ""
	author := git(root, "log", "-1", "--format=%an <%ae>")
	spec, err := os.ReadFile(filepath.Join(root, "SPEC_VERSION"))
	if err != nil {
		return nil, err
	}
	return map[string]any{
		"schema_version": 1,
		"spec_version":   strings.TrimSpace(string(spec)),
		"commit":         commit,
		"commit_dirty":   dirty,
		"author":         author,
		"timestamp":      time.Now().UTC().Format("2006-01-02T15:04:05Z"),
		"duration_ms":    duration,
		"safety": map[string]any{
			"max_steps_ceiling":       harness.CeilingSteps,
			"max_evals_ceiling":       harness.CeilingEvals,
			"max_state_bytes_ceiling": harness.CeilingStateBytes,
			"timeout_seconds_ceiling": harness.CeilingTimeout,
			"memory_cap_bytes":        harness.MemoryCapBytes,
			"memory_cap":              "rss",
			"os_timeout":              "timeout(1)",
			"host":                    "go",
			"environment":             "go native",
		},
		"errors":  []any{},
		"hosts":   []string{"go"},
		"guests":  guestRows,
		"tasks":   tasks,
		"grid":    grid,
		"summary": summary,
		"results": rows,
	}, nil
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
