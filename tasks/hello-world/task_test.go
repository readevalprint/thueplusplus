package hello

import (
	"testing"

	"github.com/readevalprint/thueplusplus/tasks/harness"
)

func TestHelloWorld(t *testing.T) {
	harness.Run(t, spec())
}

func BenchmarkForth(b *testing.B) {
	harness.Bench(b, spec(), "forth")
}

func spec() harness.Task {
	return harness.Task{
		ID: "hello-world",
		Limits: harness.Limits{
			MaxSteps: 200000, MaxEvals: 2000000, MaxStateBytes: 2097152, TimeoutSeconds: 30,
		},
		// The output is the whole task. One fixed case is the contract.
		Cases: []harness.Case{{Name: "hello", Stdin: ""}},
		Reference: func(stdin string) (string, error) {
			if stdin != "" {
				return "", errStdin
			}
			return "Hello, World!\n", nil
		},
	}
}

var errStdin = errString("hello-world reads no stdin")

type errString string

func (e errString) Error() string { return string(e) }
