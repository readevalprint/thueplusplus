package prime

import (
	"fmt"
	"testing"

	"github.com/thuelang/thueplusplus/problems/harness"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func spec() harness.Problem {
	cases := []harness.Case{
		{Name: "zero", Stdin: "0\n"},
		{Name: "one", Stdin: "1\n"},
		{Name: "two", Stdin: "2\n"},
		{Name: "four", Stdin: "4\n"},
		{Name: "nine", Stdin: "9\n"},
		{Name: "ninety-seven", Stdin: "97\n"},
	}
	for _, seed := range []uint64{8, 25, 50} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Stdin: fmt.Sprintf("%d\n", int(seed)),
		})
	}
	return harness.Problem{
		ID:     "primality-by-trial-division",
		Limits: harness.Limits{MaxSteps: 80000, MaxEvals: 3000000, MaxStateBytes: 2097152, TimeoutSeconds: 30},
		Cases:  cases, Reference: reference,
	}
}

func reference(stdin string) (string, error) {
	n, err := harness.IntLine(stdin)
	if err != nil {
		return "", err
	}
	if n > 100 {
		return "", fmt.Errorf("primality-by-trial-division case %d is above 100", n)
	}
	if n < 2 {
		return "false\n", nil
	}
	for d := 2; d*d <= n; d++ {
		if n%d == 0 {
			return "false\n", nil
		}
	}
	return "true\n", nil
}
