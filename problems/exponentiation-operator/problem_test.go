package power

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
		{Name: "zero-zero", Stdin: "0\n0\n"},
		{Name: "two-eight", Stdin: "2\n8\n"},
		{Name: "five-zero", Stdin: "5\n0\n"},
		{Name: "zero-five", Stdin: "0\n5\n"},
	}
	for _, seed := range []uint64{1, 6, 9} {
		r := rand.New(rand.NewPCG(seed, 1))
		base := r.IntN(13)
		exp := r.IntN(9)
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed),
			Stdin: fmt.Sprintf("%d\n%d\n", base, exp),
		})
	}
	return harness.Problem{
		ID:     "exponentiation-operator",
		Cases:  cases, Reference: reference,
	}
}

func reference(stdin string) (string, error) {
	lines, err := harness.Lines(stdin)
	if err != nil || len(lines) != 2 {
		return "", fmt.Errorf("exponentiation-operator wants two lines")
	}
	base, err := canon(lines[0])
	if err != nil {
		return "", err
	}
	exp, err := canon(lines[1])
	if err != nil {
		return "", err
	}
	if base > 12 || exp > 8 {
		return "", fmt.Errorf("exponentiation-operator base is 0..12 and exponent is 0..8")
	}
	acc := 1
	for i := 0; i < exp; i++ {
		acc *= base
	}
	return fmt.Sprintf("%d\n", acc), nil
}

func canon(text string) (int, error) {
	value, err := strconv.Atoi(text)
	if err != nil || value < 0 || (len(text) > 1 && text[0] == '0') {
		return 0, fmt.Errorf("canonical non-negative integer, got %q", text)
	}
	return value, nil
}
