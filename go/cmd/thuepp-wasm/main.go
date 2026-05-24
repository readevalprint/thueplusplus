//go:build js && wasm

package main

import (
	"bytes"
	"fmt"
	"strconv"
	"strings"
	"syscall/js"
	"time"

	"thueplusplus/go/internal/thuepp"
)

type jsResource struct {
	name string
	obj  js.Value
}

func (r *jsResource) callString(method string, args ...any) (string, error) {
	fn := r.obj.Get(method)
	if fn.Type() != js.TypeFunction {
		return "", fmt.Errorf("callback %s.%s is required", r.name, method)
	}
	v := fn.Invoke(args...)
	if v.Type() == js.TypeUndefined || v.Type() == js.TypeNull {
		return "", nil
	}
	return jsValueToString(v)
}

func (r *jsResource) ReadLine(timeout time.Duration) (string, error) {
	return r.callString("readLine", timeout.Seconds())
}
func (r *jsResource) WriteString(content string) error {
	fn := r.obj.Get("write")
	if fn.Type() != js.TypeFunction {
		return fmt.Errorf("callback %s.write is required", r.name)
	}
	_, err := jsValueToString(fn.Invoke(content))
	return err
}
func (r *jsResource) Cleanup() {
	fn := r.obj.Get("close")
	if fn.Type() == js.TypeFunction {
		fn.Invoke()
	}
}

type wasmResult struct {
	ExitCode    int
	Stdout      string
	Stderr      string
	Error       string
	Errors      []string
	CoverageTSV string
	Trace       []thuepp.TraceEvent
	State       string
}

func main() {
	if smoke := js.Global().Get("ThuePPSmoke"); smoke.Type() == js.TypeObject {
		if smoke.Get("length").Type() == js.TypeNumber {
			results := make([]any, 0, smoke.Length())
			for idx := 0; idx < smoke.Length(); idx++ {
				results = append(results, resultToJS(run([]js.Value{smoke.Index(idx)})))
			}
			js.Global().Set("ThuePPSmokeResult", js.ValueOf(results))
			return
		}
		js.Global().Set("ThuePPSmokeResult", resultToJS(run([]js.Value{smoke})))
		return
	}
	api := map[string]any{"run": js.FuncOf(runPromise)}
	js.Global().Set("ThuePP", js.ValueOf(api))
	select {}
}

func runPromise(this js.Value, args []js.Value) any {
	promise := js.Global().Get("Promise")
	executor := js.FuncOf(func(this js.Value, pargs []js.Value) any {
		resolve := pargs[0]
		result := run(args)
		resolve.Invoke(resultToJS(result))
		return nil
	})
	return promise.New(executor)
}

func run(args []js.Value) wasmResult {
	if len(args) < 1 || args[0].Type() != js.TypeObject {
		return errorResult("run requires an options object")
	}
	opts := args[0]
	sourceText, err := requiredString(opts, "sourceText")
	if err != nil {
		return errorResult(err.Error())
	}
	sourcePath, err := optionalString(opts, "sourcePath", "wasm://source.tpp")
	if err != nil {
		return errorResult(err.Error())
	}
	var stdout, stderr bytes.Buffer
	interp := thuepp.NewWithHostResources(thuepp.HostResources{Stdin: strings.NewReader(""), Stdout: &stdout, Stderr: &stderr})
	if err := applyIntOption(opts, "maxEvals", &interp.MaxEvals); err != nil {
		return errorResult(err.Error())
	}
	if err := applyIntOption(opts, "maxStateBytes", &interp.MaxStateBytes); err != nil {
		return errorResult(err.Error())
	}
	if err := applyIntOption(opts, "stepLimit", &interp.MaxSteps); err != nil {
		return errorResult(err.Error())
	}
	interp.TraceEnabled = truthy(opts.Get("trace"))
	if resources := opts.Get("resources"); resources.Type() == js.TypeObject {
		keys := js.Global().Get("Object").Call("keys", resources)
		for idx := 0; idx < keys.Length(); idx++ {
			name := keys.Index(idx).String()
			if !isWord(name) || name[0] >= '0' && name[0] <= '9' {
				return errorResult(fmt.Sprintf("invalid resource binding name %q", name))
			}
			resourceObj := resources.Get(name)
			if resourceObj.Type() != js.TypeObject {
				return errorResult(fmt.Sprintf("resource %q must be an object", name))
			}
			interp.AddCallbackBinding(name, name, &jsResource{name: name, obj: resourceObj})
		}
	}
	if procs := opts.Get("procs"); procs.Type() == js.TypeObject {
		keys := js.Global().Get("Object").Call("keys", procs)
		for idx := 0; idx < keys.Length(); idx++ {
			name := keys.Index(idx).String()
			interp.AddProcBinding(name, procs.Get(name).String())
		}
	}
	if err := interp.LoadProgramText(sourcePath, sourceText); err != nil {
		return resultWithError(stdout.String(), stderr.String(), err.Error())
	}
	if input, err := optionalString(opts, "input", ""); err != nil {
		return errorResult(err.Error())
	} else if input != "" {
		if err := interp.ApplyInputOverride(input); err != nil {
			return resultWithError(stdout.String(), stderr.String(), err.Error())
		}
	}
	exitCode, runErr := interp.Run()
	interp.Cleanup()
	res := wasmResult{ExitCode: exitCode, Stdout: stdout.String(), Stderr: stderr.String(), State: interp.State}
	if runErr != nil {
		res.ExitCode = 1
		res.Error = runErr.Error()
		res.Errors = []string{runErr.Error()}
	}
	if truthy(opts.Get("coverage")) {
		res.CoverageTSV = interp.RuleCoverageTSV()
	}
	if interp.TraceEnabled {
		res.Trace = interp.Trace
	}
	return res
}

