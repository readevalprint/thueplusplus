// SPDX-License-Identifier: AGPL-3.0-or-later
package thuepp

import (
	"bufio"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"math"
	"math/big"
	"os"
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
	numericLiteralPattern    = regexp.MustCompile(`^-?(?:[0-9]+|[0-9]+\.[0-9]+|[0-9]+/[0-9]+)$`)
	rulePattern              = regexp.MustCompile(`^(.*?)(^|[^\\])::([=<>!-])(.*)$`)
	zeroDenominatorPattern   = regexp.MustCompile(`^-?[0-9]+/0+$`)
	aliasDefPattern          = regexp.MustCompile(`^\s*([A-Z][A-Z0-9_]*)\s*<-\s*(.*)$`)
	invalidAliasTokenPattern = regexp.MustCompile(`<\|([A-Z][A-Z0-9_]*)\|>`)
	namedCapturePattern      = regexp.MustCompile(`\(\?(?:<|P<)([A-Za-z_][A-Za-z0-9_]*)>`)
)

const MaxNumericLiteralChars = 4096
const MaxPatternAliasSubstitutionsPerLine = 10000
const MaxExpandedPatternBytes = 1000000

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

type sourceRow struct {
	Text       string
	SourcePath string
	SourceLine int
}

type Binding struct {
	Name          string
	PathOrCommand string
	Resource      runtimeResource
}

type TraceEvent struct {
	Step        int               `json:"step"`
	RuleIndex   int               `json:"ruleIndex"`
	SourcePath  string            `json:"sourcePath"`
	LineNumber  int               `json:"lineNumber"`
	Operator    Operator          `json:"operator"`
	LHS         string            `json:"lhs"`
	MatchStart  int               `json:"matchStart"`
	MatchEnd    int               `json:"matchEnd"`
	Groups      map[string]string `json:"groups"`
	StateBefore string            `json:"stateBefore"`
	Replacement string            `json:"replacement"`
	StateAfter  string            `json:"stateAfter"`
	ExitCode    *int              `json:"exitCode,omitempty"`
	Error       string            `json:"error,omitempty"`
}

type Interpreter struct {
	Rules              []Rule
	State              string
	Bindings           map[string]*Binding
	EvalLimit          *int
	MaxStateBytes      *int
	StepLimit          *int
	EvalCheckCount     int
	Debug              bool
	Stdout             io.Writer
	Stderr             io.Writer
	RuleCoveragePath   string
	RuleCoverageCounts map[string]int
	ProgramPath        string
	TraceEnabled       bool
	Trace              []TraceEvent
}

func New() *Interpreter {
	return NewWithHostResources(NativeHostResources())
}

func NewWithHostResources(host HostResources) *Interpreter {
	i := &Interpreter{Bindings: map[string]*Binding{}, Stdout: host.Stdout, Stderr: host.Stderr, RuleCoverageCounts: map[string]int{}}
	i.Bindings["stdin"] = &Binding{Name: "stdin", PathOrCommand: "stdin", Resource: newStdinResource("stdin", host.Stdin)}
	i.Bindings["stdout"] = &Binding{Name: "stdout", PathOrCommand: "stdout", Resource: &outputResource{writer: &i.Stdout}}
	i.Bindings["stderr"] = &Binding{Name: "stderr", PathOrCommand: "stderr", Resource: &outputResource{writer: &i.Stderr}}
	return i
}

func (i *Interpreter) AddProcBinding(name, command string) {
	i.Bindings[name] = &Binding{Name: name, PathOrCommand: command, Resource: newProcessResource(name, command)}
}

func (i *Interpreter) LoadProgram(programPath string) error {
	abs, err := filepath.Abs(programPath)
	if err != nil {
		return err
	}
	i.ProgramPath = abs
	content, err := loadSourceText(abs)
	if err != nil {
		return err
	}
	return i.parseProgram(content)
}

// LoadProgramText loads a program from in-memory source text. sourcePath is
// used for diagnostics and rule coverage IDs; it is not opened as a file.
func (i *Interpreter) LoadProgramText(sourcePath, content string) error {
	if strings.TrimSpace(sourcePath) == "" {
		return fmt.Errorf("source path is required")
	}
	i.ProgramPath = sourcePath
	annotated, err := annotateSourceText(sourcePath, content)
	if err != nil {
		return err
	}
	return i.parseProgram(annotated)
}

