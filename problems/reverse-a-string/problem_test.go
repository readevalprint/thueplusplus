package reverse

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
		{Name: "stressed", Stdin: "stressed\n"},
		{Name: "a", Stdin: "a\n"},
	}
	for _, seed := range []uint64{1, 2, 9} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Stdin: word(seed),
		})
	}
	return harness.Problem{
		ID:     "reverse-a-string",
		Cases:  cases, Reference: reference,
	}
}

func word(seed uint64) string {
	r := rand.New(rand.NewPCG(seed, 1))
	n := 3 + r.IntN(4)
	buf := make([]byte, n)
	for i := range buf {
		buf[i] = byte('a' + r.IntN(26))
	}
	return string(buf) + "\n"
}

func reference(stdin string) (string, error) {
	lines, err := harness.Lines(stdin)
	if err != nil || len(lines) != 1 {
		return "", fmt.Errorf("reverse-a-string wants one line of letters")
	}
	for _, c := range lines[0] {
		if c < 'A' || (c > 'Z' && c < 'a') || c > 'z' {
			return "", fmt.Errorf("reverse-a-string letter %q", c)
		}
	}
	runes := []rune(lines[0])
	for i, j := 0, len(runes)-1; i < j; i, j = i+1, j-1 {
		runes[i], runes[j] = runes[j], runes[i]
	}
	return string(runes) + "\n", nil
}
