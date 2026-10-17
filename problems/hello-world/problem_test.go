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
		Cases: []harness.Case{{Name: "hello", Stdin: ""}},
		Reference: func(stdin string) (string, error) {
			if stdin != "" {
				return "", fmt.Errorf("hello-world reads no stdin")
			}
			return "Hello, World!\n", nil
		},
	}
}
