package prime

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
		{Name: "two", Reads: harness.Stdin("2")},
		{Name: "four", Reads: harness.Stdin("4")},
		{Name: "nine", Reads: harness.Stdin("9")},
		{Name: "ninety-seven", Reads: harness.Stdin("97")},
	}
	for _, seed := range []uint64{8, 25, 50} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Reads: harness.Stdin(strconv.Itoa(int(seed))),
		})
	}
	return harness.Problem{
		ID: "primality-by-trial-division",
		Resources: []harness.Resource{
			{Name: "stdin", Read: true},
			{Name: "stdout", Write: true},
		},
		Cases:    cases,
		Baseline: baseline,
		Draw: func(t *rapid.T) harness.Case {
			n := rapid.IntRange(0, 100).Draw(t, "n")
			return harness.Case{Name: "rapid", Reads: harness.Stdin(strconv.Itoa(n))}
		},
	}
}

func baseline(reads map[string][]string) (harness.Outcome, error) {
	n, err := harness.OneInt(reads["stdin"])
	if err != nil {
		return harness.Outcome{}, err
	}
	if n > 100 {
		return harness.Outcome{}, fmt.Errorf("primality-by-trial-division case %d is above 100", n)
	}
	if n < 2 {
		return harness.Stdout("false\n"), nil
	}
	for d := 2; d*d <= n; d++ {
		if n%d == 0 {
			return harness.Stdout("false\n"), nil
		}
	}
	return harness.Stdout("true\n"), nil
}
