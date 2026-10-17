package power

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
		{Name: "zero-zero", Reads: harness.Stdin("0", "0")},
		{Name: "two-eight", Reads: harness.Stdin("2", "8")},
		{Name: "five-zero", Reads: harness.Stdin("5", "0")},
		{Name: "zero-five", Reads: harness.Stdin("0", "5")},
	}
	for _, seed := range []uint64{1, 6, 9} {
		r := rand.New(rand.NewPCG(seed, 1))
		base := r.IntN(13)
		exp := r.IntN(9)
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed),
			Reads: harness.Stdin(strconv.Itoa(base), strconv.Itoa(exp)),
		})
	}
	return harness.Problem{
		ID: "exponentiation-operator",
		Resources: []harness.Resource{
			{Name: "stdin", Read: true},
			{Name: "stdout", Write: true},
		},
		Cases:    cases,
		Baseline: baseline,
		Draw: func(t *rapid.T) harness.Case {
			base := rapid.IntRange(0, 12).Draw(t, "base")
			exp := rapid.IntRange(0, 8).Draw(t, "exp")
			return harness.Case{Name: "rapid", Reads: harness.Stdin(strconv.Itoa(base), strconv.Itoa(exp))}
		},
	}
}

func baseline(reads map[string][]string) (harness.Outcome, error) {
	lines := reads["stdin"]
	if len(lines) != 2 {
		return harness.Outcome{}, fmt.Errorf("exponentiation-operator wants two lines")
	}
	base, err := canon(lines[0])
	if err != nil {
		return harness.Outcome{}, err
	}
	exp, err := canon(lines[1])
	if err != nil {
		return harness.Outcome{}, err
	}
	if base > 12 || exp > 8 {
		return harness.Outcome{}, fmt.Errorf("exponentiation-operator base is 0..12 and exponent is 0..8")
	}
	acc := 1
	for i := 0; i < exp; i++ {
		acc *= base
	}
	return harness.Stdout(fmt.Sprintf("%d\n", acc)), nil
}

func canon(text string) (int, error) {
	value, err := strconv.Atoi(text)
	if err != nil || value < 0 || (len(text) > 1 && text[0] == '0') {
		return 0, fmt.Errorf("canonical non-negative integer, got %q", text)
	}
	return value, nil
}
