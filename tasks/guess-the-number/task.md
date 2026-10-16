# Guess the number

The first line is the secret. Each later line is a guess. Print the prompts and the replies, then stop at the correct guess.

```
Player 1, enter the secret:
Player 2, enter a guess:
Too low.
Player 2, enter a guess:
Too high.
Player 2, enter a guess:
Correct.
```

`Too low.` means the guess is below the secret. `Too high.` means it is above. The Go test checks one fixed script (secret 42) and two short games from seeds 1 and 6. Each game is a low guess, a high guess, then the secret.
