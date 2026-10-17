package leap

import (
	"fmt"
	"math/rand/v2"
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
		{Name: "nineteen", Reads: harness.Stdin("1900")},
		{Name: "two-thousand", Reads: harness.Stdin("2000")},
		{Name: "twenty-twenty-three", Reads: harness.Stdin("2023")},
		{Name: "twenty-twenty-four", Reads: harness.Stdin("2024")},
	}
	for _, seed := range []uint64{4, 100, 400} {
		r := rand.New(rand.NewPCG(seed, 1))
		year := r.IntN(2401)
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Reads: harness.Stdin(strconv.Itoa(year)),
		})
	}
	return harness.Problem{
		ID: "leap-year",
		Resources: []harness.Resource{
			{Name: "stdin", Read: true},
			{Name: "stdout", Write: true},
		},
		Cases:    cases,
		Baseline: baseline,
		Draw: func(t *rapid.T) harness.Case {
			year := rapid.IntRange(0, 2400).Draw(t, "year")
			return harness.Case{Name: "rapid", Reads: harness.Stdin(strconv.Itoa(year))}
		},
	}
}

func baseline(reads map[string][]string) (harness.Outcome, error) {
	year, err := harness.OneInt(reads["stdin"])
	if err != nil {
		return harness.Outcome{}, err
	}
	if year > 2400 {
		return harness.Outcome{}, fmt.Errorf("leap-year case %d is above 2400", year)
	}
	leap := year%400 == 0 || (year%4 == 0 && year%100 != 0)
	if leap {
		return harness.Stdout("true\n"), nil
	}
	return harness.Stdout("false\n"), nil
}
