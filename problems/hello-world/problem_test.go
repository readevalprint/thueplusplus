package hello

import (
	"fmt"
	"testing"

	"github.com/thuelang/thueplusplus/problems/harness"
	"pgregory.net/rapid"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func spec() harness.Problem {
	return harness.Problem{
		ID:        "hello-world",
		Resources: []harness.Resource{{Name: "stdout", Write: true}},
		Cases:     []harness.Case{{Name: "hello", Reads: map[string][]string{}}},
		Baseline: func(reads map[string][]string) (harness.Outcome, error) {
			if len(reads) != 0 {
				return harness.Outcome{}, fmt.Errorf("hello-world reads nothing")
			}
			return harness.Stdout("Hello, World!\n"), nil
		},
		Draw: func(*rapid.T) harness.Case {
			return harness.Case{Name: "rapid", Reads: map[string][]string{}}
		},
	}
}
