package reverse

import (
	"fmt"
	"math/rand/v2"
	"testing"

	"github.com/thuelang/thueplusplus/problems/harness"
	"pgregory.net/rapid"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func spec() harness.Problem {
	cases := []harness.Case{
		{Name: "stressed", Reads: harness.Stdin("stressed")},
		{Name: "a", Reads: harness.Stdin("a")},
	}
	for _, seed := range []uint64{1, 2, 9} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Reads: harness.Stdin(word(seed)),
		})
	}
	return harness.Problem{
		ID: "reverse-a-string",
		Resources: []harness.Resource{
			{Name: "stdin", Read: true},
			{Name: "stdout", Write: true},
		},
		Cases:    cases,
		Baseline: baseline,
		Draw: func(t *rapid.T) harness.Case {
			n := rapid.IntRange(1, 12).Draw(t, "len")
			buf := make([]byte, n)
			for i := range buf {
				buf[i] = byte('a' + rapid.IntRange(0, 25).Draw(t, fmt.Sprintf("c-%d", i)))
			}
			return harness.Case{Name: "rapid", Reads: harness.Stdin(string(buf))}
		},
	}
}

func word(seed uint64) string {
	r := rand.New(rand.NewPCG(seed, 1))
	n := 3 + r.IntN(4)
	buf := make([]byte, n)
	for i := range buf {
		buf[i] = byte('a' + r.IntN(26))
	}
	return string(buf)
}

func baseline(reads map[string][]string) (harness.Outcome, error) {
	lines := reads["stdin"]
	if len(lines) != 1 {
		return harness.Outcome{}, fmt.Errorf("reverse-a-string wants one line of letters")
	}
	for _, c := range lines[0] {
		if c < 'A' || (c > 'Z' && c < 'a') || c > 'z' {
			return harness.Outcome{}, fmt.Errorf("reverse-a-string letter %q", c)
		}
	}
	runes := []rune(lines[0])
	for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
		runes[i], runes[j] = runes[j], runes[i]
	}
	return harness.Stdout(string(runes) + "\n"), nil
}
