#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-or-later
import subprocess, sys, pathlib
root = pathlib.Path('/workspaces/thueplusplus')
case_file = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 and sys.argv[1].endswith('.tsv') else pathlib.Path('/tmp/thuepp-lisp-pda/hard_acceptance_cases.tsv')
attempts = sys.argv[2:] if len(sys.argv) > 1 and sys.argv[1].endswith('.tsv') else sys.argv[1:]
if not attempts:
    attempts = ['/tmp/thuepp-lisp-pda/attempt-be-fixed-shape-lambda-let-boundary.tpp']
cases=[]
for line in case_file.read_text().splitlines():
    if line.strip():
        cases.append(line.split('\t'))
for attempt in attempts:
    print(f'## {pathlib.Path(attempt).name} on {case_file.name}')
    passed=0
    for name, inp, expected in cases:
        try:
            cp=subprocess.run(['uv','run','python','python/thuepp.py',attempt,'--input',inp,'--max-evals','80000'],cwd=root,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=8)
            out=cp.stdout.strip(); err=cp.stderr.strip()
            ok=cp.returncode==0 and out==expected and err==''
            print(('  PASS ' if ok else '  FAIL ')+f'{name}: rc={cp.returncode} out={out!r} err={err!r}')
            passed += int(ok)
        except subprocess.TimeoutExpired:
            print(f'  TIMEOUT {name}')
    print(f'  => {passed}/{len(cases)} passed\n')
