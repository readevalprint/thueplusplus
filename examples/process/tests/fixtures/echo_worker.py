#!/usr/bin/env python3
import sys

for line in sys.stdin:
    print(f"reply:{line.rstrip(chr(10)).rstrip(chr(13))}", flush=True)
