package sum

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
		{Name: "three", Reads: harness.Stdin("3", "10", "20", "30")},
		{Name: "none", Reads: harness.Stdin("0")},
		{Name: "one", Reads: harness.Stdin("1", "5")},
	}
	for _, seed := range []uint64{2, 8} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Reads: harness.Stdin(list(seed)...),
		})
	}
	return harness.Problem{
		ID: "sum-and-product-of-an-array",
		Resources: []harness.Resource{
			{Name: "stdin", Read: true},
			{Name: "stdout", Write: true},
		},
		Cases:    cases,
		Baseline: baseline,
		Draw: func(t *rapid.T) harness.Case {
			n := rapid.IntRange(0, 8).Draw(t, "n")
			lines := []string{strconv.Itoa(n)}
			for i := 0; i < n; i++ {
				lines = append(lines, strconv.Itoa(rapid.IntRange(0, 49).Draw(t, fmt.Sprintf("v-%d", i))))
			}
			return harness.Case{Name: "rapid", Reads: harness.Stdin(lines...)}
		},
	}
}

func list(seed uint64) []string {
	r := rand.New(rand.NewPCG(seed, 1))
	n := 2 + r.IntN(4)
	lines := []string{strconv.Itoa(n)}
	for i := 0; i < n; i++ {
		lines = append(lines, strconv.Itoa(r.IntN(50)))
	}
	return lines
}

func baseline(reads map[string][]string) (harness.Outcome, error) {
	lines := reads["stdin"]
	if len(lines) == 0 {
		return harness.Outcome{}, fmt.Errorf("sum-and-product-of-an-array stdin is empty")
	}
	n, err := strconv.Atoi(lines[0])
	if err != nil || n < 0 || n > 8 || len(lines) != n+1 || (len(lines[0]) > 1 && lines[0][0] == '0') {
		return harness.Outcome{}, fmt.Errorf("sum-and-product-of-an-array wants a count 0..8 and that many integers")
	}
	total := 0
	for _, line := range lines[1:] {
		value, err := strconv.Atoi(line)
		if err != nil || value < 0 || (len(line) > 1 && line[0] == '0') {
			return harness.Outcome{}, fmt.Errorf("bad addend %q", line)
		}
		total += value
	}
	return harness.Stdout(fmt.Sprintf("%d\n", total)), nil
}
