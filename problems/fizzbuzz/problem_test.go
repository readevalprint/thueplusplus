package fizzbuzz

import (
	"fmt"
	"strings"
	"testing"

	"github.com/thuelang/thueplusplus/problems/harness"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func spec() harness.Problem {
	cases := []harness.Case{
		{Name: "one", Stdin: "1\n"},
		{Name: "fifteen", Stdin: "15\n"},
	}
	for _, seed := range []uint64{3, 8, 20} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Stdin: fmt.Sprintf("%d\n", int(seed)),
		})
	}
	return harness.Problem{
		ID: "fizzbuzz",
		Limits: harness.Limits{
			MaxSteps: 200000, MaxEvals: 2000000, MaxStateBytes: 2097152, TimeoutSeconds: 30,
		},
		Cases: cases, Reference: reference,
	}
}

func reference(stdin string) (string, error) {
	n, err := harness.IntLine(stdin)
	if err != nil {
		return "", err
	}
	if n < 1 || n > 20 {
		return "", fmt.Errorf("fizzbuzz case %d is outside 1..20", n)
	}
	var b strings.Builder
	for i := 1; i <= n; i++ {
		switch {
		case i%15 == 0:
			b.WriteString("FizzBuzz\n")
		case i%3 == 0:
			b.WriteString("Fizz\n")
		case i%5 == 0:
			b.WriteString("Buzz\n")
		default:
			fmt.Fprintf(&b, "%d\n", i)
		}
	}
	return b.String(), nil
}
