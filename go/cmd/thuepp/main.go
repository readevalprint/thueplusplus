package main

import (
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
	program := args[0]
	interp := thuepp.New()
	inputSet := false

	for idx := 1; idx < len(args); {
		arg := args[idx]
		switch {
		case arg == "--debug":
			interp.Debug = true
			idx++
		case arg == "--input":
			if idx+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "Error: --input requires an argument")
				os.Exit(1)
			}
			interp.State = args[idx+1]
			inputSet = true
			idx += 2
		case strings.HasPrefix(arg, "--input="):
			interp.State = strings.TrimPrefix(arg, "--input=")
			inputSet = true
			idx++
		case arg == "--max-evals":
			if idx+1 >= len(args) {
				fmt.Fprintln(os.Stderr, "Error: --max-evals requires an argument")
				os.Exit(1)
			}
			v, err := strconv.Atoi(args[idx+1])
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(2)
			}
			interp.MaxEvals = &v
			idx += 2
		case strings.HasPrefix(arg, "--max-evals="):
			v, err := strconv.Atoi(strings.TrimPrefix(arg, "--max-evals="))
			if err != nil {
				fmt.Fprintln(os.Stderr, err)
				os.Exit(2)
			}
			interp.MaxEvals = &v
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
		case strings.HasPrefix(arg, "--file:"):
			name := strings.TrimPrefix(arg, "--file:")
			if idx+1 >= len(args) {
				fmt.Fprintf(os.Stderr, "Error: --file:%s requires a path argument\n", name)
				os.Exit(1)
			}
			interp.AddFileBinding(name, args[idx+1])
			idx += 2
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

	if err := interp.LoadProgram(program); err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		os.Exit(1)
	}
	if inputSet { // LoadProgram sets initial state; restore explicit override.
		for idx := 1; idx < len(args); idx++ {
			if args[idx] == "--input" && idx+1 < len(args) {
				interp.State = args[idx+1]
			}
			if strings.HasPrefix(args[idx], "--input=") {
				interp.State = strings.TrimPrefix(args[idx], "--input=")
			}
		}
	}
	code, err := interp.Run()
	if err != nil {
		fmt.Fprintf(os.Stderr, "Error: %v\n", err)
		code = 1
	}
	interp.Cleanup()
	os.Exit(code)
}

func usage() {
	fmt.Fprintln(os.Stderr, "usage: thuepp <program> [--file:<name> <path>]... [--proc:<name> <command>]... [--input <state>] [options]")
}
