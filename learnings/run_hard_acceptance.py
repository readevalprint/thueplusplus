#!/usr/bin/env python3
import subprocess, sys, pathlib, shlex
root = pathlib.Path('/workspaces/thueplusplus')
cases = []
for line in pathlib.Path('/tmp/thuepp-lisp-pda/hard_acceptance_cases.tsv').read_text().splitlines():
    if not line.strip():
        continue
    name, inp, expected = line.split('\t')
    cases.append((name, inp, expected))

attempts = sys.argv[1:] or [
    '/tmp/thuepp-lisp-pda/attempt-ba-lisp.tpp',
    '/tmp/thuepp-lisp-pda/attempt-bb-lisp.tpp',
    '/tmp/thuepp-lisp-pda/attempt-ar-integrated-fuller-acceptance.tpp',
    '/tmp/thuepp-lisp-pda/attempt-ax-arbitrary-vtypes-strict-lazy-array.tpp',
]
for attempt in attempts:
    print(f'## {pathlib.Path(attempt).name}')
    passed = 0
    for name, inp, expected in cases:
        try:
            cp = subprocess.run(
                ['uv','run','python','python/thuepp.py',attempt,'--input',inp,'--max-evals','60000'],
                cwd=root,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                timeout=8,
            )
            out = cp.stdout.strip()
            err = cp.stderr.strip()
            ok = (cp.returncode == 0 and out == expected and err == '')
            if ok:
                passed += 1
                print(f'  PASS {name}')
            else:
                short = (err or out or f'exit {cp.returncode}')[:140].replace('\n','\\n')
                print(f'  FAIL {name}: rc={cp.returncode} out={out!r} err={err!r}')
        except subprocess.TimeoutExpired:
            print(f'  TIMEOUT {name}')
    print(f'  => {passed}/{len(cases)} passed\n')
