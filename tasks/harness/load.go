package harness

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// IntLine is one non-negative integer and a newline. Task references use it
// for stdin the harness already built.
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

// Lines splits stdin into newline-terminated lines with the newlines removed.
func Lines(stdin string) ([]string, error) {
	if stdin == "" || !strings.HasSuffix(stdin, "\n") {
		return nil, fmt.Errorf("stdin must end with a newline")
	}
	parts := strings.Split(strings.TrimSuffix(stdin, "\n"), "\n")
	return parts, nil
}

type Guest struct {
	ID        string
	Program   string
	Extension string
}

type Solution struct {
	Guest   Guest
	Path    string // repo-relative, empty when unsupported
	Text    string // --input text, empty when unsupported
	Bytes   int
	Lines   int
	Reason  string
	Missing bool
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

func LoadGuests(root string) ([]Guest, error) {
	path := filepath.Join(root, "tasks", "guests.toml")
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	var guests []Guest
	var current *Guest
	scanner := bufio.NewScanner(file)
	lineNo := 0
	for scanner.Scan() {
		lineNo++
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if line == "[[guest]]" {
			if current != nil {
				guests = append(guests, *current)
			}
			current = &Guest{}
			continue
		}
		if current == nil {
			return nil, fmt.Errorf("%s:%d: expected [[guest]]", path, lineNo)
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			return nil, fmt.Errorf("%s:%d: expected key = value", path, lineNo)
		}
		key = strings.TrimSpace(key)
		value = strings.Trim(strings.TrimSpace(value), `"`)
		switch key {
		case "id":
			current.ID = value
		case "program":
			current.Program = value
		case "extension":
			current.Extension = value
		default:
			return nil, fmt.Errorf("%s:%d: unknown guest key %s", path, lineNo, key)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if current != nil {
		guests = append(guests, *current)
	}
	if len(guests) == 0 {
		return nil, fmt.Errorf("%s: no guests", path)
	}
	seen := map[string]struct{}{}
	for _, guest := range guests {
		if guest.ID == "" || guest.Program == "" || guest.Extension == "" {
			return nil, fmt.Errorf("%s: guest %#v is incomplete", path, guest)
		}
		if _, ok := seen[guest.ID]; ok {
			return nil, fmt.Errorf("%s: duplicate guest %s", path, guest.ID)
		}
		seen[guest.ID] = struct{}{}
		if !strings.HasSuffix(guest.Program, ".tpp") {
			return nil, fmt.Errorf("%s: %s program must be a .tpp file", path, guest.ID)
		}
	}
	return guests, nil
}

func LoadOrder(root string) ([]string, error) {
	path := filepath.Join(root, "tasks", "suite.toml")
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

func TaskTitle(dir string) (string, error) {
	text, err := os.ReadFile(filepath.Join(dir, "task.md"))
	if err != nil {
		return "", err
	}
	line, _, _ := strings.Cut(string(text), "\n")
	title := strings.TrimPrefix(line, "# ")
	if title == "" || title == line {
		return "", fmt.Errorf("%s/task.md must start with a # title", dir)
	}
	return title, nil
}

func loadSolutions(root, taskID string, guests []Guest) ([]Solution, error) {
	dir := filepath.Join(root, "tasks", taskID, "solutions")
	out := make([]Solution, 0, len(guests))
	for _, guest := range guests {
		program := filepath.Join(dir, guest.ID+"."+guest.Extension)
		marker := filepath.Join(dir, guest.ID+".unsupported")
		_, programErr := os.Stat(program)
		_, markerErr := os.Stat(marker)
		hasProgram := programErr == nil
		hasMarker := markerErr == nil
		if programErr != nil && !os.IsNotExist(programErr) {
			return nil, programErr
		}
		if markerErr != nil && !os.IsNotExist(markerErr) {
			return nil, markerErr
		}
		if hasProgram == hasMarker {
			return nil, fmt.Errorf("%s/%s: need exactly one of %s or unsupported", taskID, guest.ID, guest.Extension)
		}
		if hasMarker {
			text, err := os.ReadFile(marker)
			if err != nil {
				return nil, err
			}
			reason := strings.TrimSpace(string(text))
			if reason == "" {
				return nil, fmt.Errorf("%s/%s: unsupported marker is empty", taskID, guest.ID)
			}
			out = append(out, Solution{Guest: guest, Reason: reason})
			continue
		}
		data, err := os.ReadFile(program)
		if err != nil {
			return nil, err
		}
		if len(data) == 0 || data[len(data)-1] != '\n' {
			return nil, fmt.Errorf("%s must end with a newline", program)
		}
		body := string(data[:len(data)-1])
		if strings.TrimSpace(body) == "" {
			return nil, fmt.Errorf("%s is empty", program)
		}
		rel := filepath.ToSlash(filepath.Join("tasks", taskID, "solutions", guest.ID+"."+guest.Extension))
		out = append(out, Solution{
			Guest: guest,
			Path:  rel,
			Text:  body,
			Bytes: len(data),
			Lines: strings.Count(string(data), "\n"),
		})
	}
	return out, nil
}

// RequireNativeGo refuses a hosts.toml go row that stretches the case timeout.
// Task runs are native Go. The case timeout is the OS timeout.
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
			return fmt.Errorf("hosts.toml go row sets a timeout scale or floor; native Go task runs use the case timeout")
		}
		return nil
	}
	return fmt.Errorf("hosts.toml has no go host")
}
