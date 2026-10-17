package thue

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strconv"
	"strings"
	"testing"
)

func TestParseReadRHS(t *testing.T) {
	cases := []struct {
		rhs      string
		resource string
		err      string
	}{
		{rhs: "30 qux", resource: "qux"},
		{rhs: "0.5 stdin", resource: "stdin"},
		{rhs: "1e2 echo", resource: "echo"},
		{rhs: "qux", err: "Line 2: ::< requires read_spec and literal resource"},
		{rhs: "30 qux extra", err: "Line 2: ::< requires read_spec and literal resource"},
		{rhs: "@VALUE custom", err: "Line 2: invalid read timeout '@VALUE'"},
		{rhs: "0 qux", err: "Line 2: invalid read timeout '0'"},
		{rhs: "-1 stdin", err: "Line 2: invalid read timeout '-1'"},
		{rhs: "30 1qux", err: "Line 2: ::< resource must be a literal binding name"},
	}
	for _, tc := range cases {
		resource, _, err := parseReadRHS(2, tc.rhs)
		if tc.err != "" {
			if err == nil || err.Error() != tc.err {
				t.Fatalf("rhs %q error = %v, want %s", tc.rhs, err, tc.err)
			}
			continue
		}
		if err != nil {
			t.Fatalf("rhs %q: %v", tc.rhs, err)
		}
		if resource != tc.resource {
			t.Fatalf("rhs %q resource = %q, want %q", tc.rhs, resource, tc.resource)
		}
	}
}

type catalogResource struct {
	Name   string `json:"name"`
	Reads  bool   `json:"reads"`
	Writes bool   `json:"writes"`
}

type catalogFile struct {
	Path      string            `json:"path"`
	Resources []catalogResource `json:"resources"`
	Errors    []string          `json:"errors"`
}

func TestPlaygroundRuleCatalog(t *testing.T) {
	repo := filepath.Join("..", "..")
	var files []catalogFile
	var err error
	for _, dir := range []string{"examples", "langs"} {
		err = filepath.WalkDir(filepath.Join(repo, dir), func(path string, entry os.DirEntry, walkErr error) error {
			if walkErr != nil {
				return walkErr
			}
			if entry.IsDir() || !strings.HasSuffix(path, ".thue") {
				return nil
			}
			text, readErr := os.ReadFile(path)
			if readErr != nil {
				return readErr
			}
			rel, relErr := filepath.Rel(repo, path)
			if relErr != nil {
				return relErr
			}
			resources, errors := classifyPlaygroundRules(rulesBeforeSeparator(string(text)))
			if resources == nil {
				resources = []catalogResource{}
			}
			if errors == nil {
				errors = []string{}
			}
			files = append(files, catalogFile{
				Path:      filepath.ToSlash(rel),
				Resources: resources,
				Errors:    errors,
			})
			return nil
		})
		if err != nil {
			break
		}
	}
	if err != nil {
		t.Fatal(err)
	}
	slices.SortFunc(files, func(a, b catalogFile) int { return strings.Compare(a.Path, b.Path) })
	got, err := json.MarshalIndent(files, "", "  ")
	if err != nil {
		t.Fatal(err)
	}
	got = append(got, '\n')
	catalogPath := filepath.Join("..", "..", "demo", "src", "ruleResources.catalog.json")
	if os.Getenv("UPDATE_RULE_CATALOG") == "1" {
		if err := os.WriteFile(catalogPath, got, 0o644); err != nil {
			t.Fatal(err)
		}
		return
	}
	want, err := os.ReadFile(catalogPath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(got, want) {
		t.Fatalf("playground rule catalog drifted from %s\nre-run with UPDATE_RULE_CATALOG=1 after checking the Go parser", catalogPath)
	}
}

func rulesBeforeSeparator(source string) string {
	source = strings.ReplaceAll(source, "\r\n", "\n")
	source = strings.ReplaceAll(source, "\r", "\n")
	lines := strings.Split(source, "\n")
	for idx, line := range lines {
		if strings.TrimSpace(line) == "::=" {
			return strings.Join(lines[:idx], "\n")
		}
	}
	return source
}

func classifyPlaygroundRules(rules string) ([]catalogResource, []string) {
	var resources []catalogResource
	index := map[string]int{}
	var errors []string
	invalidOperator := regexp.MustCompile(`(?:^|[^\\])::[^\s\w=<>!-]`)
	for idx, line := range strings.Split(rules, "\n") {
		lineNumber := idx + 1
		lhs, _, op, rhs, ok, err := splitRuleLine(line)
		if err != nil {
			errors = append(errors, "Line "+strconv.Itoa(lineNumber)+": "+err.Error())
			continue
		}
		if !ok {
			if invalidOperator.MatchString(line) {
				errors = append(errors, "Line "+strconv.Itoa(lineNumber)+": Invalid rule syntax: "+line)
			}
			continue
		}
		lhs = strings.TrimRight(lhs, " \t")
		if lhs == "" {
			continue
		}
		rhs = strings.TrimLeft(rhs, " \t")
		switch op {
		case '<':
			name, _, readErr := parseReadRHS(lineNumber, rhs)
			if readErr != nil {
				errors = append(errors, readErr.Error())
				continue
			}
			markCatalogResource(&resources, index, name, true, false)
		case '>':
			name, found := literalWriteResource(rhs)
			if found {
				markCatalogResource(&resources, index, name, false, true)
			}
		}
	}
	return resources, errors
}

func literalWriteResource(rhs string) (string, bool) {
	token := rhs
	for idx, r := range rhs {
		if r == ' ' || r == '\t' {
			token = rhs[:idx]
			break
		}
	}
	if token == "" || strings.Contains(token, "{{") || strings.Contains(token, `\`) {
		return "", false
	}
	if !isWord(token) || token[0] >= '0' && token[0] <= '9' {
		return "", false
	}
	return token, true
}

func markCatalogResource(resources *[]catalogResource, index map[string]int, name string, read bool, write bool) {
	pos, ok := index[name]
	if !ok {
		index[name] = len(*resources)
		*resources = append(*resources, catalogResource{Name: name})
		pos = index[name]
	}
	item := &(*resources)[pos]
	if read {
		item.Reads = true
	}
	if write {
		item.Writes = true
	}
}
