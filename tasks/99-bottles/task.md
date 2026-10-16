# 99 bottles

Read one integer `n` from stdin and print the bottles song from `n` down to none, then a newline at the end of the last line.

`n` is the number you would buy at the store. One bottle is singular. Zero is `no more bottles`, and the first of those two words is capitalized only in the last verse. Verses are separated by a blank line.

The Go test checks 1, 2, 3, and seed 4. The inputs stay in `1..4`, so a hard-coded song of 99 verses does not pass.
