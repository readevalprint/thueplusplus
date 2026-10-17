package bottles

import (
	"fmt"
	"strconv"
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
		{Name: "one", Reads: harness.Stdin("1")},
		{Name: "two", Reads: harness.Stdin("2")},
		{Name: "three", Reads: harness.Stdin("3")},
		{Name: "seed-4", Seed: harness.Seed(4), Reads: harness.Stdin("4")},
	}
	return harness.Problem{
		ID: "99-bottles-of-beer",
		Resources: []harness.Resource{
			{Name: "stdin", Read: true},
			{Name: "stdout", Write: true},
		},
		Cases:    cases,
		Baseline: baseline,
		Draw: func(t *rapid.T) harness.Case {
			n := rapid.IntRange(1, 4).Draw(t, "n")
			return harness.Case{Name: "rapid", Reads: harness.Stdin(strconv.Itoa(n))}
		},
	}
}

func baseline(reads map[string][]string) (harness.Outcome, error) {
	n, err := harness.OneInt(reads["stdin"])
	if err != nil {
		return harness.Outcome{}, err
	}
	if n < 1 || n > 4 {
		return harness.Outcome{}, fmt.Errorf("99-bottles-of-beer case %d is outside 1..4", n)
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
	return harness.Stdout(b.String()), nil
}

func phrase(n int) string {
	if n == 1 {
		return "1 bottle"
	}
	return fmt.Sprintf("%d bottles", n)
}