func resultToJS(r wasmResult) js.Value {
	obj := map[string]any{"exitCode": r.ExitCode, "stdout": r.Stdout, "stderr": r.Stderr, "errors": strings.Join(r.Errors, "\n"), "state": r.State}
	if r.Error != "" {
		obj["error"] = r.Error
	}
	if r.CoverageTSV != "" {
		obj["coverageTSV"] = r.CoverageTSV
	}
	if r.Trace != nil {
		trace := make([]any, 0, len(r.Trace))
		for _, event := range r.Trace {
			groups := map[string]any{}
			for key, value := range event.Groups {
				groups[key] = value
			}
			entry := map[string]any{
				"step":        event.Step,
				"ruleIndex":   event.RuleIndex,
				"sourcePath":  event.SourcePath,
				"lineNumber":  event.LineNumber,
				"operator":    string(event.Operator),
				"lhs":         event.LHS,
				"matchStart":  event.MatchStart,
				"matchEnd":    event.MatchEnd,
				"groups":      groups,
				"stateBefore": event.StateBefore,
				"replacement": event.Replacement,
				"stateAfter":  event.StateAfter,
			}
			if event.ExitCode != nil {
				entry["exitCode"] = *event.ExitCode
			}
			trace = append(trace, entry)
		}
		obj["trace"] = trace
	}
	return js.ValueOf(obj)
}

func errorResult(msg string) wasmResult { return resultWithError("", "", msg) }
func resultWithError(stdout, stderr, msg string) wasmResult {
	return wasmResult{ExitCode: 1, Stdout: stdout, Stderr: stderr, Error: msg, Errors: []string{msg}}
}

func jsValueToString(v js.Value) (string, error) {
	if v.Type() == js.TypeString {
		return v.String(), nil
	}
	if v.Type() == js.TypeNumber || v.Type() == js.TypeBoolean {
		return v.String(), nil
	}
	if v.Type() == js.TypeObject && v.Get("error").Type() != js.TypeUndefined {
		return "", fmt.Errorf(v.Get("error").String())
	}
	return "", fmt.Errorf("callback returned unsupported value type %s", v.Type().String())
}

func requiredString(obj js.Value, key string) (string, error) {
	v := obj.Get(key)
	if v.Type() != js.TypeString {
		return "", fmt.Errorf("%s is required", key)
	}
	return v.String(), nil
}

func optionalString(obj js.Value, key, fallback string) (string, error) {
	v := obj.Get(key)
	if v.Type() == js.TypeUndefined || v.Type() == js.TypeNull {
		return fallback, nil
	}
	if v.Type() != js.TypeString {
		return "", fmt.Errorf("%s must be a string", key)
	}
	if strings.TrimSpace(v.String()) == "" {
		return fallback, nil
	}
	return v.String(), nil
}

func applyIntOption(obj js.Value, key string, target **int) error {
	v := obj.Get(key)
	if v.Type() == js.TypeUndefined || v.Type() == js.TypeNull {
		return nil
	}
	var n int
	if v.Type() == js.TypeNumber {
		n = v.Int()
	} else if v.Type() == js.TypeString {
		parsed, err := strconv.Atoi(v.String())
		if err != nil {
			return fmt.Errorf("%s must be an integer", key)
		}
		n = parsed
	} else {
		return fmt.Errorf("%s must be an integer", key)
	}
	*target = &n
	return nil
}

func truthy(v js.Value) bool {
	switch v.Type() {
	case js.TypeUndefined, js.TypeNull:
		return false
	case js.TypeBoolean:
		return v.Bool()
	default:
		return true
	}
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
