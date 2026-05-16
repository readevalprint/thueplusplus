package thuepp

import (
	"bufio"
	"bytes"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"math/big"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

type Operator string

const (
	Substitute Operator = "::="
	Read       Operator = "::<"
	Write      Operator = "::>"
	Exit       Operator = "::-"
	Builtin    Operator = "::!"
)

var (
	numericLiteralPattern  = regexp.MustCompile(`^-?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)$`)
	zeroDenominatorPattern = regexp.MustCompile(`^-?[0-9]+/0+$`)
)

const MaxNumericLiteralChars = 4096

type Rule struct {
	LHS         string
	Pattern     *regexp.Regexp
	Operator    Operator
	RHS         string
	LineNumber  int
	SourcePath  string
	BuiltinName string
	BuiltinArgs []string
}

type Binding struct {
	Name          string
	IsProcess     bool
	PathOrCommand string
	cmd           *exec.Cmd
	stdin         io.WriteCloser
	stdout        io.ReadCloser
	stderr        bytes.Buffer
	outCh         chan string
	exitCh        chan error
}

type Interpreter struct {
	Rules              []Rule
	State              string
	Bindings           map[string]*Binding
	MaxEvals           *int
	MaxStateBytes      *int
	EvalCount          int
	Debug              bool
	Stdout             io.Writer
	Stderr             io.Writer
	RuleCoveragePath   string
	RuleCoverageCounts map[string]int
	ProgramPath        string
}

func New() *Interpreter {
	i := &Interpreter{Bindings: map[string]*Binding{}, Stdout: os.Stdout, Stderr: os.Stderr, RuleCoverageCounts: map[string]int{}}
	i.Bindings["stdout"] = &Binding{Name: "stdout", PathOrCommand: "stdout"}
	i.Bindings["stderr"] = &Binding{Name: "stderr", PathOrCommand: "stderr"}
	return i
}

func (i *Interpreter) AddFileBinding(name, path string) {
	i.Bindings[name] = &Binding{Name: name, PathOrCommand: path}
}
func (i *Interpreter) AddProcBinding(name, command string) {
	i.Bindings[name] = &Binding{Name: name, IsProcess: true, PathOrCommand: command}
}

func (i *Interpreter) LoadProgram(programPath string) error {
	abs, err := filepath.Abs(programPath)
	if err != nil {
		return err
	}
	i.ProgramPath = abs
	content, err := i.loadWithIncludes(abs, map[string]bool{})
	if err != nil {
		return err
	}
	return i.parseProgram(content)
}

func (i *Interpreter) loadWithIncludes(filePath string, included map[string]bool) (string, error) {
	if included[filePath] {
		return "", fmt.Errorf("Cyclic include detected: %s", filePath)
	}
	included[filePath] = true
	f, err := os.Open(filePath)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", fmt.Errorf("File not found: %s", filePath)
		}
		return "", err
	}
	defer f.Close()
	var b strings.Builder
	s := bufio.NewScanner(f)
	// allow long example lines
	s.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)
	lineNumber := 0
	for s.Scan() {
		lineNumber++
		line := s.Text() + "\n"
		stripped := strings.TrimSpace(line)
		if strings.HasPrefix(stripped, "@include ") {
			p := strings.TrimSpace(stripped[9:])
			if strings.HasPrefix(p, "\"") && strings.HasSuffix(p, "\"") {
				p = strings.TrimSuffix(strings.TrimPrefix(p, "\""), "\"")
			}
			inc, err := i.loadWithIncludes(filepath.Join(filepath.Dir(filePath), p), included)
			if err != nil {
				return "", err
			}
			b.WriteString(inc)
		} else {
			b.WriteString(fmt.Sprintf("# thuepp-source: %s:%d\n", filePath, lineNumber))
			b.WriteString(line)
		}
	}
	return b.String(), s.Err()
}

