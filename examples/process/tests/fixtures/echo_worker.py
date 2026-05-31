#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
import sys

for line in sys.stdin:
    print(f"reply:{line.rstrip(chr(10)).rstrip(chr(13))}", flush=True)
