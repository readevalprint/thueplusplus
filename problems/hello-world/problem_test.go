package hello

import (
	"fmt"
	"testing"

	"github.com/readevalprint/thueplusplus/problems/harness"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func spec() harness.Problem {
	return harness.Problem{
		ID: "hello-world",
		Limits: harness.Limits{
			MaxSteps: 200000, MaxEvals: 2000000, MaxStateBytes: 2097152, TimeoutSeconds: 30,
		},
		Cases: []harness.Case{{Name: "hello", Stdin: ""}},
		Reference: func(stdin string) (string, error) {
			if stdin != "" {
				return "", fmt.Errorf("hello-world reads no stdin")
			}
			return "Hello, World!\n", nil
		},
	}
}