func expandPatterns(content string) string {
	patterns := map[string]string{}
	var out []string
	for _, line := range strings.Split(content, "\n") {
		stripped := strings.TrimSpace(line)
		if stripped == "" || strings.HasPrefix(stripped, "#") {
			out = append(out, line)
			continue
		}
		if strings.Contains(line, "<-") && !strings.Contains(line, "::=") {
			parts := strings.SplitN(line, "<-", 2)
			name := strings.TrimSpace(parts[0])
			pat := strings.TrimSpace(parts[1])
			if name != "" {
				patterns[name] = pat
				out = append(out, "# [pattern] "+name+" <- "+pat)
				continue
			}
		}
		expanded := line
		for name, pat := range patterns {
			expanded = strings.ReplaceAll(expanded, "<|"+name+"|>", pat)
		}
		out = append(out, expanded)
	}
	return strings.Join(out, "\n")
}

func (i *Interpreter) parseProgram(content string) error {
	content = expandPatterns(content)
	lines := strings.Split(content, "\n")
	rulesSection := true
	terminator := false
	var initial []string
	currentSource := i.ProgramPath
	currentLine := 0
	for n, line := range lines {
		ln := n + 1
		stripped := strings.TrimSpace(line)
		if strings.HasPrefix(stripped, "# thuepp-source: ") {
			sourceRef := strings.TrimPrefix(stripped, "# thuepp-source: ")
			sep := strings.LastIndex(sourceRef, ":")
			if sep >= 0 {
				currentSource = sourceRef[:sep]
				if parsedLine, err := strconv.Atoi(sourceRef[sep+1:]); err == nil {
					currentLine = parsedLine
				}
			}
			continue
		}
		if stripped == "" || strings.HasPrefix(stripped, "#") {
			if !rulesSection {
				initial = append(initial, line)
			}
			continue
		}
		if rulesSection {
			if strings.TrimSpace(line) == "::=" {
				rulesSection = false
				terminator = true
				continue
			}
			if currentLine != 0 {
				ln = currentLine
			}
			r, err := parseRule(line, ln, currentSource)
			if err != nil {
				return err
			}
			if r != nil {
				i.Rules = append(i.Rules, *r)
			}
		} else {
			initial = append(initial, line)
		}
	}
	if !terminator {
		return fmt.Errorf("Program must contain a terminating '::=' line")
	}
	i.State = strings.Trim(strings.Join(initial, "\n"), "\n")
	return nil
}

func parseRule(line string, lineNumber int, sourcePath string) (*Rule, error) {
	ops := []struct {
		op Operator
		s  string
	}{{Exit, "::-"}, {Read, "::<"}, {Write, "::>"}, {Builtin, "::!"}, {Substitute, "::="}}
	for _, oo := range ops {
		idx := findOperator(line, oo.s)
		if idx != -1 {
			lhs := strings.TrimRight(line[:idx], " \t")
			rhs := strings.TrimLeft(line[idx+len(oo.s):], " \t")
			if lhs == "" && oo.op != Exit {
				return nil, fmt.Errorf("Line %d: Rule must have a non-empty LHS (except for exit rules)", lineNumber)
			}
			pat := lhs
			if pat == "" {
				pat = "^"
			}
			re, err := regexp.Compile(pat)
			if err != nil {
				return nil, fmt.Errorf("Line %d: Invalid regex '%s': %v", lineNumber, lhs, err)
			}
			builtinName := ""
			var builtinArgs []string
			if oo.op == Builtin {
				var err error
				builtinName, builtinArgs, err = parseBuiltinCall(rhs, lineNumber, captureNames(re))
				if err != nil {
					return nil, err
				}
			}
			return &Rule{LHS: lhs, Pattern: re, Operator: oo.op, RHS: rhs, LineNumber: lineNumber, SourcePath: sourcePath, BuiltinName: builtinName, BuiltinArgs: builtinArgs}, nil
		}
	}
	if strings.TrimSpace(line) != "" && !strings.HasPrefix(strings.TrimSpace(line), "#") {
		return nil, fmt.Errorf("Line %d: Invalid rule syntax: %s", lineNumber, line)
	}
	return nil, nil
}

