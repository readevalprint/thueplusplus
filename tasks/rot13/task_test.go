package rot13

import (
	"fmt"
	"math/rand/v2"
	"strings"
	"testing"

	"github.com/readevalprint/thueplusplus/tasks/harness"
)

func TestROT13(t *testing.T) {
	harness.Run(t, spec())
}

func BenchmarkForth(b *testing.B) {
	harness.Bench(b, spec(), "forth")
}

func spec() harness.Task {
	cases := []harness.Case{
		{Name: "hello", Stdin: "Hello, World!\n"},
		{Name: "punct", Stdin: "a.b\n"},
	}
	for _, seed := range []uint64{3, 11} {
		cases = append(cases, harness.Case{
			Name:  fmt.Sprintf("seed-%d", seed),
			Seed:  harness.Seed(seed),
			Stdin: text(seed),
		})
	}
	return harness.Task{
		ID: "rot13",
		Limits: harness.Limits{
			MaxSteps: 200000, MaxEvals: 2000000, MaxStateBytes: 2097152, TimeoutSeconds: 30,
		},
		Cases:     cases,
		Reference: reference,
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
	return string(buf) + "\n"
}

func reference(stdin string) (string, error) {
	lines, err := harness.Lines(stdin)
	if err != nil || len(lines) != 1 {
		return "", fmt.Errorf("rot13 wants one line")
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
	return b.String() + "\n", nil
}
