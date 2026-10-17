package factorial

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
		{Name: "ten", Stdin: "10\n"},
	}
	for _, seed := range []uint64{4, 6} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Stdin: fmt.Sprintf("%d\n", int(seed)),
		})
	}
	return harness.Problem{
		ID: "factorial",
		Limits: harness.Limits{
			MaxSteps: 50000, MaxEvals: 3000000, MaxStateBytes: 2097152, TimeoutSeconds: 30,
		},
		Cases: cases, Reference: reference,
	}
}

func reference(stdin string) (string, error) {
	n, err := harness.IntLine(stdin)
	if err != nil {
		return "", err
	}
	if n > 10 {
		return "", fmt.Errorf("factorial case %d is above 0..10", n)
	}
	acc := 1
	for i := 1; i <= n; i++ {
		acc *= i
	}
	return fmt.Sprintf("%d\n", acc), nil
}
