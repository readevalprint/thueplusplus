package fizzbuzz

import (
	"fmt"
	"strconv"
	"strings"
	"testing"

	"github.com/thuelang/thueplusplus/problems/harness"
	"pgregory.net/rapid"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func spec() harness.Problem {
	cases := []harness.Case{
		{Name: "one", Reads: harness.Stdin("1")},
		{Name: "fifteen", Reads: harness.Stdin("15")},
	}
	for _, seed := range []uint64{3, 8, 20} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Reads: harness.Stdin(strconv.Itoa(int(seed))),
		})
	}
	return harness.Problem{
		ID: "fizzbuzz",
		Resources: []harness.Resource{
			{Name: "stdin", Read: true},
			{Name: "stdout", Write: true},
		},
		Cases:    cases,
		Baseline: baseline,
		Draw: func(t *rapid.T) harness.Case {
			n := rapid.IntRange(1, 20).Draw(t, "n")
			return harness.Case{Name: "rapid", Reads: harness.Stdin(strconv.Itoa(n))}
		},
	}
}

func baseline(reads map[string][]string) (harness.Outcome, error) {
	n, err := harness.OneInt(reads["stdin"])
	if err != nil {
		return harness.Outcome{}, err
	}
	if n < 1 || n > 20 {
		return harness.Outcome{}, fmt.Errorf("fizzbuzz case %d is outside 1..20", n)
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
	return harness.Stdout(b.String()), nil
}
