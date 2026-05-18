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
	Data       Operator = "::%"
)

var (
	numericLiteralPattern  = regexp.MustCompile(`^-?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)$`)
	pctPayloadPattern      = regexp.MustCompile(`^(?:[A-Za-z0-9_.-]|%[0-9A-F]{2})*$`)
	rulePattern            = regexp.MustCompile(`^(.*?)[ \t]+::([=<>!%-])(?:[ \t]+(.*)|[ \t]*)$`)
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
	RuleCache          map[string]*Rule
}

func New() *Interpreter {
	i := &Interpreter{Bindings: map[string]*Binding{}, Stdout: os.Stdout, Stderr: os.Stderr, RuleCoverageCounts: map[string]int{}, RuleCache: map[string]*Rule{}}
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
	var patternOrder []string
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
				if _, exists := patterns[name]; !exists {
					patternOrder = append(patternOrder, name)
				}
				patterns[name] = pat
				out = append(out, "# [pattern] "+name+" <- "+pat)
				continue
			}
		}
		expanded := line
		for _, name := range patternOrder {
			pat := patterns[name]
			expanded = strings.ReplaceAll(expanded, "<|"+name+"|>", pat)
		}
		out = append(out, expanded)
	}
	return strings.Join(out, "\n")
}

func (i *Interpreter) parseProgram(content string) error {
	content = expandPatterns(content)
	var rows []string
	for _, line := range strings.Split(content, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), "# thuepp-source: ") {
			continue
		}
		rows = append(rows, line)
	}
	i.State = strings.Trim(strings.Join(rows, "\n"), "\n")
	return nil
}

func parseRule(line string, lineNumber int, sourcePath string) (*Rule, error) {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" || strings.HasPrefix(trimmed, "#") {
		return nil, nil
	}
	matches := rulePattern.FindStringSubmatch(line)
	if matches == nil {
		if regexp.MustCompile(`[ \t]+::[^\s=<>!%-]`).FindStringIndex(line) != nil {
			return nil, fmt.Errorf("Line %d: Invalid rule syntax: %s", lineNumber, line)
		}
		return nil, nil
	}
	lhs := strings.TrimRight(matches[1], " \t")
	rhs := matches[3]
	var op Operator
	switch matches[2] {
	case "=":
		op = Substitute
	case "<":
		op = Read
	case ">":
		op = Write
	case "-":
		op = Exit
	case "!":
		op = Builtin
	case "%":
		op = Data
	default:
		return nil, fmt.Errorf("Line %d: Invalid rule syntax: %s", lineNumber, line)
	}
	if lhs == "" {
		return nil, fmt.Errorf("Line %d: Rule must have a non-empty LHS", lineNumber)
	}
	re, err := regexp.Compile("(?m)" + lhs)
	if err != nil {
		return nil, fmt.Errorf("Line %d: Invalid regex '%s': %v", lineNumber, lhs, err)
	}
	builtinName := ""
	var builtinArgs []string
	if op == Builtin {
		var err error
		builtinName, builtinArgs, err = parseBuiltinCall(rhs, lineNumber, captureNames(re))
		if err != nil {
			return nil, err
		}
	}
	return &Rule{LHS: lhs, Pattern: re, Operator: op, RHS: rhs, LineNumber: lineNumber, SourcePath: sourcePath, BuiltinName: builtinName, BuiltinArgs: builtinArgs}, nil
}

func (i *Interpreter) parseRuleCached(line string, lineNumber int, sourcePath string) (*Rule, error) {
	key := fmt.Sprintf("%s\x00%d\x00%s", sourcePath, lineNumber, line)
	if rule, ok := i.RuleCache[key]; ok {
		return rule, nil
	}
	rule, err := parseRule(line, lineNumber, sourcePath)
	if err != nil {
		return nil, err
	}
	i.RuleCache[key] = rule
	return rule, nil
}

