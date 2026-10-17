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

// readSentinel is the word the direct solution used to treat as its read
// marker. A stdin line of those two letters made the read rule match again
// and then fail with EOF. The generator never draws it. The fixed case does.
const readSentinel = "in"

func spec() harness.Problem {
	cases := []harness.Case{
		{Name: "stressed", Reads: harness.Stdin("stressed")},
		{Name: "a", Reads: harness.Stdin("a")},
		{Name: "in", Reads: harness.Stdin(readSentinel)},
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
			word := rapid.Custom(func(t *rapid.T) string {
				n := rapid.IntRange(1, 12).Draw(t, "len")
				buf := make([]byte, n)
				for i := range buf {
					buf[i] = byte('a' + rapid.IntRange(0, 25).Draw(t, fmt.Sprintf("c-%d", i)))
				}
				return string(buf)
			}).Filter(func(s string) bool { return s != readSentinel }).Draw(t, "word")
			return harness.Case{Name: "rapid", Reads: harness.Stdin(word)}
		},
	}
}

func word(seed uint64) string {
	r := rand.New(rand.NewPCG(seed, 1))
	for {
		n := 3 + r.IntN(4)
		buf := make([]byte, n)
		for i := range buf {
			buf[i] = byte('a' + r.IntN(26))
		}
		got := string(buf)
		if got != readSentinel {
			return got
		}
	}
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
