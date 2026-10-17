package gcd

import (
	"fmt"
	"math/rand/v2"
	"strconv"
	"testing"

	"github.com/readevalprint/thueplusplus/problems/harness"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func spec() harness.Problem {
	cases := []harness.Case{
		{Name: "zeros", Stdin: "0\n0\n"},
		{Name: "forty-eight", Stdin: "48\n18\n"},
		{Name: "seven", Stdin: "7\n1\n"},
	}
	for _, seed := range []uint64{3, 11, 21} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Stdin: pair(seed, 100),
		})
	}
	return harness.Problem{
		ID:     "greatest-common-divisor",
		Limits: harness.Limits{MaxSteps: 50000, MaxEvals: 3000000, MaxStateBytes: 2097152, TimeoutSeconds: 30},
		Cases:  cases, Reference: reference,
	}
}

func pair(seed uint64, limit int) string {
	r := rand.New(rand.NewPCG(seed, 1))
	return fmt.Sprintf("%d\n%d\n", r.IntN(limit+1), r.IntN(limit+1))
}

func two(stdin string, limit int, name string) (int, int, error) {
	lines, err := harness.Lines(stdin)
	if err != nil || len(lines) != 2 {
		return 0, 0, fmt.Errorf("%s wants two lines", name)
	}
	a, err := canon(lines[0])
	if err != nil {
		return 0, 0, err
	}
	b, err := canon(lines[1])
	if err != nil {
		return 0, 0, err
	}
	if a > limit || b > limit {
		return 0, 0, fmt.Errorf("%s values must be 0..%d", name, limit)
	}
	return a, b, nil
}

func canon(text string) (int, error) {
	value, err := strconv.Atoi(text)
	if err != nil || value < 0 || (len(text) > 1 && text[0] == '0') {
		return 0, fmt.Errorf("canonical non-negative integer, got %q", text)
	}
	return value, nil
}

func reference(stdin string) (string, error) {
	a, b, err := two(stdin, 100, "greatest-common-divisor")
	if err != nil {
		return "", err
	}
	for b != 0 {
		a, b = b, a%b
	}
	return fmt.Sprintf("%d\n", a), nil
}
