package gcd

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
		{Name: "zeros", Reads: harness.Stdin("0", "0")},
		{Name: "forty-eight", Reads: harness.Stdin("48", "18")},
		{Name: "seven", Reads: harness.Stdin("7", "1")},
	}
	for _, seed := range []uint64{3, 11, 21} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Reads: harness.Stdin(pair(seed, 100)...),
		})
	}
	return harness.Problem{
		ID: "greatest-common-divisor",
		Resources: []harness.Resource{
			{Name: "stdin", Read: true},
			{Name: "stdout", Write: true},
		},
		Cases:    cases,
		Baseline: baseline,
		Draw: func(t *rapid.T) harness.Case {
			a := rapid.IntRange(0, 100).Draw(t, "a")
			b := rapid.IntRange(0, 100).Draw(t, "b")
			return harness.Case{Name: "rapid", Reads: harness.Stdin(strconv.Itoa(a), strconv.Itoa(b))}
		},
	}
}

func pair(seed uint64, limit int) []string {
	r := rand.New(rand.NewPCG(seed, 1))
	return []string{strconv.Itoa(r.IntN(limit + 1)), strconv.Itoa(r.IntN(limit + 1))}
}

func baseline(reads map[string][]string) (harness.Outcome, error) {
	a, b, err := two(reads["stdin"], 100, "greatest-common-divisor")
	if err != nil {
		return harness.Outcome{}, err
	}
	for b != 0 {
		a, b = b, a%b
	}
	return harness.Stdout(fmt.Sprintf("%d\n", a)), nil
}

func two(lines []string, limit int, name string) (int, int, error) {
	if len(lines) != 2 {
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
