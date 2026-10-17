package palindrome

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
		{Name: "zero", Reads: harness.Stdin("0")},
		{Name: "seven", Reads: harness.Stdin("7")},
		{Name: "ten", Reads: harness.Stdin("10")},
		{Name: "one-two-one", Reads: harness.Stdin("121")},
	}
	for _, seed := range []uint64{5, 13, 21} {
		r := rand.New(rand.NewPCG(seed, 1))
		n := r.IntN(1000)
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Reads: harness.Stdin(strconv.Itoa(n)),
		})
	}
	return harness.Problem{
		ID: "palindrome-detection",
		Resources: []harness.Resource{
			{Name: "stdin", Read: true},
			{Name: "stdout", Write: true},
		},
		Cases:    cases,
		Baseline: baseline,
		Draw: func(t *rapid.T) harness.Case {
			n := rapid.IntRange(0, 999).Draw(t, "n")
			return harness.Case{Name: "rapid", Reads: harness.Stdin(strconv.Itoa(n))}
		},
	}
}

func baseline(reads map[string][]string) (harness.Outcome, error) {
	n, err := harness.OneInt(reads["stdin"])
	if err != nil {
		return harness.Outcome{}, err
	}
	if n > 999 {
		return harness.Outcome{}, fmt.Errorf("palindrome-detection case %d is above 999", n)
	}
	text := fmt.Sprintf("%d", n)
	i, j := 0, len(text)-1
	for i < j {
		if text[i] != text[j] {
			return harness.Stdout("false\n"), nil
		}
		i++
		j--
	}
	return harness.Stdout("true\n"), nil
}
