package thue

import (
	"bufio"
	"encoding/base64"
	"encoding/json"
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
	zeroDenominatorPattern   = regexp.MustCompile(`^-?[0-9]+/0+$`)
	aliasDefPattern          = regexp.MustCompile(`^\s*([A-Z][A-Z0-9_]*)\s*<-\s*(.*)$`)
	invalidAliasTokenPattern = regexp.MustCompile(`<\|([A-Z][A-Z0-9_]*)\|>`)
	namedCapturePattern      = regexp.MustCompile(`\(\?(?:<|P<)([A-Za-z_][A-Za-z0-9_]*)>`)
)

const MaxNumericLiteralChars = 4096
const MaxPatternAliasSubstitutionsPerLine = 10000
const MaxExpandedPatternBytes = 1000000

type Rule struct {
	LHS        string
	Pattern    *regexp.Regexp
	Mids       []Mid
	Operator   Operator
	RHS        string
	LineNumber int
	SourcePath string
	// Source is the trimmed rule row. Rule count and rule chars are
	// properties of this text, not of a run.
	Source      string
	BuiltinName string
	BuiltinArgs []string
	// literalPrefix is text that begins every match. An empty prefix means
	// the engine has to run the regex. A miss skips the regex; the regex
	// still decides a hit, so anchors and groups stay exact.
	literalPrefix string
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
	Rules         []Rule
	State         string
	Bindings      map[string]*Binding
	MaxEvals      *int
	MaxStateBytes *int
	MaxSteps      *int
	EvalCount     int
	AppliedSteps  int
	// RegexEvals counts regex searches during Run. A literal-prefix miss
	// does not search. RegexMatches counts searches that find a match.
	// StateBytes is the sum of the UTF-8 state length at the start of Run
	// and after every applied rewrite. StatePeak is the maximum of those
	// lengths. Run resets these four. EvalCount is not reset.
	RegexEvals         int
	RegexMatches       int
	StateBytes         int
	StatePeak          int
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

const (
	// DefaultMaxEvals bounds rule probes for a host that did not set a limit.
	// A probe is one rule examined, including rules that do not match.
	DefaultMaxEvals = 1_000_000
	// DefaultMaxStateBytes bounds the UTF-8 state after a replacement.
	DefaultMaxStateBytes = 8 * 1024 * 1024
	// DefaultMaxSteps bounds applied rewrites. A rewrite is one rule that
	// matched and changed state. Exit rules do not count.
	DefaultMaxSteps = 1_000_000

	// ExitRuntime is a failure that is not a resource limit.
	ExitRuntime = 1
	// ExitStepLimit is returned when the next applied rewrite would pass MaxSteps.
	ExitStepLimit = 10
	// ExitEvalLimit is returned when the next rule probe would pass MaxEvals.
	ExitEvalLimit = 11
	// ExitStateLimit is returned when a replacement would pass MaxStateBytes.
	ExitStateLimit = 12
	// ExitReadTimeout is returned when a ::< read exceeds its timeout.
	ExitReadTimeout = 13
)

const (
	LimitSteps   = "steps"
	LimitEvals   = "evals"
	LimitState   = "state"
	LimitTimeout = "timeout"
)

// LimitError is a resource-limit stop. Error is the stderr message without
// the CLI's "Error: " prefix. Kind is steps, evals, state, or timeout.
type LimitError struct {
	Kind     string
	ExitCode int
	Message  string
}

func (e *LimitError) Error() string { return e.Message }

func newLimitError(kind string, code int, format string, args ...any) *LimitError {
	return &LimitError{Kind: kind, ExitCode: code, Message: fmt.Sprintf(format, args...)}
}

// ParseLimit parses a CLI limit. "unlimited" clears the limit. Any other
// value is a decimal integer. Zero is a real limit, not a synonym for unlimited.
func ParseLimit(text string) (*int, error) {
	if text == "unlimited" {
		return nil, nil
	}
	value, err := strconv.Atoi(text)
	if err != nil {
		return nil, err
	}
	return &value, nil
}

func NewWithHostResources(host HostResources) *Interpreter {
	evals := DefaultMaxEvals
	stateBytes := DefaultMaxStateBytes
	steps := DefaultMaxSteps
	i := &Interpreter{
		Bindings:           map[string]*Binding{},
		Stdout:             host.Stdout,
		Stderr:             host.Stderr,
		RuleCoverageCounts: map[string]int{},
		MaxEvals:           &evals,
		MaxStateBytes:      &stateBytes,
		MaxSteps:           &steps,
	}
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
		b.WriteString(fmt.Sprintf("# thue-source: %s:%d\n", sourcePath, lineNumber))
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
		b.WriteString(fmt.Sprintf("# thue-source: %s:%d\n", filePath, lineNumber))
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
		if strings.HasPrefix(trimmed, "# thue-source: ") {
			marker := strings.TrimPrefix(trimmed, "# thue-source: ")
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
		b.WriteString(fmt.Sprintf("# thue-source: %s:%d\n", row.SourcePath, row.SourceLine))
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
		if strings.HasPrefix(stripped, "# thue-source: ") {
			marker := strings.TrimPrefix(stripped, "# thue-source: ")
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
		if aliasMatch := aliasDefPattern.FindStringSubmatch(line); aliasMatch != nil && !hasTerminalOperator(line) {
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
		lhs, mids, op, rhs, ok, err := splitRuleLine(line)
		if err != nil {
			return "", fmt.Errorf("Line %d: %v", effectiveLine, err)
		}
		if ok {
			expandedLHS, err := expandAliasRefs(lhs, aliases, effectiveLine)
			if err != nil {
				return "", err
			}
			var rebuilt strings.Builder
			rebuilt.WriteString(expandedLHS)
			for _, mid := range mids {
				expandedMid, err := expandAliasRefs(mid, aliases, effectiveLine)
				if err != nil {
					return "", err
				}
				rebuilt.WriteString("::|")
				rebuilt.WriteString(expandedMid)
			}
			rebuilt.WriteString("::")
			rebuilt.WriteByte(op)
			rebuilt.WriteString(rhs)
			out = append(out, rebuilt.String())
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
		if strings.HasPrefix(trimmed, "# thue-source: ") {
			marker := strings.TrimPrefix(trimmed, "# thue-source: ")
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
	lhs, midTexts, opChar, rhs, ok, err := splitRuleLine(line)
	if err != nil {
		return nil, fmt.Errorf("Line %d: %v", lineNumber, err)
	}
	if !ok {
		if regexp.MustCompile(`(?:^|[^\\])::[^\s\w=<>!-]`).FindStringIndex(line) != nil {
			return nil, fmt.Errorf("Line %d: Invalid rule syntax: %s", lineNumber, line)
		}
		return nil, nil
	}
	lhs = strings.TrimRight(lhs, " \t")
	rhs = strings.TrimLeft(rhs, " \t")
	if lhs == "" {
		return nil, nil
	}
	var op Operator
	switch opChar {
	case '=':
		op = Substitute
	case '<':
		op = Read
	case '>':
		op = Write
	case '-':
		op = Exit
	case '!':
		op = Builtin
	default:
		return nil, fmt.Errorf("Line %d: Invalid rule syntax: %s", lineNumber, line)
	}
	mids := make([]Mid, 0, len(midTexts))
	for _, text := range midTexts {
		mid, err := parseMid(text, lineNumber)
		if err != nil {
			return nil, err
		}
		mids = append(mids, mid)
	}
	re, err := regexp.Compile("(?m)" + lhs)
	if err != nil {
		return nil, fmt.Errorf("Line %d: Invalid regex '%s': %v", lineNumber, lhs, err)
	}
	literalPrefix := literalPrefixOf(lhs)
	builtinName := ""
	var builtinArgs []string
	if op == Builtin {
		names := captureNames(re)
		for name := range midCaptureNames(mids) {
			names[name] = true
		}
		var err error
		builtinName, builtinArgs, err = parseBuiltinCall(rhs, lineNumber, names)
		if err != nil {
			return nil, err
		}
	}
	return &Rule{LHS: lhs, Pattern: re, Mids: mids, Operator: op, RHS: rhs, LineNumber: lineNumber, SourcePath: sourcePath, Source: trimmed, BuiltinName: builtinName, BuiltinArgs: builtinArgs, literalPrefix: literalPrefix}, nil
}

// RuleSourceStats reports the compiled rule count and the total UTF-8 bytes
// of the trimmed rule rows.
func (i *Interpreter) RuleSourceStats() (count int, chars int) {
	for _, rule := range i.Rules {
		count++
		chars += len(rule.Source)
	}
	return count, chars
}

// RunMetrics is the --metrics JSON object. Field order is the file order.
type RunMetrics struct {
	AppliedSteps int `json:"applied_steps"`
	RegexEvals   int `json:"regex_evals"`
	RegexMatches int `json:"regex_matches"`
	StateBytes   int `json:"state_bytes"`
	StatePeak    int `json:"state_peak"`
	RuleCount    int `json:"rule_count"`
	RuleChars    int `json:"rule_chars"`
}

// Metrics returns the counters for the most recent Run. Rule count and rule
// chars come from the trimmed rule rows. EvalCount is not included.
func (i *Interpreter) Metrics() RunMetrics {
	rules, chars := i.RuleSourceStats()
	return RunMetrics{
		AppliedSteps: i.AppliedSteps,
		RegexEvals:   i.RegexEvals,
		RegexMatches: i.RegexMatches,
		StateBytes:   i.StateBytes,
		StatePeak:    i.StatePeak,
		RuleCount:    rules,
		RuleChars:    chars,
	}
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

// parseReadRHS checks a ::< right-hand side. A read is exactly two tokens:
// a finite positive timeout in seconds, then a literal resource name.
func parseReadRHS(lineNumber int, rhs string) (string, time.Duration, error) {
	parts := strings.Fields(strings.TrimSpace(rhs))
	if len(parts) != 2 {
		return "", 0, fmt.Errorf("Line %d: ::< requires read_spec and literal resource", lineNumber)
	}
	readSpec, resource := parts[0], parts[1]
	seconds, err := strconv.ParseFloat(readSpec, 64)
	if err != nil || math.IsInf(seconds, 0) || math.IsNaN(seconds) || seconds <= 0 {
		return "", 0, fmt.Errorf("Line %d: invalid read timeout '%s'", lineNumber, readSpec)
	}
	if !isWord(resource) || resource[0] >= '0' && resource[0] <= '9' {
		return "", 0, fmt.Errorf("Line %d: ::< resource must be a literal binding name", lineNumber)
	}
	return resource, time.Duration(seconds * float64(time.Second)), nil
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

func (i *Interpreter) readLine(b *Binding, timeout time.Duration) (string, error) {
	if b.Resource == nil {
		return "", fmt.Errorf("ERR:resource:%s:missing host resource", b.Name)
	}
	content, err := b.Resource.ReadLine(timeout)
	if err != nil {
		if err.Error() == "timeout" {
			return "", newLimitError(LimitTimeout, ExitReadTimeout, "%s", formatResourceError(b.Name, err))
		}
		return "", fmt.Errorf("%s", formatResourceError(b.Name, err))
	}
	return content, nil
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
		return newLimitError(LimitState, ExitStateLimit, "State size (%d bytes) exceeds maximum (%d bytes)", len([]byte(s)), *i.MaxStateBytes)
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

func (i *Interpreter) recordTrace(rule Rule, ruleIndex int, match matchInfo, stateBefore, replacement string, exitCode *int) {
	i.recordTraceWithError(rule, ruleIndex, match, stateBefore, replacement, exitCode, "")
}

func (i *Interpreter) recordTraceWithError(rule Rule, ruleIndex int, match matchInfo, stateBefore, replacement string, exitCode *int, errorMessage string) {
	if !i.TraceEnabled {
		return
	}
	i.Trace = append(i.Trace, TraceEvent{
		Step:        i.EvalCount,
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

// traceWire is the --trace JSON object. Key order is the conformance contract.
type traceWire struct {
	Step        int    `json:"step"`
	RuleIndex   int    `json:"ruleIndex"`
	LineNumber  int    `json:"lineNumber"`
	Operator    string `json:"operator"`
	MatchStart  int    `json:"matchStart"`
	MatchEnd    int    `json:"matchEnd"`
	Error       string `json:"error"`
	StateBefore string `json:"stateBefore"`
	Replacement string `json:"replacement"`
	StateAfter  string `json:"stateAfter"`
	ExitCode    *int   `json:"exitCode"`
}

// FormatTrace writes one JSON object per event, each terminated by a newline.
// An empty log is an empty string. exitCode is null when the event is not ::-.
func FormatTrace(events []TraceEvent) (string, error) {
	if len(events) == 0 {
		return "", nil
	}
	var b strings.Builder
	enc := json.NewEncoder(&b)
	enc.SetEscapeHTML(false)
	for _, event := range events {
		wire := traceWire{
			Step:        event.Step,
			RuleIndex:   event.RuleIndex,
			LineNumber:  event.LineNumber,
			Operator:    string(event.Operator),
			MatchStart:  event.MatchStart,
			MatchEnd:    event.MatchEnd,
			Error:       event.Error,
			StateBefore: event.StateBefore,
			Replacement: event.Replacement,
			StateAfter:  event.StateAfter,
			ExitCode:    event.ExitCode,
		}
		if err := enc.Encode(wire); err != nil {
			return "", err
		}
	}
	return b.String(), nil
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

func (i *Interpreter) noteState() {
	n := len(i.State)
	i.StateBytes += n
	if n > i.StatePeak {
		i.StatePeak = n
	}
}

func (i *Interpreter) Run() (int, error) {
	i.AppliedSteps = 0
	i.RegexEvals = 0
	i.RegexMatches = 0
	i.StateBytes = 0
	i.StatePeak = 0
	i.Trace = nil
	i.noteState()
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
			if i.MaxEvals != nil && i.EvalCount >= *i.MaxEvals {
				return ExitEvalLimit, newLimitError(LimitEvals, ExitEvalLimit, "Evaluation step limit (%d) exceeded", *i.MaxEvals)
			}
			i.EvalCount++

			match, ok := i.findMatch(rule, i.State)
			if !ok {
				continue
			}
			stateBefore := i.State
			groups, midOK, err := i.applyMids(rule, match.groups)
			if err != nil {
				i.recordTraceWithError(rule, ruleIndex, match, stateBefore, "", nil, err.Error())
				return ExitRuntime, err
			}
			if !midOK {
				continue
			}
			match.groups = groups
			applied = true
			magicVars := map[string]string{"rule_index": strconv.Itoa(ruleIndex)}
			if i.Debug {
				fmt.Fprintf(i.Stderr, "[%d] STATE: %s\n", i.EvalCount, strings.ReplaceAll(i.State, "\n", `\n`))
				fmt.Fprintf(i.Stderr, "[%d] RULE %d MATCHES STATE AT %d:%d: %s\n", i.EvalCount, rule.LineNumber, match.start, match.end, rule.LHS)
				fmt.Fprintf(i.Stderr, "[%d] GROUPS: %s\n", i.EvalCount, formatDebugGroups(groups))
			}
			if rule.Operator != Exit && i.MaxSteps != nil && i.AppliedSteps >= *i.MaxSteps {
				return ExitStepLimit, newLimitError(LimitSteps, ExitStepLimit, "Applied step limit (%d) exceeded", *i.MaxSteps)
			}
			repl := ""
			switch rule.Operator {
			case Substitute:
				var err error
				repl, err = i.expandTemplate(rule.RHS, groups, magicVars)
				if err != nil {
					i.recordTraceWithError(rule, ruleIndex, match, stateBefore, "", nil, err.Error())
					return ExitRuntime, err
				}
				i.recordRuleCoverage(rule)
			case Read:
				resource, readTimeout, err := parseReadRHS(rule.LineNumber, rule.RHS)
				if err != nil {
					i.recordTraceWithError(rule, ruleIndex, match, stateBefore, "", nil, err.Error())
					return ExitRuntime, err
				}
				b := i.Bindings[resource]
				if b == nil {
					err := fmt.Errorf("Unknown resource '%s'", resource)
					i.recordTraceWithError(rule, ruleIndex, match, stateBefore, "", nil, err.Error())
					return ExitRuntime, err
				}
				content, readErr := i.readLine(b, readTimeout)
				if readErr != nil {
					i.recordTraceWithError(rule, ruleIndex, match, stateBefore, "", nil, readErr.Error())
					var limit *LimitError
					if errors.As(readErr, &limit) {
						return limit.ExitCode, limit
					}
					return ExitRuntime, readErr
				}
				repl = pctEncode(content)
				i.recordRuleCoverage(rule)
			case Write:
				expanded, err := i.expandTemplate(rule.RHS, groups, magicVars)
				if err != nil {
					i.recordTraceWithError(rule, ruleIndex, match, stateBefore, "", nil, err.Error())
					return ExitRuntime, err
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
						i.recordTraceWithError(rule, ruleIndex, match, stateBefore, "", nil, err.Error())
						return ExitRuntime, err
					}
					values = append(values, value)
				}
				var err error
				repl, err = evalBuiltin(rule.BuiltinName, values)
				if err != nil {
					i.recordTraceWithError(rule, ruleIndex, match, stateBefore, "", nil, err.Error())
					return ExitRuntime, err
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
					i.recordTrace(rule, ruleIndex, match, stateBefore, "", nil)
					return ExitRuntime, nil
				}
				i.recordRuleCoverage(rule)
				i.recordTrace(rule, ruleIndex, match, stateBefore, "", &code)
				return code, nil
			}
			if err := i.setState(i.State[:match.start] + repl + i.State[match.end:]); err != nil {
				i.recordTraceWithError(rule, ruleIndex, match, stateBefore, repl, nil, err.Error())
				var limit *LimitError
				if errors.As(err, &limit) {
					return limit.ExitCode, limit
				}
				return ExitRuntime, err
			}
			i.noteState()
			i.recordTrace(rule, ruleIndex, match, stateBefore, repl, nil)
			i.AppliedSteps++
			if i.MaxSteps != nil && i.AppliedSteps >= *i.MaxSteps {
				return ExitStepLimit, newLimitError(LimitSteps, ExitStepLimit, "Applied step limit (%d) exceeded", *i.MaxSteps)
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

func (i *Interpreter) findMatch(rule Rule, state string) (matchInfo, bool) {
	return i.findMatchFrom(rule, state, 0)
}

// literalPrefixOf is the literal text that begins every match of lhs.
// The runner compiles lhs under (?m). A leading ^ is zero-width, so Go's
// LiteralPrefix stops before the text the match actually starts with.
// Skipping that ^ recovers the prefix. A miss is not a match. A hit still
// goes through the original regexp, so anchors and captures stay put.
func literalPrefixOf(lhs string) string {
	// (?i) would make a case-sensitive Contains reject a match. No prefix then.
	if strings.Contains(lhs, "(?i") {
		return ""
	}
	body := lhs
	if strings.HasPrefix(body, "^") {
		body = body[1:]
	}
	re, err := regexp.Compile(body)
	if err != nil {
		return ""
	}
	prefix, _ := re.LiteralPrefix()
	return prefix
}

func (i *Interpreter) findMatchFrom(rule Rule, state string, pos int) (matchInfo, bool) {
	if pos > len(state) {
		return matchInfo{}, false
	}
	suffix := state[pos:]
	// Most probes miss. A literal prefix is decided with a byte search, which
	// is cheaper than the regexp interpreter, and a miss cannot be a match.
	// The regexp still runs on a possible hit so ^, $, and captures do not move.
	if rule.literalPrefix != "" && !strings.Contains(suffix, rule.literalPrefix) {
		return matchInfo{}, false
	}
	i.RegexEvals++
	idx := rule.Pattern.FindStringSubmatchIndex(suffix)
	if idx == nil {
		return matchInfo{}, false
	}
	i.RegexMatches++
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
