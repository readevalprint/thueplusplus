package sum

import (
	"fmt"
	"math/rand/v2"
	"strconv"
	"strings"
	"testing"

	"github.com/thuelang/thueplusplus/problems/harness"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func spec() harness.Problem {
	cases := []harness.Case{
		{Name: "three", Stdin: "3\n10\n20\n30\n"},
		{Name: "none", Stdin: "0\n"},
		{Name: "one", Stdin: "1\n5\n"},
	}
	for _, seed := range []uint64{2, 8} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Stdin: list(seed),
		})
	}
	return harness.Problem{
		ID:     "sum-and-product-of-an-array",
		Cases:  cases, Reference: reference,
	}
}

func list(seed uint64) string {
	r := rand.New(rand.NewPCG(seed, 1))
	n := 2 + r.IntN(4)
	var b strings.Builder
	fmt.Fprintf(&b, "%d\n", n)
	for i := 0; i < n; i++ {
		fmt.Fprintf(&b, "%d\n", r.IntN(50))
	}
	return b.String()
}

func reference(stdin string) (string, error) {
	lines, err := harness.Lines(stdin)
	if err != nil || len(lines) == 0 {
		return "", fmt.Errorf("sum-and-product-of-an-array stdin is empty")
	}
	n, err := strconv.Atoi(lines[0])
	if err != nil || n < 0 || n > 8 || len(lines) != n+1 {
		return "", fmt.Errorf("sum-and-product-of-an-array wants a count 0..8 and that many integers")
	}
	total := 0
	for _, line := range lines[1:] {
		value, err := strconv.Atoi(line)
		if err != nil || value < 0 || (len(line) > 1 && line[0] == '0') {
			return "", fmt.Errorf("bad addend %q", line)
		}
		total += value
	}
	return fmt.Sprintf("%d\n", total), nil
}