func (i *Interpreter) ApplyInputOverride(value string) error {
	var ruleRows []string
	for n, line := range strings.Split(i.State, "\n") {
		rule, err := parseRule(line, n+1, i.ProgramPath)
		if err != nil {
			return err
		}
		if rule != nil {
			ruleRows = append(ruleRows, line)
		}
	}
	ruleRows = append(ruleRows, value)
	i.State = strings.Join(ruleRows, "\n")
	return nil
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
		"eq":              2,
		"add":             2,
		"sub":             2,
		"mul":             2,
		"div":             2,
		"mod":             2,
		"numeq":           2,
		"lt":              2,
		"le":              2,
		"gt":              2,
		"ge":              2,
		"num":             1,
		"b64enc":          1,
		"b64dec":          1,
		"pctenc":          1,
		"pctdec":          1,
		"lisp_len":        1,
		"lisp_get":        2,
		"lisp_head":       1,
		"lisp_tail":       1,
		"lisp_empty":      1,
		"lisp_push":       2,
		"lisp_show":       1,
		"lisp_map":        1,
		"lisp_has":        2,
		"lisp_mget":       2,
		"lisp_put":        3,
		"lisp_del":        2,
		"lisp_keys":       1,
		"lisp_mshow":      1,
		"lisp_quote_expr": 1,
		"lisp_quote1":     1,
		"lisp_quote2":     2,
		"lisp_quote3":     3,
		"lisp_quote4":     4,
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

func pctEncode(value string) string {
	var out strings.Builder
	for _, b := range []byte(value) {
		if b >= 'A' && b <= 'Z' || b >= 'a' && b <= 'z' || b >= '0' && b <= '9' || b == '_' || b == '.' || b == '-' {
			out.WriteByte(b)
		} else {
			out.WriteString(fmt.Sprintf("%%%02X", b))
		}
	}
	return out.String()
}

func pctDecode(value string) (string, error) {
	data := make([]byte, 0, len(value))
	for pos := 0; pos < len(value); {
		ch := value[pos]
		if ch == '%' {
			if pos+2 >= len(value) {
				return "", fmt.Errorf("PCT payload has incomplete percent escape")
			}
			hx := value[pos+1 : pos+3]
			for _, c := range []byte(hx) {
				if !(c >= '0' && c <= '9' || c >= 'A' && c <= 'F') {
					return "", fmt.Errorf("PCT payload has malformed or non-canonical percent escape")
				}
			}
			v, err := strconv.ParseUint(hx, 16, 8)
			if err != nil {
				return "", fmt.Errorf("PCT payload has malformed percent escape: %w", err)
			}
			data = append(data, byte(v))
			pos += 3
		} else {
			if !(ch >= 'A' && ch <= 'Z' || ch >= 'a' && ch <= 'z' || ch >= '0' && ch <= '9' || ch == '_' || ch == '.' || ch == '-') {
				return "", fmt.Errorf("PCT payload contains unencoded unsafe byte")
			}
			data = append(data, ch)
			pos++
		}
	}
	if !utf8.Valid(data) {
		return "", fmt.Errorf("PCT payload decoded bytes are not valid UTF-8")
	}
	return string(data), nil
}

func isLispValue(item string) bool {
	if strings.HasPrefix(item, "N:") && strings.HasSuffix(item, ";") {
		return isValidNumericLiteral(strings.TrimSuffix(strings.TrimPrefix(item, "N:"), ";"))
	}
	if item == "B:0;" || item == "B:1;" || item == "Z;" {
		return true
	}
	if len(item) >= 3 && item[1] == ':' && strings.HasSuffix(item, ";") && (item[0] == 'S' || item[0] == 'Q' || item[0] == 'L' || item[0] == 'M') {
		return pctPayloadPattern.MatchString(item[2 : len(item)-1])
	}
	return false
}

func lispListItems(payload string) ([]string, error) {
	text, err := pctDecode(payload)
	if err != nil {
		return nil, err
	}
	if text == "" {
		return []string{}, nil
	}
	items := strings.Split(text, "\n")
	for _, item := range items {
		if !isLispValue(item) {
			return nil, fmt.Errorf("Lisp list payload contains malformed item")
		}
	}
	return items, nil
}

func lispEncodeItems(items []string) string {
	return pctEncode(strings.Join(items, "\n"))
}

func lispKey(value string) (string, error) {
	if len(value) >= 3 && (strings.HasPrefix(value, "S:") || strings.HasPrefix(value, "Q:")) && strings.HasSuffix(value, ";") && pctPayloadPattern.MatchString(value[2:len(value)-1]) {
		return value, nil
	}
	return "", fmt.Errorf("Builtin 'lisp_map' expected string or symbol key")
}

func lispMapItems(payload string) (map[string]string, error) {
	text, err := pctDecode(payload)
	if err != nil {
		return nil, err
	}
	items := map[string]string{}
	if text == "" {
		return items, nil
	}
	for _, line := range strings.Split(text, "\n") {
		parts := strings.SplitN(line, "\t", 2)
		if len(parts) != 2 {
			return nil, fmt.Errorf("Lisp map payload contains malformed item")
		}
		key, err := lispKey(parts[0])
		if err != nil {
			return nil, err
		}
		if !isLispValue(parts[1]) {
			return nil, fmt.Errorf("Lisp map payload contains malformed value")
		}
		items[key] = parts[1]
	}
	return items, nil
}

func lispEncodeMap(items map[string]string) string {
	keys := make([]string, 0, len(items))
	for key := range items {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	lines := make([]string, 0, len(keys))
	for _, key := range keys {
		lines = append(lines, key+"\t"+items[key])
	}
	return pctEncode(strings.Join(lines, "\n"))
}

func lispMakeMap(values []string) (string, error) {
	if len(values)%2 != 0 {
		return "", fmt.Errorf("Builtin 'lisp_map' expected even key/value arguments")
	}
	items := map[string]string{}
	for i := 0; i < len(values); i += 2 {
		key, err := lispKey(values[i])
		if err != nil {
			return "", err
		}
		if !isLispValue(values[i+1]) {
			return "", fmt.Errorf("Builtin 'lisp_map' expected Lisp value")
		}
		items[key] = values[i+1]
	}
	return lispEncodeMap(items), nil
}

func lispMapKey(value string, builtin string) (string, error) {
	key, err := lispKey(value)
	if err != nil {
		return "", errors.New(strings.ReplaceAll(err.Error(), "lisp_map", builtin))
	}
	return key, nil
}

func lispListIndex(value string) (int, error) {
	n, err := parseNumber(value, "lisp_get")
	if err != nil {
		return 0, err
	}
	if !n.IsInt() {
		return 0, fmt.Errorf("Builtin 'lisp_get' expected integer index")
	}
	if n.Sign() < 0 {
		return 0, fmt.Errorf("Builtin 'lisp_get' expected non-negative index")
	}
	if !n.Num().IsInt64() {
		return 0, fmt.Errorf("Builtin 'lisp_get' index out of range")
	}
	idx64 := n.Num().Int64()
	maxInt := int64(^uint(0) >> 1)
	if idx64 > maxInt {
		return 0, fmt.Errorf("Builtin 'lisp_get' index out of range")
	}
	return int(idx64), nil
}

func isValidNumericLiteral(value string) bool {
	if !numericLiteralPattern.MatchString(value) {
		return false
	}
	_, err := parseNumber(value, "lisp value")
	return err == nil
}

func decodeLispStringLiteral(value string) (string, error) {
	if len(value) < 2 || !strings.HasPrefix(value, "\"") || !strings.HasSuffix(value, "\"") {
		return "", fmt.Errorf("Malformed Lisp string literal")
	}
	inner := value[1 : len(value)-1]
	var out strings.Builder
	for pos := 0; pos < len(inner); {
		ch := inner[pos]
		if ch != '\\' {
			out.WriteByte(ch)
			pos++
			continue
		}
		if pos+1 >= len(inner) {
			return "", fmt.Errorf("Malformed Lisp string escape")
		}
		switch inner[pos+1] {
		case 'n':
			out.WriteByte('\n')
		case '"':
			out.WriteByte('"')
		case '\\':
			out.WriteByte('\\')
		default:
			return "", fmt.Errorf("Malformed Lisp string escape")
		}
		pos += 2
	}
	return out.String(), nil
}

func lispQuoteAtom(value string) (string, error) {
	if numericLiteralPattern.MatchString(value) {
		if _, err := parseNumber(value, "lisp_quote"); err != nil {
			return "", err
		}
		return "N:" + value + ";", nil
	}
	if value == "true" {
		return "B:1;", nil
	}
	if value == "false" {
		return "B:0;", nil
	}
	if value == "nil" {
		return "Z;", nil
	}
	if strings.HasPrefix(value, "\"") {
		decoded, err := decodeLispStringLiteral(value)
		if err != nil {
			return "", err
		}
		return "S:" + pctEncode(decoded) + ";", nil
	}
	return "Q:" + pctEncode(value) + ";", nil
}

func lispQuoteExpr(expr string) (string, error) {
	text, err := pctDecode(expr)
	if err != nil {
		return "", err
	}
	var parseValue func(int) (string, int, error)
	parseValue = func(pos int) (string, int, error) {
		for pos < len(text) && (text[pos] == ' ' || text[pos] == '\t' || text[pos] == '\n' || text[pos] == '\r') {
			pos++
		}
		if pos >= len(text) {
			return "", pos, fmt.Errorf("Empty quoted Lisp expression")
		}
		if text[pos] == '(' {
			pos++
			items := []string{}
			for {
				for pos < len(text) && (text[pos] == ' ' || text[pos] == '\t' || text[pos] == '\n' || text[pos] == '\r') {
					pos++
				}
				if pos >= len(text) {
					return "", pos, fmt.Errorf("Unclosed quoted Lisp list")
				}
				if text[pos] == ')' {
					return "L:" + lispEncodeItems(items) + ";", pos + 1, nil
				}
				item, next, err := parseValue(pos)
				if err != nil {
					return "", pos, err
				}
				items = append(items, item)
				pos = next
			}
		}
		if text[pos] == '"' {
			start := pos
			pos++
			for pos < len(text) {
				if text[pos] == '\\' {
					pos += 2
					continue
				}
				if text[pos] == '"' {
					atom, err := lispQuoteAtom(text[start : pos+1])
					return atom, pos + 1, err
				}
				if text[pos] == '\n' {
					return "", pos, fmt.Errorf("Malformed Lisp string literal")
				}
				pos++
			}
			return "", pos, fmt.Errorf("Unclosed Lisp string literal")
		}
		start := pos
		for pos < len(text) && text[pos] != ' ' && text[pos] != '\t' && text[pos] != '\n' && text[pos] != '\r' && text[pos] != '(' && text[pos] != ')' {
			pos++
		}
		if start == pos {
			return "", pos, fmt.Errorf("Malformed quoted Lisp expression")
		}
		atom, err := lispQuoteAtom(text[start:pos])
		return atom, pos, err
	}
	value, pos, err := parseValue(0)
	if err != nil {
		return "", err
	}
	for pos < len(text) && (text[pos] == ' ' || text[pos] == '\t' || text[pos] == '\n' || text[pos] == '\r') {
		pos++
	}
	if pos != len(text) {
		return "", fmt.Errorf("Malformed quoted Lisp expression")
	}
	return value, nil
}

func lispShowValue(value string) (string, error) {
	if strings.HasPrefix(value, "N:") && strings.HasSuffix(value, ";") {
		return strings.TrimSuffix(strings.TrimPrefix(value, "N:"), ";"), nil
	}
	if value == "B:1;" {
		return "true", nil
	}
	if value == "B:0;" {
		return "false", nil
	}
	if value == "Z;" {
		return "nil", nil
	}
	if strings.HasPrefix(value, "S:") && strings.HasSuffix(value, ";") {
		inner, err := pctDecode(strings.TrimSuffix(strings.TrimPrefix(value, "S:"), ";"))
		if err != nil {
			return "", err
		}
		inner = strings.ReplaceAll(inner, `\`, `\\`)
		inner = strings.ReplaceAll(inner, `"`, `\"`)
		inner = strings.ReplaceAll(inner, "\n", `\n`)
		return `"` + inner + `"`, nil
	}
	if strings.HasPrefix(value, "Q:") && strings.HasSuffix(value, ";") {
		return pctDecode(strings.TrimSuffix(strings.TrimPrefix(value, "Q:"), ";"))
	}
	if strings.HasPrefix(value, "L:") && strings.HasSuffix(value, ";") {
		items, err := lispListItems(strings.TrimSuffix(strings.TrimPrefix(value, "L:"), ";"))
		if err != nil {
			return "", err
		}
		parts := make([]string, 0, len(items))
		for _, item := range items {
			shown, err := lispShowValue(item)
			if err != nil {
				return "", err
			}
			parts = append(parts, shown)
		}
		return "(" + strings.Join(parts, " ") + ")", nil
	}
	if strings.HasPrefix(value, "M:") && strings.HasSuffix(value, ";") {
		items, err := lispMapItems(strings.TrimSuffix(strings.TrimPrefix(value, "M:"), ";"))
		if err != nil {
			return "", err
		}
		keys := make([]string, 0, len(items))
		for key := range items {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		parts := make([]string, 0, len(keys)*2)
		for _, key := range keys {
			shownKey, err := lispShowValue(key)
			if err != nil {
				return "", err
			}
			shownValue, err := lispShowValue(items[key])
			if err != nil {
				return "", err
			}
			parts = append(parts, shownKey, shownValue)
		}
		if len(parts) == 0 {
			return "(map)", nil
		}
		return "(map " + strings.Join(parts, " ") + ")", nil
	}
	return "", fmt.Errorf("Lisp value is malformed")
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
	if name == "pctenc" {
		return pctEncode(values[0]), nil
	}
	if name == "pctdec" {
		return pctDecode(values[0])
	}
	if name == "lisp_len" {
		items, err := lispListItems(values[0])
		if err != nil {
			return "", err
		}
		return strconv.Itoa(len(items)), nil
	}
	if name == "lisp_get" {
		items, err := lispListItems(values[0])
		if err != nil {
			return "", err
		}
		idx, err := lispListIndex(values[1])
		if err != nil {
			return "", err
		}
		if idx >= len(items) {
			return "", fmt.Errorf("Builtin 'lisp_get' index out of range")
		}
		return items[idx], nil
	}
	if name == "lisp_head" {
		items, err := lispListItems(values[0])
		if err != nil {
			return "", err
		}
		if len(items) == 0 {
			return "", fmt.Errorf("Builtin 'lisp_head' expected non-empty list")
		}
		return items[0], nil
	}
	if name == "lisp_tail" {
		items, err := lispListItems(values[0])
		if err != nil {
			return "", err
		}
		if len(items) == 0 {
			return "", fmt.Errorf("Builtin 'lisp_tail' expected non-empty list")
		}
		return lispEncodeItems(items[1:]), nil
	}
	if name == "lisp_empty" {
		items, err := lispListItems(values[0])
		if err != nil {
			return "", err
		}
		if len(items) == 0 {
			return "1", nil
		}
		return "0", nil
	}
	if name == "lisp_push" {
		items, err := lispListItems(values[0])
		if err != nil {
			return "", err
		}
		if !isLispValue(values[1]) {
			return "", fmt.Errorf("Builtin 'lisp_push' expected Lisp value")
		}
		items = append(items, values[1])
		return lispEncodeItems(items), nil
	}
	if name == "lisp_show" {
		items, err := lispListItems(values[0])
		if err != nil {
			return "", err
		}
		parts := make([]string, 0, len(items))
		for _, item := range items {
			shown, err := lispShowValue(item)
			if err != nil {
				return "", err
			}
			parts = append(parts, shown)
		}
		return "(" + strings.Join(parts, " ") + ")", nil
	}
	if name == "lisp_map" {
		items, err := lispListItems(values[0])
		if err != nil {
			return "", err
		}
		return lispMakeMap(items)
	}
	if name == "lisp_has" {
		items, err := lispMapItems(values[0])
		if err != nil {
			return "", err
		}
		key, err := lispMapKey(values[1], "lisp_has")
		if err != nil {
			return "", err
		}
		if _, ok := items[key]; ok {
			return "1", nil
		}
		return "0", nil
	}
	if name == "lisp_mget" {
		items, err := lispMapItems(values[0])
		if err != nil {
			return "", err
		}
		key, err := lispMapKey(values[1], "lisp_get")
		if err != nil {
			return "", err
		}
		if value, ok := items[key]; ok {
			return value, nil
		}
		return "Z;", nil
	}
	if name == "lisp_put" {
		items, err := lispMapItems(values[0])
		if err != nil {
			return "", err
		}
		key, err := lispMapKey(values[1], "lisp_put")
		if err != nil {
			return "", err
		}
		if !isLispValue(values[2]) {
			return "", fmt.Errorf("Builtin 'lisp_put' expected Lisp value")
		}
		items[key] = values[2]
		return lispEncodeMap(items), nil
	}
	if name == "lisp_del" {
		items, err := lispMapItems(values[0])
		if err != nil {
			return "", err
		}
		key, err := lispMapKey(values[1], "lisp_del")
		if err != nil {
			return "", err
		}
		delete(items, key)
		return lispEncodeMap(items), nil
	}
	if name == "lisp_keys" {
		items, err := lispMapItems(values[0])
		if err != nil {
			return "", err
		}
		keys := make([]string, 0, len(items))
		for key := range items {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		return lispEncodeItems(keys), nil
	}
	if name == "lisp_mshow" {
		return lispShowValue("M:" + values[0] + ";")
	}
	if name == "lisp_quote_expr" {
		return lispQuoteExpr(values[0])
	}
	if name == "lisp_quote1" || name == "lisp_quote2" || name == "lisp_quote3" || name == "lisp_quote4" {
		items := make([]string, 0, len(values))
		for _, value := range values {
			item, err := lispQuoteAtom(value)
			if err != nil {
				return "", err
			}
			items = append(items, item)
		}
		return lispEncodeItems(items), nil
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

func (i *Interpreter) expandTemplate(template string, groups map[string]string, extra map[string]string) (string, error) {
	raw := map[string]string{}
	for k, v := range groups {
		raw[k] = v
	}
	for k, v := range extra {
		raw[k] = v
	}
	vars := map[string]string{}
	for k, v := range groups {
		vars[k] = strings.ReplaceAll(v, `\`, `\\`)
	}
	for k, v := range extra {
		vars[k] = strings.ReplaceAll(v, `\`, `\\`)
	}
	var out strings.Builder
	pos := 0
	for pos < len(template) {
		if strings.HasPrefix(template[pos:], "{{") {
			end := strings.Index(template[pos+2:], "}}")
			if end >= 0 {
				inside := template[pos+2 : pos+2+end]
				if strings.Contains(inside, "|") {
					parts := strings.Split(inside, "|")
					if len(parts) != 2 || !isWord(parts[0]) || parts[0][0] >= '0' && parts[0][0] <= '9' || !isWord(parts[1]) || parts[1][0] >= '0' && parts[1][0] <= '9' {
						return "", fmt.Errorf("Malformed template filter '{{%s}}'", inside)
					}
					value, ok := raw[parts[0]]
					if !ok {
						return "", fmt.Errorf("Missing template capture '%s'", parts[0])
					}
					switch parts[1] {
					case "pctenc":
						out.WriteString(pctEncode(value))
					case "pctdec":
						decoded, err := pctDecode(value)
						if err != nil {
							return "", err
						}
						out.WriteString(decoded)
					default:
						return "", fmt.Errorf("Unknown template filter '%s'", parts[1])
					}
					pos += 2 + end + 2
					continue
				}
				if isWord(inside) {
					out.WriteString(vars[inside])
					pos += 2 + end + 2
					continue
				}
			}
		}
		if strings.HasPrefix(template[pos:], "{{") {
			out.WriteByte(template[pos])
			pos++
			continue
		}
		literalStart := pos
		for pos < len(template) && !strings.HasPrefix(template[pos:], "{{") {
			pos++
		}
		out.WriteString(decodeReplacementEscapes(template[literalStart:pos]))
	}
	return out.String(), nil
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

func decodeReplacementEscapes(text string) string {
	ph := "\x00BACKSLASH\x00"
	text = strings.ReplaceAll(text, `\\`, ph)
	text = strings.ReplaceAll(text, `\n`, "\n")
	text = strings.ReplaceAll(text, `\t`, "\t")
	text = strings.ReplaceAll(text, `\r`, "\r")
	text = strings.ReplaceAll(text, ph, `\`)
	return text
}

func (i *Interpreter) expandDataTemplate(template string, groups map[string]string, extra map[string]string) (string, error) {
	raw := map[string]string{}
	for k, v := range groups {
		raw[k] = v
	}
	for k, v := range extra {
		raw[k] = v
	}
	var out strings.Builder
	pos := 0
	for pos < len(template) {
		if strings.HasPrefix(template[pos:], "{{") {
			end := strings.Index(template[pos+2:], "}}")
			if end >= 0 {
				inside := template[pos+2 : pos+2+end]
				if strings.Contains(inside, "|") {
					return "", fmt.Errorf("Filters are not supported inside ::%% templates")
				}
				if isWord(inside) && !(inside[0] >= '0' && inside[0] <= '9') {
					value, ok := raw[inside]
					if !ok {
						return "", fmt.Errorf("Missing template capture '%s'", inside)
					}
					decoded, err := pctDecode(value)
					if err != nil {
						return "", err
					}
					out.WriteString(decoded)
					pos += 2 + end + 2
					continue
				}
			}
		}
		if strings.HasPrefix(template[pos:], "{{") {
			out.WriteByte(template[pos])
			pos++
			continue
		}
		literalStart := pos
		for pos < len(template) && !strings.HasPrefix(template[pos:], "{{") {
			pos++
		}
		out.WriteString(decodeReplacementEscapes(template[literalStart:pos]))
	}
	return pctEncode(out.String()), nil
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

func formatDebugGroups(groups map[string]string) string {
	keys := make([]string, 0, len(groups))
	for key := range groups {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	parts := make([]string, 0, len(keys))
	for _, key := range keys {
		value := strings.ReplaceAll(groups[key], "\n", `\n`)
		value = strings.ReplaceAll(value, "\r", `\r`)
		parts = append(parts, key+":"+value)
	}
	return "map[" + strings.Join(parts, " ") + "]"
}

func (i *Interpreter) Run() (int, error) {
	for {
		type rowInfo struct {
			lineNumber int
			row        string
			start      int
			end        int
		}
		var rows []rowInfo
		offset := 0
		lineNumber := 1
		for offset < len(i.State) {
			segmentEnd := offset + strings.IndexByte(i.State[offset:], '\n') + 1
			if segmentEnd <= offset {
				segmentEnd = len(i.State)
			}
			segment := i.State[offset:segmentEnd]
			row := strings.TrimSuffix(strings.TrimSuffix(segment, "\n"), "\r")
			rows = append(rows, rowInfo{lineNumber: lineNumber, row: row, start: offset, end: segmentEnd})
			offset = segmentEnd
			lineNumber++
		}

		applied := false
		for rowIndex, info := range rows {
			rule, err := i.parseRuleCached(info.row, info.lineNumber, i.ProgramPath)
			if err != nil {
				return 1, err
			}
			if rule == nil {
				continue
			}
			if i.MaxEvals != nil && i.EvalCount >= *i.MaxEvals {
				return 1, fmt.Errorf("Rule probe limit (%d) exceeded", *i.MaxEvals)
			}
			i.EvalCount++

			targetStart := info.end
			for probeIndex := rowIndex + 1; probeIndex < len(rows); probeIndex++ {
				probe := rows[probeIndex]
				trimmed := strings.TrimSpace(probe.row)
				if trimmed == "" || strings.HasPrefix(trimmed, "#") {
					targetStart = probe.end
					continue
				}
				probeRule, err := i.parseRuleCached(probe.row, probe.lineNumber, i.ProgramPath)
				if err != nil {
					return 1, err
				}
				if probeRule == nil {
					break
				}
				targetStart = probe.end
			}

			suffix := i.State[targetStart:]
			m, ok := findMatch(*rule, suffix)
			if !ok {
				continue
			}
			applied = true
			groups := m.groups
			magicVars := map[string]string{"rule_index": strconv.Itoa(rowIndex)}
			if i.Debug {
				fmt.Fprintf(i.Stderr, "[%d] STATE: %s\n", i.EvalCount, strings.ReplaceAll(i.State, "\n", `\n`))
				fmt.Fprintf(i.Stderr, "[%d] ROW %d MATCHES DATA SUFFIX AT %d:%d: %s\n", i.EvalCount, info.lineNumber, targetStart+m.start, targetStart+m.end, rule.LHS)
				fmt.Fprintf(i.Stderr, "[%d] GROUPS: %s\n", i.EvalCount, formatDebugGroups(groups))
			}
			repl := ""
			switch rule.Operator {
			case Substitute:
				var err error
				repl, err = i.expandTemplate(rule.RHS, groups, magicVars)
				if err != nil {
					return 1, err
				}
				i.recordRuleCoverage(*rule)
			case Data:
				var err error
				repl, err = i.expandDataTemplate(rule.RHS, groups, magicVars)
				if err != nil {
					return 1, err
				}
				i.recordRuleCoverage(*rule)
			case Read:
				parts := strings.Fields(strings.TrimSpace(rule.RHS))
				if len(parts) != 2 {
					return 1, fmt.Errorf("Line %d: ::< requires read_spec and literal resource", rule.LineNumber)
				}
				readSpec, resource := parts[0], parts[1]
				if readSpec != "-1" {
					return 1, fmt.Errorf("Line %d: unsupported read spec '%s'", rule.LineNumber, readSpec)
				}
				if !isWord(resource) || resource[0] >= '0' && resource[0] <= '9' {
					return 1, fmt.Errorf("Line %d: ::< resource must be a literal binding name", rule.LineNumber)
				}
				b := i.Bindings[resource]
				if b == nil {
					return 1, fmt.Errorf("Unknown resource '%s'", resource)
				}
				content, er := i.readAll(b)
				if er != "" {
					return 1, errors.New(er)
				}
				repl = pctEncode(content)
				i.recordRuleCoverage(*rule)
			case Write:
				expanded, err := i.expandTemplate(rule.RHS, groups, magicVars)
				if err != nil {
					return 1, err
				}
				resource, content := splitResource(expanded)
				b := i.Bindings[resource]
				if b == nil {
					repl = "ERR:resource:" + resource
				} else {
					repl = i.writeString(b, content)
				}
				if b != nil && repl == "" {
					i.recordRuleCoverage(*rule)
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
				var err error
				repl, err = evalBuiltin(rule.BuiltinName, values)
				if err != nil {
					return 1, err
				}
				i.recordRuleCoverage(*rule)
			case Exit:
				codeStr := strings.TrimSpace(rule.RHS)
				if strings.HasPrefix(codeStr, "{") && strings.HasSuffix(codeStr, "}") {
					codeStr = codeStr[1 : len(codeStr)-1]
				}
				code, err := strconv.Atoi(codeStr)
				if err != nil {
					i.recordRuleCoverage(*rule)
					return 1, nil
				}
				i.recordRuleCoverage(*rule)
				return code, nil
			}
			newSuffix := suffix[:m.start] + repl + suffix[m.end:]
			if err := i.setState(i.State[:targetStart] + newSuffix); err != nil {
				return 1, err
			}
			if i.Debug {
				fmt.Fprintf(i.Stderr, "[%d] RESULT: %s\n\n", i.EvalCount, strings.ReplaceAll(i.State, "\n", `\n`))
			}
			break
		}
		if !applied {
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
