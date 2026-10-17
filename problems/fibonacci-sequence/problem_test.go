package fibonacci

import (
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"

	"github.com/thuelang/thueplusplus/problems/harness"
	"pgregory.net/rapid"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func TestHardcodedOutputFails(t *testing.T) {
	dir := t.TempDir()
	program := filepath.Join(dir, "constant.thue")
	source := "55 ::> stdout 55\n\n::=\n55\n"
	if err := os.WriteFile(program, []byte(source), 0o644); err != nil {
		t.Fatal(err)
	}
	item := harness.Case{Name: "seed-4", Seed: harness.Seed(4), Reads: harness.Stdin("4")}
	want, err := baseline(item.Reads)
	if err != nil {
		t.Fatal(err)
	}
	if want.Writes["stdout"] == "55\n" {
		t.Fatal("seed 4 is F(10); the guard would not catch a constant 55")
	}
	got, err := harness.ExecuteSolution(program, spec().Resources, item.Reads)
	if err != nil {
		t.Fatal(err)
	}
	message := harness.Compare("seed 4", got, want)
	if message == "" {
		t.Fatal("hard-coded 55 matched the baseline")
	}
	if !strings.Contains(message, "seed 4") {
		t.Fatalf("failure does not name the seed:\n%s", message)
	}
}

func spec() harness.Problem {
	cases := []harness.Case{
		{Name: "zero", Reads: harness.Stdin("0")},
		{Name: "one", Reads: harness.Stdin("1")},
		{Name: "two", Reads: harness.Stdin("2")},
		{Name: "ten", Reads: harness.Stdin("10")},
	}
	for _, seed := range []uint64{4, 7, 12} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Reads: harness.Stdin(strconv.Itoa(int(seed))),
		})
	}
	return harness.Problem{
		ID: "fibonacci-sequence",
		Resources: []harness.Resource{
			{Name: "stdin", Read: true},
			{Name: "stdout", Write: true},
		},
		Cases:    cases,
		Baseline: baseline,
		Draw: func(t *rapid.T) harness.Case {
			n := rapid.IntRange(0, 12).Draw(t, "n")
			return harness.Case{Name: "rapid", Reads: harness.Stdin(strconv.Itoa(n))}
		},
	}
}

func baseline(reads map[string][]string) (harness.Outcome, error) {
	n, err := harness.OneInt(reads["stdin"])
	if err != nil {
		return harness.Outcome{}, err
	}
	if n > 12 {
		return harness.Outcome{}, fmt.Errorf("fibonacci-sequence case %d is above 0..12", n)
	}
	a, b := 0, 1
	for i := 0; i < n; i++ {
		a, b = b, a+b
	}
	return harness.Stdout(fmt.Sprintf("%d\n", a)), nil
}
