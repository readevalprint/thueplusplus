package factorial

import (
	"fmt"
	"strconv"
	"testing"

	"github.com/thuelang/thueplusplus/problems/harness"
	"pgregory.net/rapid"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func spec() harness.Problem {
	cases := []harness.Case{
		{Name: "zero", Reads: harness.Stdin("0")},
		{Name: "one", Reads: harness.Stdin("1")},
		{Name: "ten", Reads: harness.Stdin("10")},
	}
	for _, seed := range []uint64{4, 6} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Reads: harness.Stdin(strconv.Itoa(int(seed))),
		})
	}
	return harness.Problem{
		ID: "factorial",
		Resources: []harness.Resource{
			{Name: "stdin", Read: true},
			{Name: "stdout", Write: true},
		},
		Cases:    cases,
		Baseline: baseline,
		Draw: func(t *rapid.T) harness.Case {
			n := rapid.IntRange(0, 10).Draw(t, "n")
			return harness.Case{Name: "rapid", Reads: harness.Stdin(strconv.Itoa(n))}
		},
	}
}

func baseline(reads map[string][]string) (harness.Outcome, error) {
	n, err := harness.OneInt(reads["stdin"])
	if err != nil {
		return harness.Outcome{}, err
	}
	if n > 10 {
		return harness.Outcome{}, fmt.Errorf("factorial case %d is above 0..10", n)
	}
	acc := 1
	for i := 1; i <= n; i++ {
		acc *= i
	}
	return harness.Stdout(fmt.Sprintf("%d\n", acc)), nil
}
