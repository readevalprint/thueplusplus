package harness

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// GlobalLimits reads metrics/limits.toml. Every solution run uses this file.
func GlobalLimits(root string) (Limits, error) {
	path := filepath.Join(root, "metrics", "limits.toml")
	text, err := os.ReadFile(path)
	if err != nil {
		return Limits{}, err
	}
	limits := Limits{}
	seen := map[string]bool{}
	for _, line := range strings.Split(string(text), "\n") {
		trim := strings.TrimSpace(line)
		if trim == "" || strings.HasPrefix(trim, "#") {
			continue
		}
		key, value, ok := strings.Cut(trim, "=")
		if !ok {
			return Limits{}, fmt.Errorf("%s: expected key = value", path)
		}
		key = strings.TrimSpace(key)
		number, err := strconv.Atoi(strings.TrimSpace(value))
		if err != nil || number < 1 {
			return Limits{}, fmt.Errorf("%s: %s must be a positive integer", path, key)
		}
		if seen[key] {
			return Limits{}, fmt.Errorf("%s: duplicate %s", path, key)
		}
		seen[key] = true
		switch key {
		case "max_steps":
			limits.MaxSteps = number
		case "max_evals":
			limits.MaxEvals = number
		case "max_state_bytes":
			limits.MaxStateBytes = number
		case "timeout_seconds":
			limits.TimeoutSeconds = number
		case "memory_cap_bytes":
			limits.MemoryCapBytes = number
		default:
			return Limits{}, fmt.Errorf("%s: unknown key %s", path, key)
		}
	}
	for _, key := range []string{"max_steps", "max_evals", "max_state_bytes", "timeout_seconds", "memory_cap_bytes"} {
		if !seen[key] {
			return Limits{}, fmt.Errorf("%s: missing %s", path, key)
		}
	}
	if err := limits.validate(); err != nil {
		return Limits{}, fmt.Errorf("%s: %w", path, err)
	}
	return limits, nil
}

// ReadmeTitle reads the title field from a README.md frontmatter.
func ReadmeTitle(dir string) (string, error) {
	text, err := os.ReadFile(filepath.Join(dir, "README.md"))
	if err != nil {
		return "", err
	}
	fields, _, err := frontmatter(string(text), filepath.Join(dir, "README.md"))
	if err != nil {
		return "", err
	}
	title := fields["title"]
	if title == "" {
		return "", fmt.Errorf("%s/README.md frontmatter needs title", dir)
	}
	return title, nil
}

func frontmatter(text, path string) (map[string]string, string, error) {
	if !strings.HasPrefix(text, "---\n") {
		return nil, "", fmt.Errorf("%s: missing opening frontmatter", path)
	}
	rest := text[4:]
	end := strings.Index(rest, "\n---\n")
	if end < 0 {
		return nil, "", fmt.Errorf("%s: frontmatter is not closed", path)
	}
	fields := map[string]string{}
	for _, line := range strings.Split(rest[:end], "\n") {
		if strings.TrimSpace(line) == "" {
			continue
		}
		if strings.HasPrefix(line, " ") || strings.HasPrefix(line, "\t") {
			return nil, "", fmt.Errorf("%s: nested frontmatter is invalid", path)
		}
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			return nil, "", fmt.Errorf("%s: frontmatter line has no key", path)
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key == "limits" || strings.HasPrefix(key, "max_") || key == "timeout" || key == "timeout_seconds" || key == "memory_cap_bytes" {
			return nil, "", fmt.Errorf("%s: %s is global and cannot appear in frontmatter", path, key)
		}
		if key == "" || value == "" {
			return nil, "", fmt.Errorf("%s: frontmatter key must be non-empty", path)
		}
		if _, exists := fields[key]; exists {
			return nil, "", fmt.Errorf("%s: duplicate frontmatter key %s", path, key)
		}
		fields[key] = value
	}
	if len(fields) == 0 {
		return nil, "", fmt.Errorf("%s: frontmatter is empty", path)
	}
	return fields, rest[end+5:], nil
}

func syncCases(dir string, samples []Sample) error {
	if os.Getenv("THUEPP_DUMP_CASES") == "1" {
		return writeCases(dir, samples)
	}
	loaded, err := readCases(dir)
	if err != nil {
		return err
	}
	if len(loaded) != len(samples) {
		return fmt.Errorf("%s: %d cases, reference has %d", dir, len(loaded), len(samples))
	}
	for i := range samples {
		same, err := sameJSON(loaded[i], samples[i])
		if err != nil {
			return err
		}
		if !same {
			return fmt.Errorf("%s: case %s does not match the baseline", dir, samples[i].Name)
		}
	}
	return nil
}

func writeCases(dir string, samples []Sample) error {
	if err := os.RemoveAll(dir); err != nil {
		return err
	}
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return err
	}
	for i, sample := range samples {
		name := fmt.Sprintf("%02d-%s.json", i+1, sample.Name)
		data, err := json.MarshalIndent(sample, "", "  ")
		if err != nil {
			return err
		}
		if err := os.WriteFile(filepath.Join(dir, name), append(data, '\n'), 0o644); err != nil {
			return err
		}
	}
	return nil
}

func sameJSON(a, b any) (bool, error) {
	left, err := json.Marshal(a)
	if err != nil {
		return false, err
	}
	right, err := json.Marshal(b)
	if err != nil {
		return false, err
	}
	return bytes.Equal(left, right), nil
}

func readCases(dir string) ([]Sample, error) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("%s: %w", dir, err)
	}
	var names []string
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			return nil, fmt.Errorf("%s: only case json files are allowed", dir)
		}
		names = append(names, entry.Name())
	}
	samples := make([]Sample, 0, len(names))
	for index, name := range names {
		data, err := os.ReadFile(filepath.Join(dir, name))
		if err != nil {
			return nil, err
		}
		dec := json.NewDecoder(bytes.NewReader(data))
		dec.DisallowUnknownFields()
		var sample Sample
		if err := dec.Decode(&sample); err != nil {
			return nil, fmt.Errorf("%s: %w", name, err)
		}
		if dec.More() {
			return nil, fmt.Errorf("%s: extra JSON value", name)
		}
		want := fmt.Sprintf("%02d-%s.json", index+1, sample.Name)
		if name != want {
			return nil, fmt.Errorf("%s: file must be named %s", name, want)
		}
		samples = append(samples, sample)
	}
	if len(samples) == 0 {
		return nil, fmt.Errorf("%s: no cases", dir)
	}
	return samples, nil
}