func captureNames(re *regexp.Regexp) map[string]bool {
	names := map[string]bool{}
	for _, name := range re.SubexpNames() {
		if name != "" {
			names[name] = true
		}
	}
	return names
}

func parseBuiltinCall(rhs string, lineNumber int, captures map[string]bool) (string, []string, error) {
	tokens := strings.Fields(rhs)
	if len(tokens) == 0 {
		return "", nil, fmt.Errorf("Line %d: ::! requires a builtin name", lineNumber)
	}
	name := tokens[0]
	arity, ok := builtinArity(name)
	if !ok {
		return "", nil, fmt.Errorf("Line %d: Unknown builtin '%s'", lineNumber, name)
	}
	args := tokens[1:]
	if len(args) != arity {
		return "", nil, fmt.Errorf("Line %d: Builtin '%s' expects %d args, got %d", lineNumber, name, arity, len(args))
	}
	for _, arg := range args {
		if !isWord(arg) || arg[0] >= '0' && arg[0] <= '9' {
			return "", nil, fmt.Errorf("Line %d: ::! arguments must be capture names, got '%s'", lineNumber, arg)
		}
		if !captures[arg] {
			return "", nil, fmt.Errorf("Line %d: ::! argument '%s' is not a named capture", lineNumber, arg)
		}
	}
	return name, args, nil
}

func builtinArity(name string) (int, bool) {
	arities := map[string]int{
		"eq":     2,
		"add":    2,
		"sub":    2,
		"mul":    2,
		"div":    2,
		"mod":    2,
		"numeq":  2,
		"lt":     2,
		"le":     2,
		"gt":     2,
		"ge":     2,
		"num":    1,
		"b64enc": 1,
		"b64dec": 1,
	}
	arity, ok := arities[name]
	return arity, ok
}

func b64urlEncode(value string) string {
	return base64.RawURLEncoding.EncodeToString([]byte(value))
}

func b64urlDecode(value string) (string, error) {
	if strings.Contains(value, "=") {
		return "", fmt.Errorf("Builtin 'b64dec' expected unpadded Base64url input")
	}
	for _, r := range value {
		if !(r >= 'A' && r <= 'Z' || r >= 'a' && r <= 'z' || r >= '0' && r <= '9' || r == '-' || r == '_') {
			return "", fmt.Errorf("Builtin 'b64dec' expected Base64url input")
		}
	}
	if len(value)%4 == 1 {
		return "", fmt.Errorf("Builtin 'b64dec' invalid Base64url length")
	}
	decoded, err := base64.RawURLEncoding.Strict().DecodeString(value)
	if err != nil {
		return "", fmt.Errorf("Builtin 'b64dec' invalid Base64url input: %w", err)
	}
	if !utf8.Valid(decoded) {
		return "", fmt.Errorf("Builtin 'b64dec' decoded bytes are not valid UTF-8")
	}
	text := string(decoded)
	if b64urlEncode(text) != value {
		return "", fmt.Errorf("Builtin 'b64dec' expected canonical unpadded Base64url input")
	}
	return text, nil
}

func parseNumber(value, builtin string) (*big.Rat, error) {
	if !numericLiteralPattern.MatchString(value) {
		return nil, fmt.Errorf("Builtin '%s' expected numeric input, got '%s'", builtin, value)
	}
	if len(value) > MaxNumericLiteralChars {
		return nil, fmt.Errorf("Builtin '%s' numeric input exceeds maximum length (%d characters)", builtin, MaxNumericLiteralChars)
	}
	if zeroDenominatorPattern.MatchString(value) {
		return nil, fmt.Errorf("Builtin '%s' fraction denominator must be non-zero", builtin)
	}
	n := new(big.Rat)
	if _, ok := n.SetString(value); !ok {
		return nil, fmt.Errorf("Builtin '%s' expected numeric input, got '%s'", builtin, value)
	}
	return n, nil
}

