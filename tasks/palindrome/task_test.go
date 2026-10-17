package palindrome

import (
	"fmt"
	"math/rand/v2"
	"testing"

	"github.com/thuelang/thueplusplus/tasks/harness"
)

func TestPalindrome(t *testing.T) {
	harness.Run(t, spec())
}

func BenchmarkForth(b *testing.B) {
	harness.Bench(b, spec(), "forth")
}

func spec() harness.Task {
	cases := []harness.Case{
		{Name: "zero", Stdin: "0\n"},
		{Name: "seven", Stdin: "7\n"},
		{Name: "ten", Stdin: "10\n"},
		{Name: "one-two-one", Stdin: "121\n"},
	}
	for _, seed := range []uint64{5, 13, 21} {
		r := rand.New(rand.NewPCG(seed, 1))
		n := r.IntN(1000)
		cases = append(cases, harness.Case{
			Name:  fmt.Sprintf("seed-%d", seed),
			Seed:  harness.Seed(seed),
			Stdin: fmt.Sprintf("%d\n", n),
		})
	}
	return harness.Task{
		ID: "palindrome",
		Limits: harness.Limits{
			MaxSteps: 50000, MaxEvals: 3000000, MaxStateBytes: 2097152, TimeoutSeconds: 30,
		},
		Cases:     cases,
		Reference: reference,
	}
}

func reference(stdin string) (string, error) {
	n, err := harness.IntLine(stdin)
	if err != nil {
		return "", err
	}
	if n > 999 {
		return "", fmt.Errorf("palindrome case %d is above 999", n)
	}
	text := fmt.Sprintf("%d", n)
	i, j := 0, len(text)-1
	for i < j {
		if text[i] != text[j] {
			return "false\n", nil
		}
		i++
		j--
	}
	return "true\n", nil
}
