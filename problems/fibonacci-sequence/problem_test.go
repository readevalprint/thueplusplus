package fibonacci

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/thuelang/thueplusplus/problems/harness"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func TestHardcodedOutputFails(t *testing.T) {
	dir := t.TempDir()
	program := filepath.Join(dir, "constant.tpp")
	source := "55 ::> stdout 55\n\n::=\n55\n"
	if err := os.WriteFile(program, []byte(source), 0o644); err != nil {
		t.Fatal(err)
	}
	item := harness.Case{Name: "seed-4", Seed: harness.Seed(4), Stdin: "4\n"}
	want, err := reference(item.Stdin)
	if err != nil {
		t.Fatal(err)
	}
	if want == "55\n" {
		t.Fatal("seed 4 is F(10); the guard would not catch a constant 55")
	}
	run := harness.RunProgram(program, item.Stdin, spec().Limits)
	message := harness.Failure(item, run, want)
	if message == "" {
		t.Fatal("hard-coded 55 matched the reference")
	}
	if !strings.Contains(message, "seed 4") {
		t.Fatalf("failure does not name the seed:\n%s", message)
	}
}

func spec() harness.Problem {
	cases := []harness.Case{
		{Name: "zero", Stdin: "0\n"},
		{Name: "one", Stdin: "1\n"},
		{Name: "two", Stdin: "2\n"},
		{Name: "ten", Stdin: "10\n"},
	}
	for _, seed := range []uint64{4, 7, 12} {
		cases = append(cases, harness.Case{
			Name:  fmt.Sprintf("seed-%d", seed),
			Seed:  harness.Seed(seed),
			Stdin: fmt.Sprintf("%d\n", int(seed)),
		})
	}
	return harness.Problem{
		ID: "fibonacci-sequence",
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
	if n > 12 {
		return "", fmt.Errorf("fibonacci-sequence case %d is above 0..12", n)
	}
	a, b := 0, 1
	for i := 0; i < n; i++ {
		a, b = b, a+b
	}
	return fmt.Sprintf("%d\n", a), nil
}