func formatRat(n *big.Rat) string {
	if n.IsInt() {
		return n.Num().String()
	}
	return n.RatString()
}

func evalBuiltin(name string, values []string) (string, error) {
	if name == "eq" {
		if values[0] == values[1] {
			return "1", nil
		}
		return "0", nil
	}
	if name == "b64enc" {
		return b64urlEncode(values[0]), nil
	}
	if name == "b64dec" {
		return b64urlDecode(values[0])
	}
	if name == "num" {
		n, err := parseNumber(values[0], name)
		if err != nil {
			return "", err
		}
		return "<num>" + formatRat(n) + "</num>", nil
	}
	a, err := parseNumber(values[0], name)
	if err != nil {
		return "", err
	}
	b, err := parseNumber(values[1], name)
	if err != nil {
		return "", err
	}
	switch name {
	case "add":
		return formatRat(new(big.Rat).Add(a, b)), nil
	case "sub":
		return formatRat(new(big.Rat).Sub(a, b)), nil
	case "mul":
		return formatRat(new(big.Rat).Mul(a, b)), nil
	case "div":
		if b.Sign() == 0 {
			return "", fmt.Errorf("Builtin 'div' division by zero")
		}
		return formatRat(new(big.Rat).Quo(a, b)), nil
	case "mod":
		if b.Sign() == 0 {
			return "", fmt.Errorf("Builtin 'mod' modulo by zero")
		}
		if !a.IsInt() || !b.IsInt() {
			return "", fmt.Errorf("Builtin 'mod' expected integer inputs")
		}
		if a.Sign() < 0 || b.Sign() < 0 {
			return "", fmt.Errorf("Builtin 'mod' expected non-negative integer inputs")
		}
		return new(big.Int).Mod(a.Num(), b.Num()).String(), nil
	case "numeq":
		if a.Cmp(b) == 0 {
			return "1", nil
		}
		return "0", nil
	case "lt":
		if a.Cmp(b) < 0 {
			return "1", nil
		}
		return "0", nil
	case "le":
		if a.Cmp(b) <= 0 {
			return "1", nil
		}
		return "0", nil
	case "gt":
		if a.Cmp(b) > 0 {
			return "1", nil
		}
		return "0", nil
	case "ge":
		if a.Cmp(b) >= 0 {
			return "1", nil
		}
		return "0", nil
	}
	return "", fmt.Errorf("Unknown builtin '%s'", name)
}

func findOperator(line, op string) int {
	depth := 0
	charClass := false
	for idx := 0; idx < len(line); {
		c := line[idx]
		if c == '\\' && idx+1 < len(line) {
			idx += 2
			continue
		}
		if c == '[' && !charClass {
			charClass = true
		} else if c == ']' && charClass {
			charClass = false
		} else if c == '(' && !charClass {
			depth++
		} else if c == ')' && !charClass && depth > 0 {
			depth--
		}
		if !charClass && depth == 0 && strings.HasPrefix(line[idx:], op) {
			beforeOK := idx == 0 || line[idx-1] == ' ' || line[idx-1] == '\t'
			after := idx + len(op)
			afterOK := after >= len(line) || line[after] == ' ' || line[after] == '\t'
			if beforeOK && afterOK {
				return idx
			}
		}
		idx++
	}
	return -1
}

