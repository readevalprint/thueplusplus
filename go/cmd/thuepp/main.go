package main

import (
	"fmt"
	"os"
	"strings"

	"thueplusplus/go/internal/thuepp"
)

func main() {
	args := os.Args[1:]
	if len(args) == 0 {
		usage()
		os.Exit(2)
	}
	program := args[0]
	interp := thuepp.New()
	var inputOverride *string
	ruleCoveragePath := ""

	for idx := 1; idx < len(args); {
		arg := args[idx]
		switch {
		case arg == "--debug":
			interp.Debug = true
			idx++
		case arg == "--rule-coverage":
			if idx+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "Error: --rule-coverage requires an argument")
				os.Exit(1)
			}
			ruleCoveragePath = args[idx+1]
			idx += 2
		case strings.HasPrefix(arg, "--rule-coverage="):
			ruleCoveragePath = strings.TrimPrefix(arg, "--rule-coverage=")
			idx++
		case arg == "--input":
			if idx+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "Error: --input requires an argument")
				os.Exit(1)
			}
			value := args[idx+1]
			inputOverride = &value
			idx += 2
		case strings.HasPrefix(arg, "--input="):
			value := strings.TrimPrefix(arg, "--input=")
			inputOverride = &value
			idx++
		case arg == "--max-evals":
			if idx+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "Error: --max-evals requires an argument")
				os.Exit(1)
			}
			applyLimit(args[idx+1], &interp.MaxEvals)
			idx += 2
		case strings.HasPrefix(arg, "--max-evals="):
			applyLimit(strings.TrimPrefix(arg, "--max-evals="), &interp.MaxEvals)
			idx++
		case arg == "--max-state-bytes":
			if idx+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "Error: --max-state-bytes requires an argument")
				os.Exit(1)
			}
			applyLimit(args[idx+1], &interp.MaxStateBytes)
			idx += 2
		case strings.HasPrefix(arg, "--max-state-bytes="):
			applyLimit(strings.TrimPrefix(arg, "--max-state-bytes="), &interp.MaxStateBytes)
			idx++
		case arg == "--max-steps":
			if idx+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "Error: --max-steps requires an argument")
				os.Exit(1)
			}
			applyLimit(args[idx+1], &interp.MaxSteps)
			idx += 2
		case strings.HasPrefix(arg, "--max-steps="):
			applyLimit(strings.TrimPrefix(arg, "--max-steps="), &interp.MaxSteps)
			idx++
		case strings.HasPrefix(arg, "--proc:"):
			name := strings.TrimPrefix(arg, "--proc:")
			if idx+1 >= len(args) {
				fmt.Fprintf(os.Stderr, "Error: --proc:%s requires a command argument\n", name)
				os.Exit(1)
			}
			interp.AddProcBinding(name, args[idx+1])
			idx += 2
		default:
			fmt.Fprintf(os.Stderr, "Error: Unknown argument: %s\n", arg)
			os.Exit(1)
		}
	}

	interp.RuleCoveragePath = ruleCoveragePath
	if err := interp.LoadProgram(program); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	if inputOverride != nil { // Keep rules and replace file-provided state.
		if err := interp.ApplyInputOverride(*inputOverride); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	}
	code, err := interp.Run()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		if code == 0 {
			code = thuepp.ExitRuntime
		}
	}
	if err := interp.WriteRuleCoverage(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: failed to write rule coverage: %v\n", err)
		code = 1
	}
	interp.Cleanup()
	os.Exit(code)
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: thuepp <program> [--proc:<name> <command>]... [--input <state>] [options]")
}

func applyLimit(text string, target **int) {
	value, err := thuepp.ParseLimit(text)
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(2)
	}
	*target = value
}
