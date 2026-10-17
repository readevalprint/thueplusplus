package thuelang

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// scriptResource serves a fixed list of lines and records writes.
// A read past the list is EOF. A write to a read-only script fails.
// A read of a write-only script fails the same way stdout does.
type scriptResource struct {
	lines []string
	next  int
	read  bool
	write *bytes.Buffer
}

func newScriptResource(lines []string, read bool, write bool) *scriptResource {
	res := &scriptResource{lines: append([]string(nil), lines...), read: read}
	if write {
		res.write = &bytes.Buffer{}
	}
	return res
}

func (r *scriptResource) ReadLine(time.Duration) (string, error) {
	if !r.read {
		return "", unnamedResourceError("cannot_read_output_stream")
	}
	if r.next >= len(r.lines) {
		return "", fmt.Errorf("EOF before newline")
	}
	line := r.lines[r.next]
	r.next++
	return line, nil
}

func (r *scriptResource) WriteString(content string) error {
	if r.write == nil {
		return fmt.Errorf("write requires process or output stream binding")
	}
	_, err := r.write.WriteString(content)
	return err
}

func (r *scriptResource) Cleanup() {}

// ResourceScript is one in-memory resource set. Reads maps a resource name to
// the lines it serves, without newlines. Writes names the resources whose
// output is recorded. A name in both lists is readable and writable.
type ResourceScript struct {
	Reads  map[string][]string `json:"reads"`
	Writes []string            `json:"writes"`
}

// UseScripts replaces every binding with in-memory scripts. It does not start
// a process. The default stdin, stdout, and stderr bindings are removed.
func (i *Interpreter) UseScripts(script ResourceScript) error {
	if script.Reads == nil {
		return fmt.Errorf("reads are required")
	}
	if script.Writes == nil {
		return fmt.Errorf("writes are required")
	}
	writeSet := map[string]struct{}{}
	for _, name := range script.Writes {
		if !validResourceName(name) {
			return fmt.Errorf("invalid resource %q", name)
		}
		if _, ok := writeSet[name]; ok {
			return fmt.Errorf("duplicate writable resource %s", name)
		}
		writeSet[name] = struct{}{}
	}
	for name, lines := range script.Reads {
		if !validResourceName(name) {
			return fmt.Errorf("invalid resource %q", name)
		}
		for _, line := range lines {
			if strings.ContainsAny(line, "\r\n") {
				return fmt.Errorf("resource %s line contains a newline", name)
			}
		}
	}
	names := map[string]struct{}{}
	for name := range script.Reads {
		names[name] = struct{}{}
	}
	for name := range writeSet {
		names[name] = struct{}{}
	}
	if len(names) == 0 {
		return fmt.Errorf("no resources")
	}
	i.Cleanup()
	bindings := map[string]*Binding{}
	scripts := map[string]*scriptResource{}
	for name := range names {
		_, read := script.Reads[name]
		_, write := writeSet[name]
		lines := script.Reads[name]
		res := newScriptResource(lines, read, write)
		scripts[name] = res
		bindings[name] = &Binding{Name: name, PathOrCommand: name, Resource: res}
	}
	i.Bindings = bindings
	i.scripts = scripts
	return nil
}

// ScriptWrites returns the text recorded for each writable script.
func (i *Interpreter) ScriptWrites() (map[string]string, error) {
	if i.scripts == nil {
		return nil, fmt.Errorf("this run has no scripted resources")
	}
	out := map[string]string{}
	for name, res := range i.scripts {
		if res.write == nil {
			continue
		}
		out[name] = res.write.String()
	}
	return out, nil
}

func validResourceName(name string) bool {
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

// LoadResourceFile reads a --resources file.
func LoadResourceFile(path string) (ResourceScript, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return ResourceScript{}, err
	}
	dec := json.NewDecoder(bytes.NewReader(data))
	dec.DisallowUnknownFields()
	var script ResourceScript
	if err := dec.Decode(&script); err != nil {
		return ResourceScript{}, fmt.Errorf("%s: %w", path, err)
	}
	if dec.More() {
		return ResourceScript{}, fmt.Errorf("%s: extra JSON value", path)
	}
	return script, nil
}

// WriteResourceOutput writes the recorded writable resources as one JSON object.
func WriteResourceOutput(path string, writes map[string]string) error {
	if writes == nil {
		return fmt.Errorf("writes are required")
	}
	payload, err := json.MarshalIndent(writes, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, append(payload, '\n'), 0o644)
}
