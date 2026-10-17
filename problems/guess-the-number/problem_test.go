package guess

import (
	"fmt"
	"math/rand/v2"
	"strconv"
	"strings"
	"testing"

	"github.com/readevalprint/thueplusplus/problems/harness"
)

func TestProblem(t *testing.T) {
	harness.Run(t, spec())
}

func spec() harness.Problem {
	cases := []harness.Case{{Name: "scripted", Stdin: "42\n10\n80\n42\n"}}
	for _, seed := range []uint64{1, 6} {
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed), Stdin: script(seed),
		})
	}
	return harness.Problem{
		ID:     "guess-the-number",
		Limits: harness.Limits{MaxSteps: 200000, MaxEvals: 2000000, MaxStateBytes: 2097152, TimeoutSeconds: 30},
		Cases:  cases, Reference: reference,
	}
}

func script(seed uint64) string {
	r := rand.New(rand.NewPCG(seed, 1))
	secret := 2 + r.IntN(40)
	return fmt.Sprintf("%d\n%d\n%d\n%d\n", secret, secret-1, secret+1, secret)
}

func reference(stdin string) (string, error) {
	lines, err := harness.Lines(stdin)
	if err != nil || len(lines) < 2 {
		return "", fmt.Errorf("guess-the-number wants a secret and at least one guess")
	}
	secret, err := strconv.Atoi(lines[0])
	if err != nil || secret < 1 {
		return "", fmt.Errorf("bad secret %q", lines[0])
	}
	var b strings.Builder
	b.WriteString("Player 1, enter the secret:\n")
	matched := false
	for _, line := range lines[1:] {
		guess, err := strconv.Atoi(line)
		if err != nil {
			return "", fmt.Errorf("bad guess %q", line)
		}
		b.WriteString("Player 2, enter a guess:\n")
		switch {
		case guess < secret:
			b.WriteString("Too low.\n")
		case guess > secret:
			b.WriteString("Too high.\n")
		default:
			b.WriteString("Correct.\n")
			matched = true
		}
		if matched {
			break
		}
	}
	if !matched {
		return "", fmt.Errorf("the script never guesses the secret")
	}
	return b.String(), nil
}