func annotateSourceText(sourcePath, content string) (string, error) {
	var b strings.Builder
	s := bufio.NewScanner(strings.NewReader(content))
	// allow long example lines
	s.Buffer(make([]byte, 0, 64*1024), 10*1024*1024)
	lineNumber := 0
	for s.Scan() {
		lineNumber++
		line := s.Text() + "\n"
		b.WriteString(fmt.Sprintf("# thuepp-source: %s:%d\n", sourcePath, lineNumber))
		b.WriteString(line)
	}
	return b.String(), s.Err()
}

func loadSourceText(filePath string) (string, error) {
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
		b.WriteString(fmt.Sprintf("# thuepp-source: %s:%d\n", filePath, lineNumber))
		b.WriteString(line)
	}
	return b.String(), s.Err()
}

func aliasLineNumber(fallbackLine int, currentSourceLine int) int {
	if currentSourceLine != 0 {
		return currentSourceLine
	}
	return fallbackLine
}

func splitAnnotatedLines(content string) []string {
	if content == "" {
		return nil
	}
	return strings.Split(strings.TrimSuffix(content, "\n"), "\n")
}

func iterSourceRows(content string, programPath string) []sourceRow {
	var rows []sourceRow
	currentSourcePath := programPath
	currentSourceLine := 0
	for lineNumber, line := range splitAnnotatedLines(content) {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "# thuepp-source: ") {
			marker := strings.TrimPrefix(trimmed, "# thuepp-source: ")
			if idx := strings.LastIndex(marker, ":"); idx >= 0 {
				if sourceLine, err := strconv.Atoi(marker[idx+1:]); err == nil {
					currentSourcePath = marker[:idx]
					currentSourceLine = sourceLine
				}
			}
			continue
		}
		sourceLine := currentSourceLine
		if sourceLine == 0 {
			sourceLine = lineNumber + 1
		}
		rows = append(rows, sourceRow{Text: line, SourcePath: currentSourcePath, SourceLine: sourceLine})
	}
	return rows
}

func annotatedContentFromRows(rows []sourceRow) string {
	var b strings.Builder
	for idx, row := range rows {
		if idx > 0 {
			b.WriteByte('\n')
		}
		b.WriteString(fmt.Sprintf("# thuepp-source: %s:%d\n", row.SourcePath, row.SourceLine))
		b.WriteString(row.Text)
	}
	return b.String()
}

func expandAliasRefs(pattern string, aliases map[string]string, lineNumber int) (string, error) {
	if match := invalidAliasTokenPattern.FindStringSubmatch(pattern); match != nil {
		name := match[1]
		return "", fmt.Errorf("Line %d: Invalid pattern alias token '<|%s|>'; use '$%s' aliases", lineNumber, name, name)
	}
	var out strings.Builder
	substitutions := 0
	for idx := 0; idx < len(pattern); {
		if pattern[idx] != '$' || (idx > 0 && pattern[idx-1] == '\\') {
			out.WriteByte(pattern[idx])
			idx++
			continue
		}
		end := idx + 1
		if end >= len(pattern) || pattern[end] < 'A' || pattern[end] > 'Z' {
			out.WriteByte(pattern[idx])
			idx++
			continue
		}
		end++
		for end < len(pattern) {
			ch := pattern[end]
			if (ch >= 'A' && ch <= 'Z') || (ch >= '0' && ch <= '9') || ch == '_' {
				end++
				continue
			}
			break
		}
		name := pattern[idx+1 : end]
		alias, ok := aliases[name]
		if !ok {
			return "", fmt.Errorf("Line %d: Unknown pattern alias '$%s'", lineNumber, name)
		}
		substitutions++
		if substitutions > MaxPatternAliasSubstitutionsPerLine {
			return "", fmt.Errorf("Line %d: Pattern alias expansion exceeded substitution limit (%d)", lineNumber, MaxPatternAliasSubstitutionsPerLine)
		}
		out.WriteString(alias)
		idx = end
	}
	expanded := out.String()
	if len([]byte(expanded)) > MaxExpandedPatternBytes {
		return "", fmt.Errorf("Line %d: Pattern alias expansion exceeded byte limit (%d)", lineNumber, MaxExpandedPatternBytes)
	}
	return expanded, nil
}

