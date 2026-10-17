package guess

import (
	"fmt"
	"math/rand/v2"
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
	cases := []harness.Case{{
		Name: "scripted",
		Reads: map[string][]string{
			"random": {"42"},
			"stdin":  {"10", "80", "42"},
		},
	}}
	for _, seed := range []uint64{1, 6} {
		secret, guesses := script(seed)
		cases = append(cases, harness.Case{
			Name: fmt.Sprintf("seed-%d", seed), Seed: harness.Seed(seed),
			Reads: map[string][]string{"random": {secret}, "stdin": guesses},
		})
	}
	return harness.Problem{
		ID: "guess-the-number",
		Resources: []harness.Resource{
			{Name: "random", Read: true},
			{Name: "stdin", Read: true},
			{Name: "stdout", Write: true},
		},
		Cases:    cases,
		Baseline: baseline,
		Draw:     draw,
	}
}

func script(seed uint64) (string, []string) {
	r := rand.New(rand.NewPCG(seed, 1))
	secret := 2 + r.IntN(40)
	return strconv.Itoa(secret), []string{strconv.Itoa(secret - 1), strconv.Itoa(secret + 1), strconv.Itoa(secret)}
}

func draw(t *rapid.T) harness.Case {
	secret := rapid.IntRange(1, 80).Draw(t, "secret")
	misses := rapid.IntRange(0, 3).Draw(t, "misses")
	guesses := make([]string, 0, misses+1)
	for i := 0; i < misses; i++ {
		guess := rapid.IntRange(1, 80).Filter(func(n int) bool { return n != secret }).Draw(t, fmt.Sprintf("miss-%d", i))
		guesses = append(guesses, strconv.Itoa(guess))
	}
	guesses = append(guesses, strconv.Itoa(secret))
	return harness.Case{Name: "rapid", Reads: map[string][]string{
		"random": {strconv.Itoa(secret)},
		"stdin":  guesses,
	}}
}

func baseline(reads map[string][]string) (harness.Outcome, error) {
	secretLines := reads["random"]
	guessLines := reads["stdin"]
	if len(secretLines) != 1 || len(guessLines) == 0 {
		return harness.Outcome{}, fmt.Errorf("guess-the-number wants one secret and at least one guess")
	}
	secret, err := strconv.Atoi(secretLines[0])
	if err != nil || secret < 1 {
		return harness.Outcome{}, fmt.Errorf("bad secret %q", secretLines[0])
	}
	var b strings.Builder
	b.WriteString("Player 1, enter the secret:\n")
	matched := false
	for _, line := range guessLines {
		guess, err := strconv.Atoi(line)
		if err != nil {
			return harness.Outcome{}, fmt.Errorf("bad guess %q", line)
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
		return harness.Outcome{}, fmt.Errorf("the script never guesses the secret")
	}
	return harness.Stdout(b.String()), nil
}
