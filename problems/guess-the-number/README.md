---
title: Guess the number
---

The secret is one line from the `random` resource. Each line of `stdin` is a guess. Print `Player 1, enter the secret:` before reading the secret, and `Player 2, enter a guess:` before each guess. Then print `Too low.`, `Too high.`, or `Correct.`. Stop after the correct guess. Every line of output ends with a newline.

The Go test in this directory is the spec. It checks one scripted game and seeds 1 and 6. Each seed draws a secret and the guesses around it.

Adapted from the Rosetta Code task [Guess the number/With feedback (procedure)](https://rosettacode.org/wiki/Guess_the_number/With_feedback_(procedure)). That task is available under the GNU Free Documentation License 1.3.
