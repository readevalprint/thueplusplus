package bottles

import (
	"fmt"
	"strings"
	"testing"

	"github.com/readevalprint/thueplusplus/problems/harness"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func spec() harness.Problem {
	cases := []harness.Case{
		{Name: "one", Stdin: "1\n"},
		{Name: "two", Stdin: "2\n"},
		{Name: "three", Stdin: "3\n"},
		{Name: "seed-4", Seed: harness.Seed(4), Stdin: "4\n"},
	}
	return harness.Problem{
		ID:     "99-bottles-of-beer",
		Limits: harness.Limits{MaxSteps: 200000, MaxEvals: 2000000, MaxStateBytes: 2097152, TimeoutSeconds: 30},
		Cases:  cases, Reference: reference,
	}
}

func reference(stdin string) (string, error) {
	n, err := harness.IntLine(stdin)
	if err != nil {
		return "", err
	}
	if n < 1 || n > 4 {
		return "", fmt.Errorf("99-bottles-of-beer case %d is outside 1..4", n)
	}
	var b strings.Builder
	for i := n; i >= 1; i-- {
		next := "no more bottles"
		if i > 1 {
			next = phrase(i - 1)
		}
		fmt.Fprintf(&b, "%s of beer on the wall, %s of beer.\nTake one down and pass it around, %s of beer on the wall.\n\n", phrase(i), phrase(i), next)
	}
	fmt.Fprintf(&b, "No more bottles of beer on the wall, no more bottles of beer.\nGo to the store and buy some more, %s of beer on the wall.\n", phrase(n))
	return b.String(), nil
}

func phrase(n int) string {
	if n == 1 {
		return "1 bottle"
	}
	return fmt.Sprintf("%d bottles", n)
}
