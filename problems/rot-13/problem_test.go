package rot13

import (
	"fmt"
	"math/rand/v2"
	"strings"
	"testing"

	"github.com/thuelang/thueplusplus/problems/harness"
	"pgregory.net/rapid"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func spec() harness.Problem {
	cases := []harness.Case{
		{Name: "hello", Reads: harness.Stdin("Hello, World!")},
		{Name: "punct", Reads: harness.Stdin("a.b")},
	}
	for _, seed := range []uint64{3, 11} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Reads: harness.Stdin(text(seed)),
		})
	}
	return harness.Problem{
		ID: "rot-13",
		Resources: []harness.Resource{
			{Name: "stdin", Read: true},
			{Name: "stdout", Write: true},
		},
		Cases:    cases,
		Baseline: baseline,
		Draw: func(t *rapid.T) harness.Case {
			alphabet := "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,! "
			n := rapid.IntRange(1, 12).Draw(t, "len")
			buf := make([]rune, n)
			for i := range buf {
				index := rapid.IntRange(0, len(alphabet)-1).Draw(t, fmt.Sprintf("c-%d", i))
				buf[i] = rune(alphabet[index])
			}
			return harness.Case{Name: "rapid", Reads: harness.Stdin(string(buf))}
		},
	}
}

func text(seed uint64) string {
	r := rand.New(rand.NewPCG(seed, 1))
	alphabet := []rune("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ.,! ")
	n := 4 + r.IntN(6)
	buf := make([]rune, n)
	for i := range buf {
		buf[i] = alphabet[r.IntN(len(alphabet))]
	}
	return string(buf)
}

func baseline(reads map[string][]string) (harness.Outcome, error) {
	lines := reads["stdin"]
	if len(lines) != 1 {
		return harness.Outcome{}, fmt.Errorf("rot-13 wants one line")
	}
	var b strings.Builder
	for _, c := range lines[0] {
		switch {
		case c >= 'a' && c <= 'z':
			b.WriteRune('a' + (c-'a'+13)%26)
		case c >= 'A' && c <= 'Z':
			b.WriteRune('A' + (c-'A'+13)%26)
		default:
			b.WriteRune(c)
		}
	}
	return harness.Stdout(b.String() + "\n"), nil
}
