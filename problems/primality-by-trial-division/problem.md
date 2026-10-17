# Primality by trial division

Read one integer `n` from stdin and print `true` or `false` and a newline. `true` means `n` is prime. Trial division is the definition used here: `n` is prime when it is at least 2 and no integer from 2 through the square root of `n` divides it.

`n` is in `0..100`. The Go test checks 0, 1, 2, 4, 9, and 97, plus seeds 8, 25, and 50.

Adapted from the Rosetta Code task [Primality by trial division](https://rosettacode.org/wiki/Primality_by_trial_division). That task is available under the GNU Free Documentation License 1.3.