func (i *Interpreter) expandTemplate(template string, groups map[string]string, extra map[string]string) string {
	vars := map[string]string{}
	for k, v := range groups {
		vars[k] = strings.ReplaceAll(v, `\`, `\\`)
	}
	for k, v := range extra {
		vars[k] = strings.ReplaceAll(v, `\`, `\\`)
	}
	currentOpen, currentClose := "{{", "}}"
	var out strings.Builder
	pos := 0
	for pos < len(template) {
		if strings.HasPrefix(template[pos:], currentOpen+"=") {
			end := strings.Index(template[pos+len(currentOpen)+1:], "="+currentClose)
			if end >= 0 {
				inside := template[pos+len(currentOpen)+1 : pos+len(currentOpen)+1+end]
				parts := strings.SplitN(inside, " ", 2)
				if len(parts) == 2 {
					currentOpen, currentClose = parts[0], parts[1]
					pos += len(currentOpen) + 1 + end + 1 + len(currentClose)
					continue
				}
			}
		}
		if strings.HasPrefix(template[pos:], currentOpen) {
			end := strings.Index(template[pos+len(currentOpen):], currentClose)
			if end >= 0 {
				name := template[pos+len(currentOpen) : pos+len(currentOpen)+end]
				if isWord(name) {
					out.WriteString(vars[name])
					pos += len(currentOpen) + end + len(currentClose)
					continue
				}
			}
		}
		out.WriteByte(template[pos])
		pos++
	}
	res := out.String()
	ph := "\x00BACKSLASH\x00"
	res = strings.ReplaceAll(res, `\\`, ph)
	res = strings.ReplaceAll(res, `\n`, "\n")
	res = strings.ReplaceAll(res, `\t`, "\t")
	res = strings.ReplaceAll(res, `\r`, "\r")
	res = strings.ReplaceAll(res, ph, `\`)
	return res
}

func isWord(s string) bool {
	if s == "" {
		return false
	}
	for _, r := range s {
		if !(r == '_' || r >= '0' && r <= '9' || r >= 'a' && r <= 'z' || r >= 'A' && r <= 'Z') {
			return false
		}
	}
	return true
}

func (i *Interpreter) ensureProcess(b *Binding) error {
	if !b.IsProcess || b.cmd != nil {
		return nil
	}
	b.cmd = exec.Command("/bin/sh", "-c", "stdbuf -oL "+b.PathOrCommand)
	b.cmd.Stderr = &b.stderr
	var err error
	b.stdin, err = b.cmd.StdinPipe()
	if err != nil {
		return err
	}
	b.stdout, err = b.cmd.StdoutPipe()
	if err != nil {
		return err
	}
	b.outCh = make(chan string, 1024)
	b.exitCh = make(chan error, 1)
	if err := b.cmd.Start(); err != nil {
		return err
	}
	go func() {
		reader := bufio.NewReader(b.stdout)
		buf := make([]byte, 4096)
		for {
			n, err := reader.Read(buf)
			if n > 0 {
				b.outCh <- string(buf[:n])
			}
			if err != nil {
				close(b.outCh)
				return
			}
		}
	}()
	go func() { b.exitCh <- b.cmd.Wait() }()
	return nil
}

func (i *Interpreter) readAll(b *Binding) (string, string) {
	if b.Name == "stdout" || b.Name == "stderr" {
		return "", "ERR:resource:cannot_read_output_stream"
	}
	if b.IsProcess {
		if err := i.ensureProcess(b); err != nil {
			return "", fmt.Sprintf("ERR:resource:%s:%v", b.Name, err)
		}
		var out strings.Builder
		deadline := time.After(100 * time.Millisecond)
		for {
			select {
			case s, ok := <-b.outCh:
				if ok {
					out.WriteString(s)
					deadline = time.After(100 * time.Millisecond)
					continue
				}
				return out.String(), ""
			case <-deadline:
				if out.Len() > 0 {
					return out.String(), ""
				}
				goto waitFirst
			case err := <-b.exitCh:
				if err != nil {
					msg := strings.TrimSpace(b.stderr.String())
					if msg == "" {
						msg = fmt.Sprintf("process exited %d", b.cmd.ProcessState.ExitCode())
					}
					return "", fmt.Sprintf("ERR:resource:%s:%s", b.Name, msg)
				}
				return out.String(), ""
			}
		}
	waitFirst:
		select {
		case s, ok := <-b.outCh:
			if ok {
				out.WriteString(s)
				return out.String(), ""
			}
			return "", ""
		case <-time.After(5 * time.Second):
			return "", ""
		case err := <-b.exitCh:
			if err != nil {
				msg := strings.TrimSpace(b.stderr.String())
				if msg == "" {
					msg = fmt.Sprintf("process exited %d", b.cmd.ProcessState.ExitCode())
				}
				return "", fmt.Sprintf("ERR:resource:%s:%s", b.Name, msg)
			}
			return "", ""
		}
	}
	data, err := os.ReadFile(b.PathOrCommand)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return "", "ERR:resource:notfound:" + b.Name
		}
		return "", fmt.Sprintf("ERR:resource:%s:%v", b.Name, err)
	}
	return string(data), ""
}

func (i *Interpreter) writeString(b *Binding, content string) string {
	if b.Name == "stdout" {
		_, err := io.WriteString(i.Stdout, content)
		if err != nil {
			return fmt.Sprintf("ERR:resource:%s:%v", b.Name, err)
		}
		return ""
	}
	if b.Name == "stderr" {
		_, err := io.WriteString(i.Stderr, content)
		if err != nil {
			return fmt.Sprintf("ERR:resource:%s:%v", b.Name, err)
		}
		return ""
	}
	if b.IsProcess {
		if err := i.ensureProcess(b); err != nil {
			return fmt.Sprintf("ERR:resource:%s:%v", b.Name, err)
		}
		_, err := io.WriteString(b.stdin, content)
		if err != nil {
			return fmt.Sprintf("ERR:resource:%s:%v", b.Name, err)
		}
		return ""
	}
	if err := os.WriteFile(b.PathOrCommand, []byte(content), 0644); err != nil {
		return fmt.Sprintf("ERR:resource:%s:%v", b.Name, err)
	}
	return ""
}

func (i *Interpreter) setState(s string) error {
	if i.MaxStateBytes != nil && len([]byte(s)) > *i.MaxStateBytes {
		return fmt.Errorf("State size (%d bytes) exceeds maximum (%d bytes)", len([]byte(s)), *i.MaxStateBytes)
	}
	i.State = s
	return nil
}

type matchInfo struct {
	start, end int
	groups     map[string]string
}

func (i *Interpreter) replaceMatch(m matchInfo, replacement string) error {
	return i.setState(i.State[:m.start] + replacement + i.State[m.end:])
}

func (i *Interpreter) ruleID(rule Rule) string {
	source := rule.SourcePath
	if rel, err := filepath.Rel(".", source); err == nil && !strings.HasPrefix(rel, "..") && !filepath.IsAbs(rel) {
		source = filepath.ToSlash(rel)
	} else {
		source = filepath.ToSlash(source)
	}
	return fmt.Sprintf("%s:%d", source, rule.LineNumber)
}

func (i *Interpreter) recordRuleCoverage(rule Rule) {
	if i.RuleCoveragePath == "" {
		return
	}
	if i.RuleCoverageCounts == nil {
		i.RuleCoverageCounts = map[string]int{}
	}
	i.RuleCoverageCounts[i.ruleID(rule)]++
}

func (i *Interpreter) WriteRuleCoverage() error {
	if i.RuleCoveragePath == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(i.RuleCoveragePath), 0755); err != nil {
		return err
	}
	ids := make([]string, 0, len(i.RuleCoverageCounts))
	for id := range i.RuleCoverageCounts {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	var b strings.Builder
	for _, id := range ids {
		fmt.Fprintf(&b, "%s\t%d\n", id, i.RuleCoverageCounts[id])
	}
	return os.WriteFile(i.RuleCoveragePath, []byte(b.String()), 0644)
}

func (i *Interpreter) Run() (int, error) {
	for {
		matched := false
		for _, rule := range i.Rules {
			if i.MaxEvals != nil && i.EvalCount >= *i.MaxEvals {
				return 1, fmt.Errorf("Rule probe limit (%d) exceeded", *i.MaxEvals)
			}
			i.EvalCount++
			m, ok := findMatch(rule, i.State)
			if !ok {
				continue
			}
			matched = true
			if i.Debug {
				fmt.Fprintf(i.Stderr, "match line=%d state=%q\n", rule.LineNumber, i.State)
			}
			groups := m.groups
			switch rule.Operator {
			case Substitute:
				if err := i.replaceMatch(m, i.expandTemplate(rule.RHS, groups, nil)); err != nil {
					return 1, err
				}
				i.recordRuleCoverage(rule)
			case Read:
				parts := strings.Fields(strings.TrimSpace(rule.RHS))
				resourceTemplate := strings.TrimSpace(rule.RHS)
				rest := ""
				if len(parts) > 0 {
					resourceTemplate = parts[0]
					idx := strings.Index(strings.TrimSpace(rule.RHS), parts[0])
					rest = strings.TrimLeft(strings.TrimSpace(rule.RHS)[idx+len(parts[0]):], " \t")
				}
				resource := i.expandTemplate(resourceTemplate, groups, nil)
				b := i.Bindings[resource]
				if b == nil {
					_ = i.replaceMatch(m, "ERR:resource:"+resource)
				} else {
					content, er := i.readAll(b)
					repl := er
					if repl == "" {
						if rest != "" {
							repl = i.expandTemplate(rest, groups, map[string]string{"data": content})
						} else {
							repl = content
						}
					}
					if err := i.replaceMatch(m, repl); err != nil {
						return 1, err
					}
					if er == "" {
						i.recordRuleCoverage(rule)
					}
				}
			case Write:
				expanded := i.expandTemplate(rule.RHS, groups, nil)
				resource, content := splitResource(expanded)
				b := i.Bindings[resource]
				repl := ""
				if b == nil {
					repl = "ERR:resource:" + resource
				} else {
					repl = i.writeString(b, content)
				}
				if err := i.replaceMatch(m, repl); err != nil {
					return 1, err
				}
				if b != nil && repl == "" {
					i.recordRuleCoverage(rule)
				}
			case Builtin:
				values := make([]string, 0, len(rule.BuiltinArgs))
				for _, arg := range rule.BuiltinArgs {
					value, ok := groups[arg]
					if !ok {
						return 1, fmt.Errorf("Line %d: ::! argument '%s' was not captured", rule.LineNumber, arg)
					}
					values = append(values, value)
				}
				repl, err := evalBuiltin(rule.BuiltinName, values)
				if err != nil {
					return 1, err
				}
				if err := i.replaceMatch(m, repl); err != nil {
					return 1, err
				}
				i.recordRuleCoverage(rule)
			case Exit:
				codeStr := strings.TrimSpace(rule.RHS)
				if strings.HasPrefix(codeStr, "{") && strings.HasSuffix(codeStr, "}") {
					codeStr = codeStr[1 : len(codeStr)-1]
				}
				code, err := strconv.Atoi(codeStr)
				if err != nil {
					i.recordRuleCoverage(rule)
					return 1, nil
				}
				i.recordRuleCoverage(rule)
				return code, nil
			}
			break
		}
		if !matched {
			return 0, nil
		}
	}
}

func findMatch(rule Rule, state string) (matchInfo, bool) {
	idx := rule.Pattern.FindStringSubmatchIndex(state)
	if idx == nil {
		return matchInfo{}, false
	}
	names := rule.Pattern.SubexpNames()
	groups := map[string]string{}
	for n := 1; n < len(names) && 2*n+1 < len(idx); n++ {
		if names[n] != "" && idx[2*n] >= 0 {
			groups[names[n]] = state[idx[2*n]:idx[2*n+1]]
		}
	}
	return matchInfo{start: idx[0], end: idx[1], groups: groups}, true
}

func splitResource(expanded string) (string, string) {
	for idx, r := range expanded {
		if r == ' ' || r == '\t' {
			return expanded[:idx], expanded[idx+len(string(r)):]
		}
	}
	return expanded, ""
}

func (i *Interpreter) Cleanup() {
	for _, b := range i.Bindings {
		if b.cmd != nil && b.cmd.Process != nil {
			_ = b.cmd.Process.Kill()
			_, _ = b.cmd.Process.Wait()
		}
	}
}