func expandPatterns(content string) (string, error) {
	aliases := map[string]string{}
	var out []string
	currentSourceLine := 0
	for idx, line := range splitAnnotatedLines(content) {
		lineNumber := idx + 1
		stripped := strings.TrimSpace(line)
		if strings.HasPrefix(stripped, "# thuepp-source: ") {
			marker := strings.TrimPrefix(stripped, "# thuepp-source: ")
			if colon := strings.LastIndex(marker, ":"); colon >= 0 {
				if sourceLine, err := strconv.Atoi(marker[colon+1:]); err == nil {
					currentSourceLine = sourceLine
				}
			}
			out = append(out, line)
			continue
		}
		effectiveLine := aliasLineNumber(lineNumber, currentSourceLine)
		if stripped == "" {
			out = append(out, line)
			continue
		}
		if aliasMatch := aliasDefPattern.FindStringSubmatch(line); aliasMatch != nil && rulePattern.FindStringSubmatch(line) == nil {
			name := aliasMatch[1]
			pat := strings.TrimSpace(aliasMatch[2])
			if _, exists := aliases[name]; exists {
				return "", fmt.Errorf("Line %d: Duplicate pattern alias '%s'", effectiveLine, name)
			}
			if namedCapturePattern.FindStringIndex(pat) != nil {
				return "", fmt.Errorf("Line %d: Pattern alias '%s' must not contain named captures", effectiveLine, name)
			}
			expanded, err := expandAliasRefs(pat, aliases, effectiveLine)
			if err != nil {
				return "", err
			}
			aliases[name] = "(?:" + expanded + ")"
			continue
		}
		if ruleMatch := rulePattern.FindStringSubmatch(line); ruleMatch != nil {
			lhs := ruleMatch[1] + ruleMatch[2]
			expandedLHS, err := expandAliasRefs(lhs, aliases, effectiveLine)
			if err != nil {
				return "", err
			}
			out = append(out, expandedLHS+"::"+ruleMatch[3]+ruleMatch[4])
			continue
		}
		out = append(out, line)
	}
	return strings.Join(out, "\n"), nil
}

func (i *Interpreter) parseProgram(content string) error {
	sourceRows := iterSourceRows(content, i.ProgramPath)
	separatorIndex := -1
	for idx, row := range sourceRows {
		if strings.TrimSpace(row.Text) == "::=" {
			separatorIndex = idx
			break
		}
	}
	prefixRows := sourceRows
	var stateRows []sourceRow
	if separatorIndex >= 0 {
		prefixRows = sourceRows[:separatorIndex]
		stateRows = sourceRows[separatorIndex+1:]
	}

	var err error
	content, err = expandPatterns(annotatedContentFromRows(prefixRows))
	if err != nil {
		return err
	}
	i.Rules = nil
	currentSourcePath := i.ProgramPath
	currentSourceLine := 0
	for idx, line := range splitAnnotatedLines(content) {
		lineNumber := idx + 1
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "# thuepp-source: ") {
			marker := strings.TrimPrefix(trimmed, "# thuepp-source: ")
			if idx := strings.LastIndex(marker, ":"); idx >= 0 {
				if sourceLine, err := strconv.Atoi(marker[idx+1:]); err == nil {
					currentSourcePath = marker[:idx]
					currentSourceLine = sourceLine
				}
			}
			continue
		}
		sourceLine := currentSourceLine
		if sourceLine == 0 {
			sourceLine = lineNumber
		}
		rule, err := parseRule(line, sourceLine, currentSourcePath)
		if err != nil {
			return err
		}
		if rule != nil {
			i.Rules = append(i.Rules, *rule)
		}
	}
	stateText := make([]string, 0, len(stateRows))
	for _, row := range stateRows {
		stateText = append(stateText, row.Text)
	}
	i.State = strings.Join(stateText, "\n")
	return nil
}

