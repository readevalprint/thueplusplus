# Fibonacci

Read one non-negative integer `n` from stdin and print `F(n)` and a newline.

`F(0)` is 0, `F(1)` is 1, and each later value is the sum of the two before it.

The Go test in this directory builds the cases. Fixed edges are 0, 1, 2, and 10. Seeds 4, 7, and 12 are the other inputs, and every one is in `0..12`. The harness passes that integer on stdin. The program does not see the seed. A pass is an exact match with the reference in `task_test.go` on every case.
