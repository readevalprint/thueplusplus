// SPDX-License-Identifier: AGPL-3.0-or-later
package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strconv"
	"strings"

	"thueplusplus/go/internal/thuepp"
)

func main() {
	args := os.Args[1:]
	if len(args) == 0 {
		usage()
		os.Exit(2)
	}
	scriptArgs := []string{}
	for idx, arg := range args {
		if arg == "--" {
			scriptArgs = args[idx+1:]
			args = args[:idx]
			break
		}
	}
	if len(args) == 0 {
		usage()
		os.Exit(2)
	}
	program := args[0]
	interp := thuepp.New()
	if err := interp.SetScriptArgs(scriptArgs); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	var inputOverride *string
	var inputFilePath *string
	ruleCoveragePath := ""
	metricsJSONPath := ""
	exportStatePath := ""
	listRules := false

	for idx := 1; idx < len(args); {
		arg := args[idx]
		switch {
		case arg == "--debug":
			interp.Debug = true
			idx++
		case arg == "--list-rules":
			listRules = true
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
		case arg == "--metrics-json":
			if idx+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "Error: --metrics-json requires an argument")
				os.Exit(1)
			}
			metricsJSONPath = args[idx+1]
			idx += 2
		case strings.HasPrefix(arg, "--metrics-json="):
			metricsJSONPath = strings.TrimPrefix(arg, "--metrics-json=")
			idx++
		case arg == "--export-state":
			if idx+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "Error: --export-state requires an argument")
				os.Exit(1)
			}
			exportStatePath = args[idx+1]
			idx += 2
		case strings.HasPrefix(arg, "--export-state="):
			exportStatePath = strings.TrimPrefix(arg, "--export-state=")
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
		case arg == "--input-file":
			if idx+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "Error: --input-file requires an argument")
				os.Exit(1)
			}
			value := args[idx+1]
			inputFilePath = &value
			idx += 2
		case strings.HasPrefix(arg, "--input-file="):
			value := strings.TrimPrefix(arg, "--input-file=")
			inputFilePath = &value
			idx++
		case arg == "--eval-limit":
			if idx+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "Error: --eval-limit requires an argument")
				os.Exit(1)
			}
			v, err := strconv.Atoi(args[idx+1])
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(2)
			}
			interp.EvalLimit = &v
			idx += 2
		case strings.HasPrefix(arg, "--eval-limit="):
			v, err := strconv.Atoi(strings.TrimPrefix(arg, "--eval-limit="))
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(2)
			}
			interp.EvalLimit = &v
			idx++
		case arg == "--max-state-bytes":
			if idx+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "Error: --max-state-bytes requires an argument")
				os.Exit(1)
			}
			v, err := strconv.Atoi(args[idx+1])
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(2)
			}
			interp.MaxStateBytes = &v
			idx += 2
		case strings.HasPrefix(arg, "--max-state-bytes="):
			v, err := strconv.Atoi(strings.TrimPrefix(arg, "--max-state-bytes="))
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(2)
			}
			interp.MaxStateBytes = &v
			idx++
		case strings.HasPrefix(arg, "--command:"):
			name := strings.TrimPrefix(arg, "--command:")
			if idx+1 >= len(args) {
				fmt.Fprintf(os.Stderr, "Error: --command:%s requires a command argument\n", name)
				os.Exit(1)
			}
			interp.AddCommandBinding(name, args[idx+1])
			idx += 2
		case strings.HasPrefix(arg, "--pipe:"):
			name := strings.TrimPrefix(arg, "--pipe:")
			if idx+1 >= len(args) {
				fmt.Fprintf(os.Stderr, "Error: --pipe:%s requires a command argument\n", name)
				os.Exit(1)
			}
			interp.AddPipeBinding(name, args[idx+1])
			idx += 2
		case strings.HasPrefix(arg, "--proc:"):
			fmt.Fprintln(os.Stderr, "Error: --proc:<name> is no longer supported; use --pipe:<name> or --command:<name>")
			os.Exit(1)
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
	if listRules {
		fmt.Print(interp.RuleListTSV())
		interp.Cleanup()
		return
	}
	if inputOverride != nil && inputFilePath != nil {
		fmt.Fprintln(os.Stderr, "Error: --input and --input-file are mutually exclusive")
		os.Exit(1)
	}
	if inputFilePath != nil { // Keep rules and replace file-provided state.
		contents, err := os.ReadFile(*inputFilePath)
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: failed to read --input-file %q: %v\n", *inputFilePath, err)
			os.Exit(1)
		}
		input := string(contents)
		if err := interp.ApplyInputOverride(input); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	} else if inputOverride != nil { // Keep rules and replace file-provided state.
		if err := interp.ApplyInputOverride(*inputOverride); err != nil {
			fmt.Fprintf(os.Stderr, "Error: %v\n", err)
			os.Exit(1)
		}
	}
	code, err := interp.Run()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		code = 1
	}
	if err := interp.WriteRuleCoverage(); err != nil {
		fmt.Fprintf(os.Stderr, "Error: failed to write rule coverage: %v\n", err)
		code = 1
	}
	if metricsJSONPath != "" {
		payload, err := json.Marshal(map[string]int{
			"successful_rewrites":    interp.SuccessfulRewrites,
			"eval_check_count":       interp.EvalCheckCount,
			"cumulative_state_bytes": interp.CumulativeStateBytes,
		})
		if err != nil {
			fmt.Fprintf(os.Stderr, "Error: failed to encode metrics: %v\n", err)
			code = 1
		} else if err := os.WriteFile(metricsJSONPath, append(payload, '\n'), 0644); err != nil {
			fmt.Fprintf(os.Stderr, "Error: failed to write metrics: %v\n", err)
			code = 1
		}
	}
	if exportStatePath != "" {
		if exportStatePath == "-" {
			if _, err := fmt.Fprint(os.Stdout, interp.State); err != nil {
				fmt.Fprintf(os.Stderr, "Error: failed to write export state: %v\n", err)
				code = 1
			}
		} else if err := os.WriteFile(exportStatePath, []byte(interp.State), 0644); err != nil {
			fmt.Fprintf(os.Stderr, "Error: failed to write export state: %v\n", err)
			code = 1
		}
	}
	interp.Cleanup()
	os.Exit(code)
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: thuepp <program> [--command:<name> <command>]... [--pipe:<name> <command>]... [--input <state>] [options] [-- <script args>...]")
}