func parseRule(line string, lineNumber int, sourcePath string) (*Rule, error) {
	trimmed := strings.TrimSpace(line)
	if trimmed == "" || trimmed == "::=" {
		return nil, nil
	}
	matches := rulePattern.FindStringSubmatch(line)
	if matches == nil {
		if regexp.MustCompile(`(?:^|[^\\])::[^\s\w=<>!-]`).FindStringIndex(line) != nil {
			return nil, fmt.Errorf("Line %d: Invalid rule syntax: %s", lineNumber, line)
		}
		return nil, nil
	}
	lhs := strings.TrimRight(matches[1]+matches[2], " \t")
	rhs := strings.TrimLeft(matches[4], " \t")
	var op Operator
	switch matches[3] {
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
	default:
		return nil, fmt.Errorf("Line %d: Invalid rule syntax: %s", lineNumber, line)
	}
	if lhs == "" {
		return nil, nil
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

func (i *Interpreter) ApplyInputOverride(value string) error {
	i.State = value
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
		"eq":       2,
		"add":      2,
		"sub":      2,
		"mul":      2,
		"div":      2,
		"mod":      2,
		"numeq":    2,
		"lt":       2,
		"le":       2,
		"gt":       2,
		"ge":       2,
		"num":      1,
		"b64enc":   1,
		"b64dec":   1,
		"pctenc":   1,
		"pctdec":   1,
		"escape":   1,
		"unescape": 1,
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

func escapePctPayload(value string) (string, error) {
	text, err := pctDecode(value)
	if err != nil {
		return "", err
	}
	var out strings.Builder
	for _, r := range text {
		switch r {
		case '\\':
			out.WriteString(`\\`)
		case '"':
			out.WriteString(`\"`)
		case '\n':
			out.WriteString(`\n`)
		case '\t':
			out.WriteString(`\t`)
		case '\r':
			out.WriteString(`\r`)
		case '\b':
			out.WriteString(`\b`)
		case '\f':
			out.WriteString(`\f`)
		default:
			out.WriteRune(r)
		}
	}
	return pctEncode(out.String()), nil
}

func unescapePctPayload(value string) (string, error) {
	text, err := pctDecode(value)
	if err != nil {
		return "", err
	}
	var out strings.Builder
	for pos := 0; pos < len(text); pos++ {
		ch := text[pos]
		if ch != '\\' {
			out.WriteByte(ch)
			continue
		}
		if pos+1 >= len(text) {
			return "", fmt.Errorf("Builtin 'unescape' has trailing backslash escape")
		}
		pos++
		switch text[pos] {
		case '\\':
			out.WriteByte('\\')
		case '"':
			out.WriteByte('"')
		case 'n':
			out.WriteByte('\n')
		case 't':
			out.WriteByte('\t')
		case 'r':
			out.WriteByte('\r')
		case 'b':
			out.WriteByte('\b')
		case 'f':
			out.WriteByte('\f')
		default:
			return "", fmt.Errorf("Builtin 'unescape' unsupported escape '\\%c'", text[pos])
		}
	}
	return pctEncode(out.String()), nil
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
	if arity, ok := builtinArity(name); !ok || len(values) != arity {
		return "", fmt.Errorf("internal error: invalid validated builtin %q with %d values", name, len(values))
	}
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
	if name == "escape" {
		return escapePctPayload(values[0])
	}
	if name == "unescape" {
		return unescapePctPayload(values[0])
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
	return "", fmt.Errorf("internal error: validated builtin %q has no evaluator", name)
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

func formatResourceError(name string, err error) string {
	if strings.HasPrefix(err.Error(), "WAIT:") {
		return err.Error()
	}
	if strings.HasPrefix(err.Error(), "pending_input") {
		return fmt.Sprintf("WAIT:resource:%s:pending_input", name)
	}
	if resourceErr, ok := err.(resourceError); ok && resourceErr.omitName {
		return fmt.Sprintf("ERR:resource:%v", err)
	}
	return fmt.Sprintf("ERR:resource:%s:%v", name, err)
}

func stripLineTerminator(line string) (string, bool) {
	if !strings.HasSuffix(line, "\n") {
		return "", false
	}
	line = strings.TrimSuffix(line, "\n")
	line = strings.TrimSuffix(line, "\r")
	return line, true
}

func (i *Interpreter) readLine(b *Binding, timeout time.Duration) (string, string) {
	if b.Resource == nil {
		return "", fmt.Sprintf("ERR:resource:%s:missing host resource", b.Name)
	}
	content, err := b.Resource.ReadLine(timeout)
	if err != nil {
		return "", formatResourceError(b.Name, err)
	}
	return content, ""
}

func (i *Interpreter) writeString(b *Binding, content string) string {
	if b.Resource == nil {
		return fmt.Sprintf("ERR:resource:%s:missing host resource", b.Name)
	}
	if err := b.Resource.WriteString(content); err != nil {
		return formatResourceError(b.Name, err)
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
	if i.RuleCoverageCounts == nil {
		i.RuleCoverageCounts = map[string]int{}
	}
	i.RuleCoverageCounts[i.ruleID(rule)]++
}

func cloneGroups(groups map[string]string) map[string]string {
	cloned := map[string]string{}
	for key, value := range groups {
		cloned[key] = value
	}
	return cloned
}

func (i *Interpreter) recordTrace(step int, rule Rule, ruleIndex int, match matchInfo, stateBefore, replacement string, exitCode *int) {
	i.recordTraceWithError(step, rule, ruleIndex, match, stateBefore, replacement, exitCode, "")
}

func (i *Interpreter) recordTraceWithError(step int, rule Rule, ruleIndex int, match matchInfo, stateBefore, replacement string, exitCode *int, errorMessage string) {
	if !i.TraceEnabled {
		return
	}
	i.Trace = append(i.Trace, TraceEvent{
		Step:        step,
		RuleIndex:   ruleIndex,
		SourcePath:  rule.SourcePath,
		LineNumber:  rule.LineNumber,
		Operator:    rule.Operator,
		LHS:         rule.LHS,
		MatchStart:  match.start,
		MatchEnd:    match.end,
		Groups:      cloneGroups(match.groups),
		StateBefore: stateBefore,
		Replacement: replacement,
		StateAfter:  i.State,
		ExitCode:    exitCode,
		Error:       errorMessage,
	})
}

// RuleCoverageTSV returns applied rule coverage as sorted TSV rows in the same
// format written by --rule-coverage: rule-id<TAB>count<LF>.
func (i *Interpreter) RuleCoverageTSV() string {
	ids := make([]string, 0, len(i.RuleCoverageCounts))
	for id := range i.RuleCoverageCounts {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	var b strings.Builder
	for _, id := range ids {
		fmt.Fprintf(&b, "%s\t%d\n", id, i.RuleCoverageCounts[id])
	}
	return b.String()
}

func (i *Interpreter) WriteRuleCoverage() error {
	if i.RuleCoveragePath == "" {
		return nil
	}
	if err := os.MkdirAll(filepath.Dir(i.RuleCoveragePath), 0755); err != nil {
		return err
	}
	return os.WriteFile(i.RuleCoveragePath, []byte(i.RuleCoverageTSV()), 0644)
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

type stateRow struct {
	lineNumber int
	row        string
	index      int
}

func (i *Interpreter) Run() (int, error) {
	appliedSteps := 0
	for {
		var rows []stateRow
		parts := strings.Split(i.State, "\n")
		if i.State == "" {
			parts = []string{}
		}
		for idx, row := range parts {
			rows = append(rows, stateRow{lineNumber: idx + 1, row: strings.TrimSuffix(row, "\r"), index: idx})
		}

		applied := false
		for ruleIndex, rule := range i.Rules {
			if i.EvalLimit != nil && i.EvalCheckCount >= *i.EvalLimit {
				return 1, fmt.Errorf("Evaluation limit (%d) exceeded", *i.EvalLimit)
			}
			i.EvalCheckCount++

			match, ok := findMatch(rule, i.State)
			if !ok {
				continue
			}
			applied = true
			appliedStep := appliedSteps + 1
			stateBefore := i.State
			groups := match.groups
			magicVars := map[string]string{"rule_index": strconv.Itoa(ruleIndex)}
			if i.Debug {
				fmt.Fprintf(i.Stderr, "[%d] STATE: %s\n", i.EvalCheckCount, strings.ReplaceAll(i.State, "\n", `\n`))
				fmt.Fprintf(i.Stderr, "[%d] RULE %d MATCHES STATE AT %d:%d: %s\n", i.EvalCheckCount, rule.LineNumber, match.start, match.end, rule.LHS)
				fmt.Fprintf(i.Stderr, "[%d] GROUPS: %s\n", i.EvalCheckCount, formatDebugGroups(groups))
			}
			repl := ""
			switch rule.Operator {
			case Substitute:
				var err error
				repl, err = i.expandTemplate(rule.RHS, groups, magicVars)
				if err != nil {
					i.recordTraceWithError(appliedStep, rule, ruleIndex, match, stateBefore, "", nil, err.Error())
					return 1, err
				}
				i.recordRuleCoverage(rule)
			case Read:
				parts := strings.Fields(strings.TrimSpace(rule.RHS))
				if len(parts) != 2 {
					err := fmt.Errorf("Line %d: ::< requires read_spec and literal resource", rule.LineNumber)
					i.recordTraceWithError(appliedStep, rule, ruleIndex, match, stateBefore, "", nil, err.Error())
					return 1, err
				}
				readSpec, resource := parts[0], parts[1]
				var readTimeout time.Duration
				seconds, err := strconv.ParseFloat(readSpec, 64)
				if err != nil || math.IsInf(seconds, 0) || math.IsNaN(seconds) || seconds <= 0 {
					err := fmt.Errorf("Line %d: invalid read timeout '%s'", rule.LineNumber, readSpec)
					i.recordTraceWithError(appliedStep, rule, ruleIndex, match, stateBefore, "", nil, err.Error())
					return 1, err
				}
				readTimeout = time.Duration(seconds * float64(time.Second))
				if !isWord(resource) || resource[0] >= '0' && resource[0] <= '9' {
					err := fmt.Errorf("Line %d: ::< resource must be a literal binding name", rule.LineNumber)
					i.recordTraceWithError(appliedStep, rule, ruleIndex, match, stateBefore, "", nil, err.Error())
					return 1, err
				}
				b := i.Bindings[resource]
				if b == nil {
					err := fmt.Errorf("Unknown resource '%s'", resource)
					i.recordTraceWithError(appliedStep, rule, ruleIndex, match, stateBefore, "", nil, err.Error())
					return 1, err
				}
				content, er := i.readLine(b, readTimeout)
				if er != "" {
					i.recordTraceWithError(appliedStep, rule, ruleIndex, match, stateBefore, "", nil, er)
					return 1, errors.New(er)
				}
				repl = pctEncode(content)
				i.recordRuleCoverage(rule)
			case Write:
				expanded, err := i.expandTemplate(rule.RHS, groups, magicVars)
				if err != nil {
					i.recordTraceWithError(appliedStep, rule, ruleIndex, match, stateBefore, "", nil, err.Error())
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
					i.recordRuleCoverage(rule)
				}
			case Builtin:
				values := make([]string, 0, len(rule.BuiltinArgs))
				for _, arg := range rule.BuiltinArgs {
					value, ok := groups[arg]
					if !ok {
						err := fmt.Errorf("Line %d: ::! argument '%s' was not captured", rule.LineNumber, arg)
						i.recordTraceWithError(appliedStep, rule, ruleIndex, match, stateBefore, "", nil, err.Error())
						return 1, err
					}
					values = append(values, value)
				}
				var err error
				repl, err = evalBuiltin(rule.BuiltinName, values)
				if err != nil {
					i.recordTraceWithError(appliedStep, rule, ruleIndex, match, stateBefore, "", nil, err.Error())
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
					i.recordTrace(appliedStep, rule, ruleIndex, match, stateBefore, "", nil)
					return 1, nil
				}
				i.recordRuleCoverage(rule)
				i.recordTrace(appliedStep, rule, ruleIndex, match, stateBefore, "", &code)
				return code, nil
			}
			if err := i.setState(i.State[:match.start] + repl + i.State[match.end:]); err != nil {
				return 1, err
			}
			i.recordTrace(appliedStep, rule, ruleIndex, match, stateBefore, repl, nil)
			appliedSteps++
			if i.StepLimit != nil && appliedSteps >= *i.StepLimit {
				return 0, nil
			}
			if i.Debug {
				fmt.Fprintf(i.Stderr, "[%d] RESULT: %s\n\n", i.EvalCheckCount, strings.ReplaceAll(i.State, "\n", `\n`))
			}
			break
		}
		if !applied {
			return 0, nil
		}
	}
}

func findMatch(rule Rule, state string) (matchInfo, bool) {
	return findMatchFrom(rule, state, 0)
}

func findMatchFrom(rule Rule, state string, pos int) (matchInfo, bool) {
	if pos > len(state) {
		return matchInfo{}, false
	}
	suffix := state[pos:]
	idx := rule.Pattern.FindStringSubmatchIndex(suffix)
	if idx == nil {
		return matchInfo{}, false
	}
	names := rule.Pattern.SubexpNames()
	groups := map[string]string{}
	for n := 1; n < len(names) && 2*n+1 < len(idx); n++ {
		if names[n] != "" && idx[2*n] >= 0 {
			groups[names[n]] = suffix[idx[2*n]:idx[2*n+1]]
		}
	}
	return matchInfo{start: pos + idx[0], end: pos + idx[1], groups: groups}, true
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
		if b.Resource != nil {
			b.Resource.Cleanup()
		}
	}
}
