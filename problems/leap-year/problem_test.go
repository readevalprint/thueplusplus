package leap

import (
	"fmt"
	"math/rand/v2"
	"testing"

	"github.com/thuelang/thueplusplus/problems/harness"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func spec() harness.Problem {
	cases := []harness.Case{
		{Name: "nineteen", Stdin: "1900\n"},
		{Name: "two-thousand", Stdin: "2000\n"},
		{Name: "twenty-twenty-three", Stdin: "2023\n"},
		{Name: "twenty-twenty-four", Stdin: "2024\n"},
	}
	for _, seed := range []uint64{4, 100, 400} {
		r := rand.New(rand.NewPCG(seed, 1))
		year := r.IntN(2401)
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Stdin: fmt.Sprintf("%d\n", year),
		})
	}
	return harness.Problem{
		ID:     "leap-year",
		Limits: harness.Limits{MaxSteps: 20000, MaxEvals: 2000000, MaxStateBytes: 2097152, TimeoutSeconds: 30},
		Cases:  cases, Reference: reference,
	}
}

func reference(stdin string) (string, error) {
	year, err := harness.IntLine(stdin)
	if err != nil {
		return "", err
	}
	if year > 2400 {
		return "", fmt.Errorf("leap-year case %d is above 2400", year)
	}
	leap := year%400 == 0 || (year%4 == 0 && year%100 != 0)
	if leap {
		return "true\n", nil
	}
	return "false\n", nil
}
