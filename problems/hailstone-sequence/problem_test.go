package hailstone

import (
	"fmt"
	"strings"
	"testing"

	"github.com/readevalprint/thueplusplus/problems/harness"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func spec() harness.Problem {
	cases := []harness.Case{
		{Name: "one", Stdin: "1\n"},
		{Name: "two", Stdin: "2\n"},
		{Name: "six", Stdin: "6\n"},
	}
	for _, seed := range []uint64{5, 11, 19} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Stdin: fmt.Sprintf("%d\n", int(seed)),
		})
	}
	return harness.Problem{
		ID:     "hailstone-sequence",
		Limits: harness.Limits{MaxSteps: 80000, MaxEvals: 3000000, MaxStateBytes: 2097152, TimeoutSeconds: 30},
		Cases:  cases, Reference: reference,
	}
}

func reference(stdin string) (string, error) {
	n, err := harness.IntLine(stdin)
	if err != nil {
		return "", err
	}
	if n < 1 || n > 20 {
		return "", fmt.Errorf("hailstone-sequence case %d is outside 1..20", n)
	}
	var b strings.Builder
	for {
		fmt.Fprintf(&b, "%d\n", n)
		if n == 1 {
			break
		}
		if n%2 == 0 {
			n /= 2
		} else {
			n = 3*n + 1
		}
	}
	return b.String(), nil
}
